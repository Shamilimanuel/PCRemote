# The agent's HTTP API

The Reveille agent is a small HTTP server on your own network. The phone app is
one client; this document is for writing another — a Home Assistant
integration, a Tasker task, a shell script on a NAS.

Every example here was run against a real agent while writing it.

- **Address**: `http://<pc-ip>:5533`, plain HTTP. There is no TLS, and
  [Security notes](../README.md#security-notes) explains why that is not a
  shortcut and what stands in for it.
- **Local networks only.** Requests from anywhere that is not loopback,
  RFC1918 private, link-local, or Tailscale's `100.64.0.0/10` get `403` and
  nothing else — not even the web page.
- **One secret**, the pairing token. It is in `config.json` next to the agent,
  and it is what the QR code carries.

---

## Waking a machine is not part of this API

An agent cannot answer while its machine is off, so **Wake-on-LAN is a UDP
magic packet the client sends itself**, not a request to the agent. In Home
Assistant that is the built-in [`wake_on_lan`](https://www.home-assistant.io/integrations/wake_on_lan/)
service; elsewhere it is `wakeonlan`, `etherwake`, or nine bytes of `0xFF`
followed by the MAC repeated sixteen times, broadcast to port 9.

The MAC to send it to is in `/health` under `interfaces`, and the address to
broadcast to is that interface's `broadcast`.

---

## Authenticating

Two schemes are accepted. They are not equivalent, and which one to use is a
real decision rather than a preference.

### Signed requests — what to use

The token never leaves the machine. Each request carries a signature computed
with it, which is worthless for any other request.

```
Authorization: Reveille <unix seconds>.<nonce>.<hex HMAC-SHA256>
```

The signature is HMAC-SHA256, keyed on **the token exactly as written** (its
UTF-8 bytes, not decoded from hex), over this text — six lines, `\n` between
them, nothing optional:

```
REVEILLE-HMAC-SHA256
<METHOD, uppercase>
<path, including any query string>
<lowercase hex sha256 of the raw body, empty string hashed when there is none>
<unix seconds>
<nonce>
```

- The timestamp must be within **30 seconds** of the agent's clock.
- The nonce is any unique hex string, 8–64 characters. **Each is accepted
  once**, so a captured request cannot be replayed.

The agent signs its reply too, in `X-Reveille-Signature`, over a different
text tied to the nonce you chose — so you can tell the real agent from
something else answering on that address:

```
REVEILLE-HMAC-SHA256-RESPONSE
<the nonce you sent>
<lowercase hex sha256 of the reply body>
```

Verify it against the **raw bytes** of the reply. Parsing the JSON and
re-serialising it produces a different string and the check will fail.

### A complete, working client

Standard library only. This is the code the Home Assistant integration uses.

```python
import hashlib, hmac, json, secrets, time, urllib.request

AGENT = "http://192.168.1.50:5533"
TOKEN = "your-48-character-pairing-token"

def call(method, path, payload=None):
    body = json.dumps(payload, separators=(",", ":")) if payload is not None else ""
    timestamp, nonce = int(time.time()), secrets.token_hex(8)

    canonical = "\n".join([
        "REVEILLE-HMAC-SHA256", method.upper(), path,
        hashlib.sha256(body.encode()).hexdigest(), str(timestamp), nonce,
    ])
    signature = hmac.new(TOKEN.encode(), canonical.encode(), hashlib.sha256).hexdigest()

    request = urllib.request.Request(
        AGENT + path,
        data=body.encode() if body else None,
        headers={
            "Authorization": f"Reveille {timestamp}.{nonce}.{signature}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        text = response.read().decode()

        # Confirm the reply came from something holding the same token.
        header = response.headers.get("X-Reveille-Signature")
        if header:
            expected = hmac.new(
                TOKEN.encode(),
                "\n".join([
                    "REVEILLE-HMAC-SHA256-RESPONSE", nonce,
                    hashlib.sha256(text.encode()).hexdigest(),
                ]).encode(),
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(expected, header.strip()):
                raise RuntimeError("that reply did not come from the agent")

        return json.loads(text) if text else {}

print(call("GET", "/health")["stats"]["cpuPercent"])
call("POST", "/action", {"action": "lock"})
```

### Bearer tokens — simple, and weaker

```
Authorization: Bearer <token>
```

```bash
curl -H "Authorization: Bearer $TOKEN" http://192.168.1.50:5533/health
```

This sends the secret on **every request**. Anyone who can see your network
traffic can read it once and then shut that machine down whenever they like.
It exists because the phone app and the agent are updated separately, and
because a `curl` line or a Tasker task cannot easily compute an HMAC.

Use it only where the alternative is not doing the integration at all, and
prefer a wired network to shared Wi-Fi when you do. Anything that can run ten
lines of Python — Home Assistant included — should sign.

It can be switched off entirely: set `REVEILLE_REQUIRE_SIGNING=1` in the
agent's environment, and only signed requests are accepted. That will become
the default once signing has been out long enough, so **do not build anything
lasting on the bearer path.**

---

## `GET /health`

Everything the agent knows about its machine. Safe to poll; the app does so
every ten seconds.

```json
{
  "status": "ok",
  "hostname": "office-pc",
  "platform": "win32",
  "os": "windows",
  "uptimeSeconds": 8327,
  "interfaces": [
    {
      "interface": "Ethernet",
      "ip": "10.0.0.25",
      "mac": "AA:BB:CC:DD:EE:FF",
      "netmask": "255.255.255.0",
      "broadcast": "10.0.0.255"
    }
  ],
  "capabilities": { "firmwareReboot": true, "timedShutdown": true, "stats": true },
  "stats": {
    "cpuPercent": 50,
    "cores": 16,
    "memory": { "totalBytes": 34233991168, "freeBytes": 15841329152, "usedPercent": 54 },
    "disk": { "drive": "C:", "totalBytes": 1999231774720, "freeBytes": 1429763088384 }
  },
  "agent": {
    "installed": "2de230cb…",
    "latest": "b63c1545…",
    "updateAvailable": true,
    "checkedAt": "2026-09-18T17:11:00.201Z"
  },
  "pending": null
}
```

| Field | Notes |
|---|---|
| `os` | `windows`, `macos` or `linux`. Absent on agents older than multi-platform support — read that as `windows`, which is all there was. |
| `platform` | Node's raw value (`win32`, `darwin`, `linux`). Prefer `os`. |
| `capabilities` | **Read this before offering a control.** See below. |
| `stats.cpuPercent` | `null` on the very first poll, which has nothing to compare against. |
| `stats.disk` | `null` when it could not be read. |
| `agent` | Whether the PC half is behind `main`. Nothing to do with the phone app's version. |
| `pending` | `null`, or `{ "action": "shutdown", "secondsRemaining": 240 }` while a countdown runs. |

### Capabilities are not decoration

`firmwareReboot` is Windows-only, and false even there until someone has
approved it during install. `timedShutdown` and `stats` are absent on old
agents. Check before you expose a control, rather than offering a button that
returns 500.

---

## `POST /action`

```json
{ "action": "lock", "delaySeconds": 300 }
```

| Action | Effect | Delay |
|---|---|---|
| `shutdown` | Shuts the machine down | yes |
| `restart` | Restarts it | yes |
| `sleep` | Sleeps it | ignored |
| `lock` | Locks the screen | ignored |
| `firmware` | Restarts into BIOS / firmware settings | ignored — Windows only, and only when `capabilities.firmwareReboot` |

`delaySeconds` is optional, clamped to **0–7200**, and defaults to **5** — long
enough for the reply to reach you before the network goes away. Sending a delay
for an action that ignores it is not an error.

```
202 Accepted
{ "status": "accepted", "action": "shutdown", "delaySeconds": 300, "maxDelaySeconds": 7200 }
```

**202, not 200.** It means the agent has accepted and scheduled the action, not
that the machine is down. Nothing ever reports that: a machine that shut down
successfully is exactly a machine that cannot tell you so. Watch it stop
answering `/health` instead.

How the delay is kept differs by platform, and the difference is visible if the
agent is killed mid-countdown. Windows hands it to the OS (`shutdown /t`), which
survives that. macOS and Linux have no equivalent that works without root, so
the agent holds the timer itself — and a countdown dies with it.

---

## `POST /cancel`

Calls off a pending shutdown or restart. No body.

```json
{ "status": "cancelled" }
```

Always succeeds, including when nothing was scheduled. "Nothing is pending" is
the state you asked for.

---

## The lock-screen responder

A second, much smaller process on **`port + 1`** (5534 by default), installed
separately and only on Windows.

It exists because the agent starts when you log in, so between a machine
powering on and somebody typing a PIN, nothing answers `/health` at all — and
"off" and "sitting at the sign-in screen" look identical from outside.

`GET /health` is all it serves, with the same authentication:

```json
{ "status": "locked", "hostname": "office-pc", "platform": "win32", "uptimeSeconds": 8349 }
```

`"locked"`, deliberately not `"ok"`. The machine is on; nothing can be
controlled until someone signs in. It cannot shut down, restart, sleep or lock
anything, because it contains no code that does — it runs before login, which
is the most exposed a process on that machine can be.

**Ask the agent first; ask this only when the agent does not answer.** A machine
that is fully up answers both, and the agent's reply is the one with everything
in it.

---

## When things go wrong

| Code | Body | Meaning |
|---|---|---|
| `400` | `{"error":"Unknown action: selfdestruct"}` | Not one of the five actions |
| `400` | `{"error":"delaySeconds must be a number"}` | Exactly that |
| `401` | `{"error":"Unauthorized"}` | Wrong token, or a bearer token where signing is required |
| `401` | `{"error":"Unauthorized","reason":"malformed"}` | The `Authorization` header is not the right shape |
| `401` | `{"error":"Unauthorized","reason":"stale"}` | Timestamp more than 30s from the agent's clock — check the clocks |
| `401` | `{"error":"Unauthorized","reason":"signature"}` | Signed over something other than what was sent |
| `401` | `{"error":"Unauthorized","reason":"replay"}` | That nonce has been used |
| `403` | `{"error":"Reveille only answers on your local network."}` | Your address is not private |
| `500` | `{"error":"<what failed>"}` | The OS command failed — the message is the reason |

`reason` appears only on signed requests, and only to tell two failures apart
that otherwise look the same. It never appears for a bearer token, which either
matches or does not.

---

## Notes for anyone integrating

**Poll `/health`, do not hold a connection.** There are no websockets and no
push. Ten seconds is what the app uses and what the agent is built for.

**`403` means your integration is not where you think it is.** Docker bridge
networks are the usual cause: the container's address is private, but check it
is one the agent recognises before assuming the token is wrong.

**Clocks.** A signed request from a machine whose clock has drifted more than
thirty seconds fails with `reason: "stale"`. It is the one failure that looks
like a broken token and is not.

**The token is the whole of the security model.** Anything holding it can shut
that machine down. If one leaks, run the setup command again and choose **New
pairing code**; every paired client stops working until it is given the new one,
which is the point.

# Reveille for Home Assistant

Wake, shut down, restart, sleep and lock a computer from Home Assistant — and,
through it, by voice.

This talks to the same agent the phone app does, on your own network, using the
same signed requests. The pairing code never crosses the wire.

---

## Before anything else: where does Home Assistant run?

**Not on the computer you want to wake.** If it is off, Home Assistant is off,
and the one thing you wanted is the one thing that cannot happen.

It needs to live on something that stays on — a Raspberry Pi, a NAS, an old
laptop, a mini PC. If you do not already have one of those, that is the real
cost of this, not the software.

---

## Installing

1. Copy `custom_components/reveille/` into your Home Assistant `config/custom_components/` folder,
   so you end up with `config/custom_components/reveille/manifest.json`.
2. Restart Home Assistant.
3. **Settings → Devices & Services → Add Integration → Reveille**.

You will be asked for:

| | |
|---|---|
| **Address** | The computer's address, e.g. `192.168.1.50` |
| **Port** | `5533` unless you changed it |
| **Pairing code** | The long code from the agent's pairing screen |
| **MAC address** | Only for waking. Leave it empty and it is read from the computer itself |
| **Name** | Leave empty to use the computer's own name |

To see the pairing code again, run the setup command on the computer and choose
**Show the pairing code**.

Adding it while the computer is **awake** is easiest — the MAC address fills
itself in, and a wrong MAC is the one mistake that silently breaks waking later.

## What you get

**Buttons** — Wake, Shut down, Restart, Sleep, Lock, and Reboot to BIOS.

Reboot to BIOS only appears if that computer is actually set up for it: it is
Windows-only and stays off until someone approves it during install. Everything
except Wake is greyed out while the computer is unreachable, because nothing
would arrive. Wake is never greyed out — it is most useful when the machine is
off.

**Awake** — a connectivity sensor, on whenever the computer is powered on. This
is the one to automate against.

It is on **including while the computer sits at its sign-in screen**, which is a
state Reveille takes some trouble to detect. A machine woken from off spends a
while there, plainly on, with nothing running yet to answer. Its attributes say
which of the three it is: `signed in`, `at the sign-in screen`, or `off or
asleep`.

**Signed in** — a second sensor, on only once someone has logged in and the
agent is running. Every button except Wake needs this. Disabled by default;
enable it if you automate around that difference.

**Processor, Memory used, Disk free, Uptime** — while the computer is awake.
They go *unavailable* when it is off rather than reporting zero: a processor
that is not running is not a processor at 0%, and charting it as one puts a lie
in every graph.

---

## "Hey Google, lock the office PC"

```
Google Assistant → Home Assistant → this integration → your computer
```

Google needs to reach Home Assistant from the internet, which is a decision
about Home Assistant, not about Reveille. Two ways:

| | Cost | Effort |
|---|---|---|
| **Nabu Casa Cloud** | about $6.50/month | flip a switch |
| **Manual Google Assistant** | free | a Google Cloud project, a public HTTPS address, and re-authorising now and then |

Either way, expose the **buttons** to Google and say *"Hey Google, press lock
the office PC"*. Buttons are awkward to phrase — for something you say often,
make a Home Assistant [script](https://www.home-assistant.io/integrations/script/)
with a natural name and expose that instead:

```yaml
script:
  put_the_office_pc_to_sleep:
    alias: Put the office PC to sleep
    sequence:
      - action: button.press
        target:
          entity_id: button.office_pc_sleep
```

Then *"Hey Google, run put the office PC to sleep."* The same setup works for
Alexa.

**Reveille itself will never talk to Google directly.** That would need a
publicly reachable endpoint, and refusing every request from outside your own
network is the whole security model. Home Assistant is the right place for that
bridge, because anyone running it has already made that decision deliberately.

---

## Automations worth having

**Wake the computer when you get home**

```yaml
automation:
  - alias: Wake the office PC when I get home
    triggers:
      - trigger: zone
        entity_id: person.me
        zone: zone.home
        event: enter
    actions:
      - action: button.press
        target:
          entity_id: button.office_pc_wake
```

**Sleep it when everyone leaves, but only if nobody is using it**

```yaml
automation:
  - alias: Sleep the office PC when the house is empty
    triggers:
      - trigger: state
        entity_id: zone.home
        to: "0"
    conditions:
      - condition: numeric_state
        entity_id: sensor.office_pc_processor
        below: 15
    actions:
      - action: button.press
        target:
          entity_id: button.office_pc_sleep
```

The processor condition is the part worth copying: it stops the automation
interrupting a long render or a backup just because the house went empty.

---

## When it does not work

**"Nothing answered at that address"** — the computer is asleep, the address is
wrong, or the agent is not running. Check `http://<address>:5533/` in a browser
on the same network; you should get Reveille's own web page.

**"That pairing code was refused"** — wrong code, or it has been replaced. Run
the setup command on the computer and choose **Show the pairing code**.

**Everything works except Wake** — almost always the MAC address, or
Wake-on-LAN being switched off in the computer's BIOS and network adapter
settings. See [Enable Wake-on-LAN](../../README.md#enable-wake-on-lan-required-for-start).

**It worked, then stopped, with no obvious cause** — check the clock on the
machine running Home Assistant. Signed requests are refused if the two clocks
are more than thirty seconds apart, and it is the one failure that looks exactly
like a bad token.

**Home Assistant in Docker gets a 403** — the agent refuses anything that is not
on a local network, and a container's address may not look like one from
outside. Host networking, or a bridge on an RFC1918 range, both work.

---

## What has and has not been tested

The client underneath — signing, reply verification, the error handling, the
magic packet — is checked against a real running agent, and its signatures are
compared byte for byte against the agent's own implementation.

**The Home Assistant layer on top has never been loaded into Home Assistant.**
Every file compiles, the translation keys all resolve, and the shapes follow
current integration practice, but nobody has added this through the UI and
watched the entities appear. Treat the first install as the test, and please
[open an issue](https://github.com/Shamilimanuel/PCRemote/issues) with what
breaks.

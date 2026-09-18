"""
Talking to a Reveille agent.

The protocol is written down in docs/api.md; this is its Python half. The one
thing worth knowing before reading: the pairing token never goes over the
network. It is the key a signature is computed with, and only the signature is
sent, which is worthless for any request but the exact one it was made for.

Nothing here is Home Assistant-specific except the session being passed in, so
it can be exercised on its own.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import socket
import time
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

REQUEST_PREFIX = "REVEILLE-HMAC-SHA256"
RESPONSE_PREFIX = "REVEILLE-HMAC-SHA256-RESPONSE"

TIMEOUT = aiohttp.ClientTimeout(total=8)
PING_TIMEOUT = aiohttp.ClientTimeout(total=3)


class ReveilleError(Exception):
    """Anything that went wrong talking to the agent."""


class ReveilleAuthError(ReveilleError):
    """The agent refused the token. Re-pairing is the fix, not a retry."""


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def canonical_request(method: str, path: str, body: str, timestamp: int, nonce: str) -> str:
    """The exact text both sides sign. Six lines, nothing optional."""
    return "\n".join(
        [REQUEST_PREFIX, method.upper(), path, _sha256(body), str(timestamp), nonce]
    )


def canonical_response(nonce: str, body: str) -> str:
    return "\n".join([RESPONSE_PREFIX, nonce, _sha256(body)])


def sign(token: str, text: str) -> str:
    # The key is the token exactly as written -- its UTF-8 bytes, not decoded
    # from hex -- so there is no parsing step the two sides could disagree on.
    return hmac.new(token.encode(), text.encode(), hashlib.sha256).hexdigest()


class ReveilleClient:
    """One agent, at one address."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        host: str,
        port: int,
        token: str,
    ) -> None:
        self._session = session
        self._host = host
        self._port = port
        self._token = token

    @property
    def base(self) -> str:
        return f"http://{self._host}:{self._port}"

    @property
    def presence_base(self) -> str:
        """The lock-screen responder sits one port up. See docs/api.md."""
        return f"http://{self._host}:{self._port + 1}"

    async def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        *,
        base: str | None = None,
        timeout: aiohttp.ClientTimeout = TIMEOUT,
    ) -> dict[str, Any]:
        body = json.dumps(payload, separators=(",", ":")) if payload is not None else ""
        timestamp = int(time.time())
        nonce = secrets.token_hex(8)
        signature = sign(self._token, canonical_request(method, path, body, timestamp, nonce))

        headers = {
            "Authorization": f"Reveille {timestamp}.{nonce}.{signature}",
            "Content-Type": "application/json",
        }

        url = (base or self.base) + path
        try:
            async with self._session.request(
                method, url, data=body.encode() if body else None, headers=headers, timeout=timeout
            ) as response:
                # The reply's signature covers the bytes actually sent, so read
                # text and parse afterwards. Parsing first and re-serialising
                # would check a different string.
                text = await response.text()

                if response.status == 401:
                    raise ReveilleAuthError(_reason(text) or "the agent refused the pairing code")
                if response.status == 403:
                    raise ReveilleError(
                        "the agent only answers on a local network, and this is not one of them"
                    )
                if response.status >= 400:
                    raise ReveilleError(_reason(text) or f"the agent replied {response.status}")

                self._verify_reply(nonce, text, response.headers.get("X-Reveille-Signature"))
                return json.loads(text) if text else {}

        except aiohttp.ClientError as err:
            raise ReveilleError(f"could not reach {url}: {err}") from err
        except asyncio.TimeoutError as err:
            raise ReveilleError(f"{url} did not answer in time") from err

    def _verify_reply(self, nonce: str, body: str, header: str | None) -> None:
        """
        Confirms the reply came from something holding the same token, and that
        it answers *this* request rather than being a recording of an older one.

        A missing header is accepted: an agent older than signing sends none,
        and someone who updates Home Assistant before their PC should not lose
        the integration over it.
        """
        if not header:
            return
        expected = sign(self._token, canonical_response(nonce, body))
        if not hmac.compare_digest(expected, header.strip()):
            raise ReveilleError("that reply did not come from your agent")

    async def health(self) -> dict[str, Any]:
        """Everything the agent knows. Raises if it is not answering."""
        return await self._request("GET", "/health")

    async def presence(self) -> dict[str, Any]:
        """
        Asks the lock-screen responder whether the machine is merely sitting at
        its sign-in screen. Worth calling only once the agent itself has failed:
        a machine that is fully up answers both, and the agent's reply is the
        one with anything in it.
        """
        return await self._request(
            "GET", "/health", base=self.presence_base, timeout=PING_TIMEOUT
        )

    async def action(self, action: str, delay_seconds: int | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"action": action}
        if delay_seconds is not None:
            payload["delaySeconds"] = delay_seconds
        return await self._request("POST", "/action", payload)

    async def cancel(self) -> dict[str, Any]:
        return await self._request("POST", "/cancel")


def _reason(text: str) -> str | None:
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    return parsed.get("error") or parsed.get("reason")


def wake_on_lan(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    """
    Sends the magic packet.

    Not a request to the agent, and it could not be: the machine is off, so
    nothing is listening. Six 0xFF bytes followed by the MAC sixteen times,
    broadcast over UDP.
    """
    cleaned = mac.replace(":", "").replace("-", "").replace(".", "").strip()
    if len(cleaned) != 12:
        raise ValueError(f"{mac!r} is not a MAC address")

    packet = b"\xff" * 6 + bytes.fromhex(cleaned) * 16

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        # Port 9 is the usual one; 7 and 0 are also seen in the wild, and some
        # routers forward only one of them. Sending to both costs nothing.
        for target_port in {port, 9}:
            try:
                sock.sendto(packet, (broadcast, target_port))
            except OSError as err:
                _LOGGER.debug("wake packet to %s:%s failed: %s", broadcast, target_port, err)

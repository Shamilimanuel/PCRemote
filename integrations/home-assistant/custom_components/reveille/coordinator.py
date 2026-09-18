"""Polling one agent, and working out what its silence means."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .api import ReveilleAuthError, ReveilleClient, ReveilleError
from .const import DOMAIN, SCAN_INTERVAL_SECONDS

_LOGGER = logging.getLogger(__name__)


@dataclass
class ReveilleState:
    """
    What one poll found.

    Three states, not two. A machine that has been woken from off reaches its
    sign-in screen and sits there: plainly powered on, with the agent not yet
    running because Windows starts it at log on. Calling that "offline" is what
    made waking a PC look like it had done nothing until somebody walked over,
    so it gets a name of its own.
    """

    reachable: bool          # the agent answered; everything below is filled in
    at_lock_screen: bool     # powered on, nobody signed in
    health: dict[str, Any] | None
    error: str | None = None

    @property
    def awake(self) -> bool:
        return self.reachable or self.at_lock_screen

    def capability(self, name: str) -> bool:
        if not self.health:
            return False
        return bool(self.health.get("capabilities", {}).get(name))


class ReveilleCoordinator(DataUpdateCoordinator[ReveilleState]):
    """Polls /health, and asks the lock-screen responder when that fails."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: ReveilleClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} {entry.title}",
            update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS),
        )
        self.entry = entry
        self.client = client
        # Remembered from the last time the machine was awake.
        #
        # The wake button needs a broadcast address, and it needs it precisely
        # when the machine is off and cannot be asked. 255.255.255.255 works on
        # some networks and is dropped by plenty of routers, so the subnet's own
        # broadcast address is worth holding on to from when it was knowable.
        self.last_broadcast: str | None = None

    async def _async_update_data(self) -> ReveilleState:
        try:
            health = await self.client.health()
            for interface in health.get("interfaces") or []:
                if interface.get("broadcast"):
                    self.last_broadcast = str(interface["broadcast"])
                    break
            return ReveilleState(reachable=True, at_lock_screen=False, health=health)

        except ReveilleAuthError:
            # Not a transient failure and not worth retrying every ten seconds:
            # the token is wrong and a person has to re-pair. Let it surface.
            raise

        except ReveilleError as agent_error:
            # The second ping only happens on the failing path, so a healthy
            # machine still costs exactly one request per interval.
            try:
                await self.client.presence()
                return ReveilleState(reachable=False, at_lock_screen=True, health=None)
            except ReveilleError:
                return ReveilleState(
                    reachable=False,
                    at_lock_screen=False,
                    health=None,
                    error=str(agent_error),
                )

    async def run_action(self, action: str, delay_seconds: int | None = None) -> None:
        """Sends an action, then re-polls so the entities do not sit stale."""
        await self.client.action(action, delay_seconds)
        # Deliberately not awaited before returning to the caller: a shutdown
        # takes the machine away mid-poll and the button should not appear to
        # hang while that happens.
        self.hass.async_create_task(self.async_request_refresh())

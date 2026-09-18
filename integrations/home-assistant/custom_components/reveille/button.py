"""The buttons: wake, and the four or five ways to stop."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import wake_on_lan
from .const import (
    ACTION_FIRMWARE,
    ACTION_LOCK,
    ACTION_RESTART,
    ACTION_SHUTDOWN,
    ACTION_SLEEP,
    CONF_MAC,
    DOMAIN,
)
from .coordinator import ReveilleCoordinator
from .entity import ReveilleEntity

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, kw_only=True)
class ReveilleButton(ButtonEntityDescription):
    """A button, and the two questions worth asking before showing it."""

    action: str | None = None
    # Some things this machine may not be set up to do at all. firmware is
    # Windows-only and stays false until someone approves it during install.
    requires_capability: str | None = None
    # Wake is the only one that works on a machine that is off; the rest need
    # something running to receive them.
    needs_awake: bool = True


BUTTONS: tuple[ReveilleButton, ...] = (
    ReveilleButton(key="wake", translation_key="wake", icon="mdi:power", needs_awake=False),
    ReveilleButton(key="shutdown", translation_key="shutdown", icon="mdi:power-off", action=ACTION_SHUTDOWN),
    ReveilleButton(key="restart", translation_key="restart", icon="mdi:restart", action=ACTION_RESTART),
    ReveilleButton(key="sleep", translation_key="sleep", icon="mdi:sleep", action=ACTION_SLEEP),
    ReveilleButton(key="lock", translation_key="lock", icon="mdi:lock", action=ACTION_LOCK),
    ReveilleButton(
        key="firmware",
        translation_key="firmware",
        icon="mdi:chip",
        action=ACTION_FIRMWARE,
        requires_capability="firmwareReboot",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: ReveilleCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities: list[ButtonEntity] = []
    for description in BUTTONS:
        if description.key == "wake" and not entry.data.get(CONF_MAC):
            # Without a MAC there is nothing to address the magic packet to,
            # so the button would only ever fail.
            continue
        entities.append(ReveilleActionButton(coordinator, description))

    async_add_entities(entities)


class ReveilleActionButton(ReveilleEntity, ButtonEntity):
    """One button. Pressing it sends one thing."""

    entity_description: ReveilleButton

    def __init__(self, coordinator: ReveilleCoordinator, description: ReveilleButton) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def available(self) -> bool:
        state = self.coordinator.data
        if state is None:
            return False

        description = self.entity_description
        if not description.needs_awake:
            # Wake is *most* useful when the machine is off, so it is never
            # greyed out for being unreachable.
            return True
        if not state.reachable:
            # At the lock screen the agent is not running yet, so nothing here
            # would arrive. Greyed out is honest; the wake button stays live.
            return False
        if description.requires_capability:
            return state.capability(description.requires_capability)
        return True

    async def async_press(self) -> None:
        description = self.entity_description

        if description.key == "wake":
            mac = self.coordinator.entry.data[CONF_MAC]
            broadcast = _broadcast_for(self.coordinator)
            _LOGGER.debug("waking %s via %s", mac, broadcast)
            # Blocking UDP, so off the event loop it goes.
            await self.hass.async_add_executor_job(wake_on_lan, mac, broadcast)
            return

        await self.coordinator.run_action(description.action)


def _broadcast_for(coordinator: ReveilleCoordinator) -> str:
    """
    The address the magic packet should go to.

    A packet sent to 255.255.255.255 is dropped by plenty of routers, so the
    subnet's own broadcast address is the one worth using. The catch is that the
    agent only reports it while the machine is awake, which is exactly when
    nobody needs to wake it -- so the coordinator keeps the last one it saw and
    that is what gets used here.
    """
    state = coordinator.data
    if state and state.health:
        for interface in state.health.get("interfaces") or []:
            if interface.get("broadcast"):
                return str(interface["broadcast"])
    if coordinator.last_broadcast:
        return coordinator.last_broadcast
    return "255.255.255.255"

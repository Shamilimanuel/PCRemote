"""Is the machine awake, and is anyone signed in to it."""

from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import ReveilleCoordinator
from .entity import ReveilleEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: ReveilleCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([ReveilleAwake(coordinator), ReveilleSignedIn(coordinator)])


class ReveilleAwake(ReveilleEntity, BinarySensorEntity):
    """
    On whenever the machine is powered on -- including while it sits at its
    sign-in screen, which is the state this whole integration takes trouble
    over. This is the one to automate against.
    """

    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_translation_key = "awake"

    def __init__(self, coordinator: ReveilleCoordinator) -> None:
        super().__init__(coordinator, "awake")
        self.entity_description = BinarySensorEntityDescription(
            key="awake", translation_key="awake"
        )

    @property
    def is_on(self) -> bool:
        return bool(self.coordinator.data and self.coordinator.data.awake)

    @property
    def available(self) -> bool:
        # "Not answering" is a real answer here, not a missing one.
        return self.coordinator.data is not None

    @property
    def extra_state_attributes(self) -> dict[str, str]:
        state = self.coordinator.data
        if not state:
            return {}
        if state.reachable:
            return {"state": "signed in"}
        if state.at_lock_screen:
            return {"state": "at the sign-in screen"}
        return {"state": "off or asleep", "last_error": state.error or ""}


class ReveilleSignedIn(ReveilleEntity, BinarySensorEntity):
    """
    On only once somebody has signed in and the agent is running.

    Worth separating from "awake": every control needs this one, and a machine
    sitting at its lock screen will accept none of them.
    """

    _attr_entity_registry_enabled_default = False
    _attr_translation_key = "signed_in"

    def __init__(self, coordinator: ReveilleCoordinator) -> None:
        super().__init__(coordinator, "signed_in")
        self.entity_description = BinarySensorEntityDescription(
            key="signed_in", translation_key="signed_in"
        )

    @property
    def is_on(self) -> bool:
        return bool(self.coordinator.data and self.coordinator.data.reachable)

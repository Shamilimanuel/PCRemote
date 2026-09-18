"""What every Reveille entity has in common."""

from __future__ import annotations

from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import ReveilleCoordinator


class ReveilleEntity(CoordinatorEntity[ReveilleCoordinator]):
    """Ties an entity to the one machine this config entry points at."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: ReveilleCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        health = self.coordinator.data.health if self.coordinator.data else None
        # The hostname and OS are only knowable while the machine is awake, so
        # they are read when available and simply left out when not, rather
        # than the device flipping between two identities.
        return DeviceInfo(
            identifiers={(DOMAIN, self.coordinator.entry.entry_id)},
            name=self.coordinator.entry.title,
            manufacturer="Reveille",
            model=(health or {}).get("os", "computer"),
            configuration_url=f"http://{self.coordinator.entry.data[CONF_HOST]}:"
            f"{self.coordinator.entry.data[CONF_PORT]}",
        )

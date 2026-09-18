"""What the machine is doing, while it is awake to say."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfInformation, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import ReveilleCoordinator
from .entity import ReveilleEntity

GIB = 1024 ** 3


@dataclass(frozen=True, kw_only=True)
class ReveilleSensor(SensorEntityDescription):
    """A reading, and how to get it out of /health."""

    read: Callable[[dict[str, Any]], float | None]


def _disk_free(health: dict[str, Any]) -> float | None:
    disk = (health.get("stats") or {}).get("disk")
    # null when the agent could not read it, which is not the same as zero.
    return round(disk["freeBytes"] / GIB, 1) if disk else None


SENSORS: tuple[ReveilleSensor, ...] = (
    ReveilleSensor(
        key="cpu",
        translation_key="cpu",
        icon="mdi:cpu-64-bit",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        # null on the agent's very first poll, which has nothing to compare against.
        read=lambda health: (health.get("stats") or {}).get("cpuPercent"),
    ),
    ReveilleSensor(
        key="memory",
        translation_key="memory",
        icon="mdi:memory",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        read=lambda health: ((health.get("stats") or {}).get("memory") or {}).get("usedPercent"),
    ),
    ReveilleSensor(
        key="disk_free",
        translation_key="disk_free",
        icon="mdi:harddisk",
        native_unit_of_measurement=UnitOfInformation.GIBIBYTES,
        device_class=SensorDeviceClass.DATA_SIZE,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        read=_disk_free,
    ),
    ReveilleSensor(
        key="uptime",
        translation_key="uptime",
        icon="mdi:clock-outline",
        native_unit_of_measurement=UnitOfTime.HOURS,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1,
        read=lambda health: round(health["uptimeSeconds"] / 3600, 2)
        if health.get("uptimeSeconds") is not None
        else None,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: ReveilleCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(ReveilleReading(coordinator, d) for d in SENSORS)


class ReveilleReading(ReveilleEntity, SensorEntity):
    entity_description: ReveilleSensor

    def __init__(self, coordinator: ReveilleCoordinator, description: ReveilleSensor) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def available(self) -> bool:
        state = self.coordinator.data
        # Unavailable rather than zero when the machine is off: a CPU that is
        # not running is not a CPU at 0%, and charting it as one is a lie that
        # shows up in every graph.
        return bool(state and state.reachable and state.health)

    @property
    def native_value(self) -> float | None:
        state = self.coordinator.data
        if not state or not state.health:
            return None
        return self.entity_description.read(state.health)

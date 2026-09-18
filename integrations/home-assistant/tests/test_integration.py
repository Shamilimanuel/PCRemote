"""
Loads the integration into a real Home Assistant and checks what appears.

Run it with:

    pip install pytest-homeassistant-custom-component
    pytest integrations/home-assistant/tests -q

No Docker, no Home Assistant UI, no second machine. It starts Home Assistant
in-process, adds the integration through its own config flow, and asserts on
the entities that come out -- which is the part that cannot be checked by
reading the code, and the part most likely to be wrong.

The agent is faked. Its protocol is already tested for real against a running
agent; what is unproven here is the Home Assistant layer on top.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.const import CONF_HOST, CONF_PORT, STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "custom_components"))

from reveille.api import ReveilleAuthError, ReveilleError  # noqa: E402
from reveille.const import CONF_MAC, CONF_TOKEN, DOMAIN  # noqa: E402

TOKEN = "a3f1c09d4b7e2815a3f1c09d4b7e2815a3f1c09d4b7e2815"

# A real /health reply, trimmed. Captured from a running agent.
HEALTH = {
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
            "broadcast": "10.0.0.255",
        }
    ],
    "capabilities": {"firmwareReboot": True, "timedShutdown": True, "stats": True},
    "stats": {
        "cpuPercent": 50,
        "cores": 16,
        "memory": {"totalBytes": 34233991168, "freeBytes": 15841329152, "usedPercent": 54},
        "disk": {"drive": "C:", "totalBytes": 1999231774720, "freeBytes": 1429763088384},
    },
    "agent": {"updateAvailable": False},
    "pending": None,
}

PRESENCE = {"status": "locked", "hostname": "office-pc", "platform": "win32", "uptimeSeconds": 40}


@pytest.fixture(autouse=True)
def allow_custom_integrations(enable_custom_integrations):
    """Home Assistant refuses to load a custom component in tests without this."""
    yield


def entry() -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Office PC",
        data={
            CONF_HOST: "10.0.0.25",
            CONF_PORT: 5533,
            CONF_TOKEN: TOKEN,
            CONF_MAC: "AA:BB:CC:DD:EE:FF",
        },
        unique_id="10.0.0.25:5533",
    )


async def setup_with(hass: HomeAssistant, *, health=HEALTH, presence=None, error=None):
    """Adds the integration with the agent's answers stubbed."""
    config_entry = entry()
    config_entry.add_to_hass(hass)

    health_mock = AsyncMock(return_value=health) if error is None else AsyncMock(side_effect=error)
    presence_mock = (
        AsyncMock(return_value=presence)
        if presence is not None
        else AsyncMock(side_effect=ReveilleError("nothing there"))
    )

    with (
        patch("reveille.api.ReveilleClient.health", health_mock),
        patch("reveille.api.ReveilleClient.presence", presence_mock),
    ):
        await hass.config_entries.async_setup(config_entry.entry_id)
        await hass.async_block_till_done()
    return config_entry


# --------------------------------------------------------------- setting up --

async def test_the_entities_appear(hass: HomeAssistant) -> None:
    await setup_with(hass)

    buttons = hass.states.async_entity_ids("button")
    sensors = hass.states.async_entity_ids("sensor")
    binary = hass.states.async_entity_ids("binary_sensor")

    # Six buttons: wake, shutdown, restart, sleep, lock, and BIOS because this
    # machine reports it can.
    assert len(buttons) == 6, buttons
    assert len(sensors) == 4, sensors
    # "Signed in" is disabled by default, so only "Awake" is registered.
    assert len(binary) == 1, binary


async def test_the_readings_are_real(hass: HomeAssistant) -> None:
    await setup_with(hass)

    assert hass.states.get("sensor.office_pc_processor").state == "50"
    assert hass.states.get("sensor.office_pc_memory_used").state == "54"
    # 1429763088384 bytes is 1331.6 GiB.
    assert float(hass.states.get("sensor.office_pc_disk_free").state) == pytest.approx(1331.6, abs=0.2)
    assert float(hass.states.get("sensor.office_pc_uptime").state) == pytest.approx(2.31, abs=0.01)


async def test_bios_is_hidden_when_the_machine_cannot_do_it(hass: HomeAssistant) -> None:
    health = {**HEALTH, "capabilities": {**HEALTH["capabilities"], "firmwareReboot": False}}
    await setup_with(hass, health=health)

    # The entity still exists; it is unavailable, which is how Home Assistant
    # says "this machine does not offer that" without the button vanishing and
    # reappearing between polls.
    assert hass.states.get("button.office_pc_reboot_to_bios").state == STATE_UNAVAILABLE
    assert hass.states.get("button.office_pc_lock").state != STATE_UNAVAILABLE


# ------------------------------------------------------------- three states --

async def test_awake_when_signed_in(hass: HomeAssistant) -> None:
    await setup_with(hass)
    state = hass.states.get("binary_sensor.office_pc_awake")
    assert state.state == STATE_ON
    assert state.attributes["state"] == "signed in"


async def test_awake_at_the_sign_in_screen(hass: HomeAssistant) -> None:
    """The distinction this whole integration takes trouble over."""
    await setup_with(hass, error=ReveilleError("agent not running"), presence=PRESENCE)

    state = hass.states.get("binary_sensor.office_pc_awake")
    assert state.state == STATE_ON, "a machine at its lock screen is awake"
    assert state.attributes["state"] == "at the sign-in screen"

    # Nothing can be commanded yet, but waking is still offered.
    assert hass.states.get("button.office_pc_lock").state == STATE_UNAVAILABLE
    assert hass.states.get("button.office_pc_wake").state != STATE_UNAVAILABLE


async def test_off(hass: HomeAssistant) -> None:
    await setup_with(hass, error=ReveilleError("no route to host"))

    assert hass.states.get("binary_sensor.office_pc_awake").state == STATE_OFF
    # Unavailable, not zero. A processor that is not running is not at 0%.
    assert hass.states.get("sensor.office_pc_processor").state == STATE_UNAVAILABLE
    # Wake is the one thing worth offering to a machine that is off.
    assert hass.states.get("button.office_pc_wake").state != STATE_UNAVAILABLE


# ----------------------------------------------------------------- pressing --

async def test_pressing_lock_sends_lock(hass: HomeAssistant) -> None:
    await setup_with(hass)

    with patch("reveille.api.ReveilleClient.action", AsyncMock(return_value={})) as action:
        with patch("reveille.api.ReveilleClient.health", AsyncMock(return_value=HEALTH)):
            await hass.services.async_call(
                "button", "press", {"entity_id": "button.office_pc_lock"}, blocking=True
            )
            await hass.async_block_till_done()

    action.assert_awaited_once()
    assert action.await_args.args[0] == "lock"


async def test_pressing_wake_sends_a_magic_packet(hass: HomeAssistant) -> None:
    await setup_with(hass)

    with patch("reveille.button.wake_on_lan") as wake:
        await hass.services.async_call(
            "button", "press", {"entity_id": "button.office_pc_wake"}, blocking=True
        )
        await hass.async_block_till_done()

    wake.assert_called_once()
    mac, broadcast = wake.call_args.args
    assert mac == "AA:BB:CC:DD:EE:FF"
    # The subnet's own broadcast, taken from the agent -- not 255.255.255.255,
    # which plenty of routers drop.
    assert broadcast == "10.0.0.255"


async def test_wake_remembers_the_broadcast_after_the_machine_goes_away(
    hass: HomeAssistant,
) -> None:
    """
    The address is only readable while the machine is awake, and only needed
    once it is not. It has to survive the machine disappearing.
    """
    config_entry = await setup_with(hass)
    coordinator = hass.data[DOMAIN][config_entry.entry_id]

    with patch(
        "reveille.api.ReveilleClient.health", AsyncMock(side_effect=ReveilleError("gone"))
    ):
        await coordinator.async_refresh()
        await hass.async_block_till_done()

    assert hass.states.get("binary_sensor.office_pc_awake").state == STATE_OFF

    with patch("reveille.button.wake_on_lan") as wake:
        await hass.services.async_call(
            "button", "press", {"entity_id": "button.office_pc_wake"}, blocking=True
        )
        await hass.async_block_till_done()

    assert wake.call_args.args[1] == "10.0.0.255", "should not fall back to the global broadcast"


# -------------------------------------------------------------- config flow --

async def test_adding_it(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == FlowResultType.FORM

    with patch("reveille.api.ReveilleClient.health", AsyncMock(return_value=HEALTH)):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_HOST: "10.0.0.25", CONF_PORT: 5533, CONF_TOKEN: TOKEN, CONF_MAC: "", "name": ""},
        )
        await hass.async_block_till_done()

    assert result["type"] == FlowResultType.CREATE_ENTRY
    # Named after the machine, and the MAC filled in from it, so neither has to
    # be typed correctly by hand.
    assert result["title"] == "office-pc"
    assert result["data"][CONF_MAC] == "AA:BB:CC:DD:EE:FF"


async def test_a_wrong_code_is_told_apart_from_an_unreachable_machine(
    hass: HomeAssistant,
) -> None:
    for error, expected in (
        (ReveilleAuthError("nope"), "bad_token"),
        (ReveilleError("no route"), "cannot_connect"),
    ):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
        with patch("reveille.api.ReveilleClient.health", AsyncMock(side_effect=error)):
            result = await hass.config_entries.flow.async_configure(
                result["flow_id"],
                {CONF_HOST: "10.0.0.25", CONF_PORT: 5533, CONF_TOKEN: TOKEN, CONF_MAC: "", "name": ""},
            )
        assert result["type"] == FlowResultType.FORM
        assert result["errors"]["base"] == expected


async def test_a_bad_mac_is_caught_before_anything_is_saved(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_HOST: "10.0.0.25", CONF_PORT: 5533, CONF_TOKEN: TOKEN, CONF_MAC: "not-a-mac", "name": ""},
    )
    assert result["type"] == FlowResultType.FORM
    assert result["errors"][CONF_MAC] == "bad_mac"


async def test_the_same_machine_cannot_be_added_twice(hass: HomeAssistant) -> None:
    await setup_with(hass)

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    with patch("reveille.api.ReveilleClient.health", AsyncMock(return_value=HEALTH)):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_HOST: "10.0.0.25", CONF_PORT: 5533, CONF_TOKEN: TOKEN, CONF_MAC: "", "name": ""},
        )
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "already_configured"


# ------------------------------------------------------------ unloading --

async def test_it_can_be_removed(hass: HomeAssistant) -> None:
    config_entry = await setup_with(hass)
    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()
    assert not hass.states.async_entity_ids("button")

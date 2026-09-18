"""Adding a machine, from the Home Assistant UI."""

from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_NAME, CONF_PORT
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import ReveilleAuthError, ReveilleClient, ReveilleError
from .const import CONF_MAC, CONF_TOKEN, DEFAULT_NAME, DEFAULT_PORT, DOMAIN

_LOGGER = logging.getLogger(__name__)

MAC_PATTERN = re.compile(r"^[0-9a-f]{2}([:-]?)(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}$", re.I)


def _normalise_mac(value: str) -> str:
    cleaned = re.sub(r"[^0-9a-fA-F]", "", value)
    return ":".join(cleaned[i : i + 2] for i in range(0, 12, 2)).upper()


class ReveilleConfigFlow(ConfigFlow, domain=DOMAIN):
    """Everything needed is on the pairing screen the agent already prints."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].strip()
            port = user_input[CONF_PORT]
            token = user_input[CONF_TOKEN].strip()
            mac = user_input.get(CONF_MAC, "").strip()

            if mac and not MAC_PATTERN.match(mac):
                errors[CONF_MAC] = "bad_mac"
            else:
                client = ReveilleClient(async_get_clientsession(self.hass), host, port, token)
                try:
                    health = await client.health()
                except ReveilleAuthError:
                    errors["base"] = "bad_token"
                except ReveilleError as err:
                    _LOGGER.debug("could not reach the agent: %s", err)
                    errors["base"] = "cannot_connect"
                else:
                    # One entry per machine. The host and port are what identify
                    # it; a machine whose address changes is the same machine,
                    # but this at least stops the same one being added twice.
                    await self.async_set_unique_id(f"{host}:{port}")
                    self._abort_if_unique_id_configured()

                    # The agent knows its own MAC. Offering to fill it in beats
                    # asking someone to find it, and it is the one field that
                    # silently breaks waking if it is wrong.
                    if not mac:
                        for interface in health.get("interfaces") or []:
                            if interface.get("mac"):
                                mac = str(interface["mac"])
                                break

                    return self.async_create_entry(
                        title=user_input.get(CONF_NAME) or health.get("hostname") or DEFAULT_NAME,
                        data={
                            CONF_HOST: host,
                            CONF_PORT: port,
                            CONF_TOKEN: token,
                            CONF_MAC: _normalise_mac(mac) if mac else "",
                        },
                    )

        suggested = user_input or {}
        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=suggested.get(CONF_HOST, "")): str,
                vol.Required(CONF_PORT, default=suggested.get(CONF_PORT, DEFAULT_PORT)): int,
                vol.Required(CONF_TOKEN, default=suggested.get(CONF_TOKEN, "")): str,
                vol.Optional(CONF_MAC, default=suggested.get(CONF_MAC, "")): str,
                vol.Optional(CONF_NAME, default=suggested.get(CONF_NAME, "")): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

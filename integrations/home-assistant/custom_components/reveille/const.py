"""Shared constants for the Reveille integration."""

DOMAIN = "reveille"

CONF_TOKEN = "token"
CONF_MAC = "mac"

DEFAULT_PORT = 5533
DEFAULT_NAME = "Reveille"

# The app polls at ten seconds and the agent is built for it. Anything faster
# buys nothing: the readings it returns are a CPU average and a disk figure
# cached for a minute.
SCAN_INTERVAL_SECONDS = 10

# Actions the agent accepts, and whether the machine has to be awake for the
# button to be worth offering.
ACTION_SHUTDOWN = "shutdown"
ACTION_RESTART = "restart"
ACTION_SLEEP = "sleep"
ACTION_LOCK = "lock"
ACTION_FIRMWARE = "firmware"

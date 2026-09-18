"""Test fixtures. pytest-homeassistant-custom-component supplies the rest."""

import sys
from pathlib import Path

import pytest

# Home Assistant finds custom integrations with `import custom_components` --
# an ordinary package import through sys.path, not a scan of the config folder.
# So the directory *containing* custom_components has to be importable, and it
# has to happen here rather than in a test module, because collection imports
# the integration before any test body runs.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Without this Home Assistant refuses to load a custom component in tests."""
    yield


if sys.platform == "win32":  # pragma: no cover
    @pytest.fixture(autouse=True)
    def allow_asyncio_sockets():
        """
        A Windows-only attempt to let the event loop start. It does not work,
        and is kept only so the failure is explained where somebody meets it.

        The harness blocks network access during tests and lets Unix sockets
        through "because it's needed by asyncio" -- its own comment. Windows has
        no Unix sockets: asyncio builds its self-pipe from a local TCP pair,
        which the guard catches before any test body runs.

        Run these on Linux or macOS. CI does exactly that, in
        .github/workflows/home-assistant.yml.
        """
        import pytest_socket

        pytest_socket.enable_socket()
        yield

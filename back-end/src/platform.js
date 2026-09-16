const os = require('os');

/**
 * The one place that knows which operating system this is.
 *
 * Everything the agent does that isn't portable lives here as a table rather
 * than as an `if (process.platform === ...)` scattered through the code. Adding
 * an OS should mean adding a row, not hunting for every branch.
 */

const NAMES = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/** 'windows' | 'macos' | 'linux', or null on something we have no commands for. */
const PLATFORM = NAMES[process.platform] || null;

const TABLE = {
  windows: {
    label: 'Windows',
    // Windows schedules the delay itself, and `shutdown /a` calls it off. That
    // survives the agent dying, which an in-process timer would not, so it is
    // worth keeping even though it means one platform behaves differently.
    schedulesItself: true,
    shutdown: (delay) => `shutdown /s /t ${delay}`,
    restart: (delay) => `shutdown /r /t ${delay}`,
    cancel: 'shutdown /a',
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    lock: 'rundll32.exe user32.dll,LockWorkStation',
  },

  macos: {
    label: 'macOS',
    // `shutdown -h` needs root. Asking System Events instead works as the
    // logged-in user, which is what the agent runs as -- the same reasoning
    // that keeps it off administrator rights on Windows.
    schedulesItself: false,
    shutdown: () => `osascript -e 'tell application "System Events" to shut down'`,
    restart: () => `osascript -e 'tell application "System Events" to restart'`,
    cancel: null,
    sleep: 'pmset sleepnow',
    // Fast user switching's lock. Unlike the Cmd-Ctrl-Q keystroke it does not
    // need accessibility permission, so there is nothing for anyone to grant.
    lock: '"/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession" -suspend',
  },

  linux: {
    label: 'Linux',
    // systemd lets a logged-in local user do all of this through polkit without
    // sudo. On a machine without systemd these fail and the app reports it,
    // which is better than the agent guessing at init systems.
    schedulesItself: false,
    shutdown: () => 'systemctl poweroff',
    restart: () => 'systemctl reboot',
    cancel: null,
    sleep: 'systemctl suspend',
    lock: 'loginctl lock-session',
  },
};

const current = PLATFORM ? TABLE[PLATFORM] : null;

/** True when this OS can be controlled at all. */
function isSupported() {
  return current !== null;
}

/**
 * Reboot-to-firmware exists only on Windows, where an elevated Scheduled Task
 * can be registered once and then triggered without rights of its own. macOS
 * has no firmware screen to reach, and on Linux `systemctl reboot --firmware-setup`
 * would need the agent to hold privileges it deliberately does not have.
 */
function supportsFirmware() {
  return PLATFORM === 'windows';
}

function describe() {
  return {
    platform: os.platform(),
    os: PLATFORM,
    label: current ? current.label : os.platform(),
  };
}

module.exports = { PLATFORM, current, isSupported, supportsFirmware, describe };

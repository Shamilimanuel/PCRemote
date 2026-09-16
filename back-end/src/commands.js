const { exec } = require('child_process');

// A short delay by default so the HTTP response reaches the phone before the
// OS starts tearing the network stack down.
const DEFAULT_DELAY_SECONDS = 5;

// Two hours is plenty for "shut down when this download finishes", and keeps
// the value somewhere Windows will actually accept.
const MAX_DELAY_SECONDS = 7200;

const TIMED = {
  shutdown: '/s',
  restart: '/r',
};

const IMMEDIATE = {
  sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
  lock: 'rundll32.exe user32.dll,LockWorkStation',
};

const CANCEL_COMMAND = 'shutdown /a';

/**
 * Rebooting into the firmware screen (`shutdown /r /fw`) needs administrator
 * rights, which the agent deliberately does not have -- it listens on the
 * network, so it runs with ordinary privileges like everything else it does.
 *
 * Instead, install-firmware-task.ps1 registers one elevated Scheduled Task that
 * does exactly this and takes no arguments. The agent can ask Task Scheduler to
 * start it, but cannot influence what it runs. If the agent were ever
 * compromised, the extra power that grants is precisely "reboot to firmware".
 */
const FIRMWARE_TASK = 'ReveilleFirmwareReboot';
const FIRMWARE_ACTION = 'firmware';

/**
 * What the agent last scheduled, so the app can show a countdown.
 *
 * Windows has no reliable way to ask "is a shutdown pending", so this is the
 * agent remembering what it did. It is forgotten if the agent restarts, which
 * is honest -- `shutdown /a` still works either way.
 */
let pending = null;

function getPending() {
  if (pending && pending.atMs <= Date.now()) pending = null;
  return pending;
}

function isValidAction(action) {
  return (
    action === FIRMWARE_ACTION ||
    Object.prototype.hasOwnProperty.call(TIMED, action) ||
    Object.prototype.hasOwnProperty.call(IMMEDIATE, action)
  );
}

/** Clamps whatever the app asked for into something Windows will take. */
function normalizeDelay(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return DEFAULT_DELAY_SECONDS;
  return Math.max(0, Math.min(MAX_DELAY_SECONDS, Math.round(value)));
}

/** Whether the elevated task has been installed, so the app can hide the button. */
function hasFirmwareTask() {
  return new Promise((resolve) => {
    exec(`schtasks /query /tn "${FIRMWARE_TASK}"`, { windowsHide: true }, (error) => resolve(!error));
  });
}

function runFirmwareReboot() {
  return new Promise((resolve, reject) => {
    exec(`schtasks /run /tn "${FIRMWARE_TASK}"`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(
          'Reboot to BIOS is not set up on this PC. Run install-firmware-task.ps1 as administrator.'
        ));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function shell(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

async function runAction(action, options = {}) {
  if (action === FIRMWARE_ACTION) return runFirmwareReboot();

  if (IMMEDIATE[action]) {
    return shell(IMMEDIATE[action]);
  }

  const flag = TIMED[action];
  if (!flag) throw new Error(`Unknown action: ${action}`);

  const delay = normalizeDelay(options.delaySeconds ?? DEFAULT_DELAY_SECONDS);
  const result = await shell(`shutdown ${flag} /t ${delay}`);

  pending = {
    action,
    delaySeconds: delay,
    atMs: Date.now() + delay * 1000,
  };
  return result;
}

async function cancelPendingShutdown() {
  pending = null;
  // Fails harmlessly if nothing was scheduled; that isn't an error.
  await shell(CANCEL_COMMAND).catch(() => {});
}

module.exports = {
  DEFAULT_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
  FIRMWARE_TASK,
  FIRMWARE_ACTION,
  isValidAction,
  normalizeDelay,
  hasFirmwareTask,
  runAction,
  cancelPendingShutdown,
  getPending,
};

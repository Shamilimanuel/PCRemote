const { exec } = require('child_process');
const { PLATFORM, current, isSupported, supportsFirmware } = require('./platform');

// A short delay by default so the HTTP response reaches the phone before the
// OS starts tearing the network stack down.
const DEFAULT_DELAY_SECONDS = 5;

// Two hours is plenty for "shut down when this download finishes", and keeps
// the value somewhere Windows will actually accept.
const MAX_DELAY_SECONDS = 7200;

const TIMED_ACTIONS = ['shutdown', 'restart'];
const IMMEDIATE_ACTIONS = ['sleep', 'lock'];

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
 * On Windows this is the agent remembering what it asked the OS to do -- there
 * is no reliable way to ask "is a shutdown pending". Everywhere else the timer
 * below *is* the pending shutdown, because those platforms have no equivalent
 * of `shutdown /t` that works without root.
 *
 * Either way it is forgotten if the agent restarts, which is honest.
 */
let pending = null;
let timer = null;

function getPending() {
  if (pending && pending.atMs <= Date.now()) pending = null;
  return pending;
}

function isValidAction(action) {
  if (action === FIRMWARE_ACTION) return supportsFirmware();
  return TIMED_ACTIONS.includes(action) || IMMEDIATE_ACTIONS.includes(action);
}

/** Clamps whatever the app asked for into something the OS will take. */
function normalizeDelay(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return DEFAULT_DELAY_SECONDS;
  return Math.max(0, Math.min(MAX_DELAY_SECONDS, Math.round(value)));
}

/** Whether the elevated task has been installed, so the app can hide the button. */
function hasFirmwareTask() {
  // No point spawning schtasks on a machine that has never had it.
  if (!supportsFirmware()) return Promise.resolve(false);
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

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

async function runAction(action, options = {}) {
  if (!isSupported()) {
    throw new Error(`Reveille has no commands for ${process.platform}.`);
  }
  if (action === FIRMWARE_ACTION) {
    if (!supportsFirmware()) throw new Error('Reboot to BIOS is a Windows-only feature.');
    return runFirmwareReboot();
  }

  if (IMMEDIATE_ACTIONS.includes(action)) {
    return shell(current[action]);
  }
  if (!TIMED_ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`);

  const delay = normalizeDelay(options.delaySeconds ?? DEFAULT_DELAY_SECONDS);
  const command = current[action](delay);

  // Only one countdown at a time; a second request replaces the first.
  clearTimer();

  let result;
  if (current.schedulesItself) {
    result = await shell(command);
  } else {
    // The OS cannot take a delay without root here, so the agent holds it.
    // Scheduled, not run -- so the reply reaches the phone either way.
    timer = setTimeout(() => {
      timer = null;
      pending = null;
      shell(command).catch(() => {});
    }, delay * 1000);
    result = { stdout: '', stderr: '' };
  }

  pending = {
    action,
    delaySeconds: delay,
    atMs: Date.now() + delay * 1000,
  };
  return result;
}

async function cancelPendingShutdown() {
  pending = null;
  clearTimer();
  if (!current || !current.cancel) return;
  // Fails harmlessly if nothing was scheduled; that isn't an error.
  await shell(current.cancel).catch(() => {});
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

const { exec } = require('child_process');

// shutdown/restart get a short delay so the HTTP response can reach the
// phone before the OS starts tearing the network stack down.
const ACTIONS = {
  shutdown: 'shutdown /s /t 5',
  restart: 'shutdown /r /t 5',
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

function isValidAction(action) {
  return action === FIRMWARE_ACTION || Object.prototype.hasOwnProperty.call(ACTIONS, action);
}

/** Whether the elevated task has been installed, so the app can hide the button. */
function hasFirmwareTask() {
  return new Promise((resolve) => {
    exec(`schtasks /query /tn "${FIRMWARE_TASK}"`, (error) => resolve(!error));
  });
}

function runFirmwareReboot() {
  return new Promise((resolve, reject) => {
    exec(`schtasks /run /tn "${FIRMWARE_TASK}"`, (error, stdout, stderr) => {
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

function runAction(action) {
  if (action === FIRMWARE_ACTION) return runFirmwareReboot();

  return new Promise((resolve, reject) => {
    const cmd = ACTIONS[action];
    if (!cmd) {
      reject(new Error(`Unknown action: ${action}`));
      return;
    }
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function cancelPendingShutdown() {
  return new Promise((resolve) => {
    // This fails harmlessly if nothing was pending; we don't treat that as an error.
    exec(CANCEL_COMMAND, () => resolve());
  });
}

module.exports = {
  ACTIONS,
  FIRMWARE_TASK,
  FIRMWARE_ACTION,
  isValidAction,
  hasFirmwareTask,
  runAction,
  cancelPendingShutdown,
};

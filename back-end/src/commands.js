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

function isValidAction(action) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, action);
}

function runAction(action) {
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
  isValidAction,
  runAction,
  cancelPendingShutdown,
};

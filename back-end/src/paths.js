const path = require('path');

/**
 * Where the agent keeps what it writes: the pairing (config.json), the
 * activity log, the schedules, the list of apps, and which version this is.
 *
 * Next to the agent, normally. REVEILLE_DATA moves it -- for the tests, which
 * run a real agent and must never read or change the real install's files.
 */
const DATA_DIR = process.env.REVEILLE_DATA
  ? path.resolve(process.env.REVEILLE_DATA)
  : path.join(__dirname, '..');

function dataFile(name) {
  return path.join(DATA_DIR, name);
}

/**
 * The files an update must keep. setup.ps1 and setup.sh have the same list:
 * everything else in the folder is replaced on every update.
 */
const KEEP_ON_UPDATE = ['config.json', 'update-state.json', 'activity.json', 'schedules.json', 'apps.json'];

module.exports = { DATA_DIR, dataFile, KEEP_ON_UPDATE };

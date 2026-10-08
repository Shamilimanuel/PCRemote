const fs = require('fs');
const { spawn } = require('child_process');
const { dataFile } = require('./paths');

/**
 * The games and programs the phone may start.
 *
 * The list is chosen on the PC, in the Reveille window, and written to
 * apps.json next to the agent. The phone only ever sends an id from that list:
 * it can never name a program, a path or an argument of its own. So the most a
 * stolen pairing code can do here is start something the PC's owner already
 * put on the list.
 *
 *   [{ "id": "steam-570", "name": "Dota 2", "target": "steam://rungameid/570" }]
 *
 * target is a shortcut, a program or a link a launcher understands, opened
 * the way double-clicking it would open it.
 */

const FILE = dataFile('apps.json');

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) =>
      a && typeof a.id === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(a.id) &&
      typeof a.name === 'string' && a.name.trim() &&
      typeof a.target === 'string' && a.target.trim() && !/[\r\n"]/.test(a.target));
  } catch {
    return [];
  }
}

/** What the phone sees: names, never targets. */
function list() {
  return load().map((a) => ({ id: a.id, name: a.name.trim().slice(0, 60) }));
}

function count() {
  return load().length;
}

function opener(target) {
  if (process.platform === 'win32') return ['explorer.exe', [target]];
  if (process.platform === 'darwin') return ['open', [target]];
  return ['xdg-open', [target]];
}

/** Starts the entry with this id, or throws if there is none. */
function launch(id) {
  const app = load().find((a) => a.id === id);
  if (!app) throw new Error('That is not on this PC’s list of apps.');
  const [command, args] = opener(app.target);
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { id: app.id, name: app.name };
}

module.exports = { list, count, launch, FILE };

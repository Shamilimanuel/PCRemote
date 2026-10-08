const fs = require('fs');
const { dataFile } = require('./paths');

/**
 * What was done to this PC, when, and from where.
 *
 * Worth having for the same reason a door has a lock and a doorbell: the
 * pairing code is a key, and if someone else has it, this is how you find out.
 * Every request that changes something is written down -- with the phone's own
 * description of itself, when it sends one, and its address either way.
 *
 * The last 200 entries are kept in activity.json next to the agent. Reading
 * the list never adds to it, and nor does anything that only looks (status,
 * volume level, the screen picture's individual frames).
 */

const FILE = dataFile('activity.json');
const KEEP = 200;

let entries = null;

function load() {
  if (entries) return entries;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''));
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = [];
  }
  return entries;
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(entries) + '\n', 'utf8');
  } catch {
    // A read-only install folder costs the log, not the agent.
  }
}

/**
 * Who asked, in a form safe to show: the phone's description of itself, which
 * it may send as X-Reveille-Client, trimmed to printable text. Anyone can claim
 * any name there, so the address goes alongside it, and the app shows both.
 */
function clientOf(req) {
  const raw = req.get ? req.get('x-reveille-client') : req.headers && req.headers['x-reveille-client'];
  const client = String(raw || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 40);
  let from = (req.socket && req.socket.remoteAddress) || '';
  if (from.startsWith('::ffff:')) from = from.slice(7);
  return { client: client || null, from: from || null };
}

/**
 * @param {string} action  a short key the app translates: shutdown, message, launch ...
 * @param {object} [details]  { detail, client, from }
 */
function record(action, details = {}) {
  const list = load();
  list.push({
    at: new Date().toISOString(),
    action,
    detail: details.detail ?? null,
    client: details.client ?? null,
    from: details.from ?? null,
  });
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  save();
}

/** Newest first. */
function recent(limit = 50) {
  const list = load();
  return list.slice(-Math.max(1, Math.min(KEEP, limit))).reverse();
}

module.exports = { record, recent, clientOf, FILE };

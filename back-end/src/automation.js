const fs = require('fs');
const os = require('os');
const path = require('path');
const commands = require('./commands');
const { popup } = require('./notify');
const winhelper = require('./winhelper');
const activity = require('./activity');
const { dataFile } = require('./paths');

/**
 * The two things the PC does on its own once asked:
 *
 *   - "When it's finished": shut down or sleep once the PC has gone quiet --
 *     the download done, the render finished, the game updated.
 *   - Schedules: shut down, restart or sleep at a time, on chosen days.
 *
 * Both live here on the PC rather than on the phone, so they still happen
 * when the phone is off, flat, or somewhere else entirely. Both warn first and
 * both can be called off: the warning is a Windows notification on the PC,
 * and Cancel in the app stops either one, exactly like a timed shutdown.
 */

const TICK_MS = 15000;

// "Quiet" means both of these, for as long as was asked.
const QUIET_CPU_PERCENT = 15;
const QUIET_NETWORK_BYTES = 150 * 1024;      // 150 KB/s: a finished download, not an idle one

const FINISHED_WARNING_SECONDS = 60;
const SCHEDULE_WARNING_SECONDS = 300;

const SCHEDULES_FILE = dataFile('schedules.json');
const MAX_SCHEDULES = 12;
const ACTIONS = ['shutdown', 'restart', 'sleep'];

// ------------------------------------------------------------ cpu, our own --

// Separate from stats.js, whose sample moves only when the phone asks.
function cpuTicks() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const kind of Object.keys(cpu.times)) total += cpu.times[kind];
    idle += cpu.times.idle;
  }
  return { idle, total };
}
let previousTicks = cpuTicks();
function cpuPercent() {
  const now = cpuTicks();
  const idle = now.idle - previousTicks.idle;
  const total = now.total - previousTicks.total;
  previousTicks = now;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total))));
}

// ------------------------------------------------------------------ firing --

/**
 * A sleep that is counting down. Shutdown and restart count down in Windows
 * itself (commands.js hands it the delay), but Windows has no delayed sleep,
 * so that one is held here.
 */
let firing = null;

async function fire(action, delaySeconds) {
  cancelFiring();
  if (action === 'sleep') {
    const timer = setTimeout(() => {
      firing = null;
      commands.runAction('sleep').catch((err) => activity.record('failed', { detail: err.message }));
    }, delaySeconds * 1000);
    firing = { action, atMs: Date.now() + delaySeconds * 1000, timer };
    return;
  }
  await commands.runAction(action, { delaySeconds });
}

/** Called by /cancel, alongside commands.cancelPendingShutdown. */
function cancelFiring() {
  if (!firing) return false;
  clearTimeout(firing.timer);
  firing = null;
  return true;
}

function firingPending() {
  if (!firing) return null;
  return { action: firing.action, secondsRemaining: Math.max(0, Math.round((firing.atMs - Date.now()) / 1000)) };
}

// ---------------------------------------------------------- when finished --

let finished = null;

function networkSupported() {
  return winhelper.available();
}

function setWhenFinished(options, who = {}) {
  const action = options.action;
  const watch = options.watch || 'both';
  const minutes = Math.round(Number(options.quietMinutes));
  if (!['shutdown', 'sleep'].includes(action)) throw new Error('Choose shut down or sleep.');
  if (!['cpu', 'network', 'both'].includes(watch)) throw new Error('Choose what to wait for.');
  if (watch !== 'cpu' && !networkSupported()) throw new Error('Waiting for downloads works on Windows only.');
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) throw new Error('Choose between 1 and 240 minutes.');

  finished = { action, watch, quietMinutes: minutes, sinceMs: Date.now(), quietSinceMs: null, cpu: null, networkBytesPerSecond: null };
  activity.record('whenFinishedOn', { ...who, detail: `${action}, ${minutes} min, ${watch}` });
  return finishedStatus();
}

function clearWhenFinished(who = {}) {
  if (!finished) return;
  finished = null;
  activity.record('whenFinishedOff', who);
}

function finishedStatus() {
  if (!finished) return null;
  return {
    action: finished.action,
    watch: finished.watch,
    quietMinutes: finished.quietMinutes,
    quietForSeconds: finished.quietSinceMs ? Math.round((Date.now() - finished.quietSinceMs) / 1000) : 0,
    cpu: finished.cpu,
    networkBytesPerSecond: finished.networkBytesPerSecond,
  };
}

async function checkFinished() {
  if (!finished) return;
  const watching = finished;
  const cpu = cpuPercent();
  let network = null;
  if (watching.watch !== 'cpu') {
    try {
      network = (await winhelper.call('network')).bytesPerSecond;
    } catch {
      network = null;
    }
  }
  if (finished !== watching) return;   // changed or cleared while we measured

  watching.cpu = cpu;
  watching.networkBytesPerSecond = network;
  const cpuQuiet = watching.watch === 'network' || (cpu !== null && cpu < QUIET_CPU_PERCENT);
  const networkQuiet = watching.watch === 'cpu' || (network !== null && network < QUIET_NETWORK_BYTES);

  if (!(cpuQuiet && networkQuiet)) {
    watching.quietSinceMs = null;
    return;
  }
  if (!watching.quietSinceMs) watching.quietSinceMs = Date.now();
  if (Date.now() - watching.quietSinceMs < watching.quietMinutes * 60000) return;

  finished = null;
  activity.record('whenFinishedFired', { detail: watching.action });
  popup({
    title: watching.action === 'sleep' ? 'Going to sleep in a minute' : 'Shutting down in a minute',
    body: 'Everything has gone quiet, as Reveille was asked to wait for. Cancel it from Reveille on your phone.',
    seconds: 55,
    tone: 'warn',
  }).catch(() => {});
  await fire(watching.action, FINISHED_WARNING_SECONDS).catch((err) => activity.record('failed', { detail: err.message }));
}

// --------------------------------------------------------------- schedules --

function loadSchedules() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8').replace(/^\uFEFF/, ''));
    return {
      list: Array.isArray(parsed.list) ? parsed.list : [],
      fired: parsed.fired && typeof parsed.fired === 'object' ? parsed.fired : {},
    };
  } catch {
    return { list: [], fired: {} };
  }
}
let schedules = loadSchedules();

function saveSchedules() {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2) + '\n', 'utf8');
  } catch {
    // Kept in memory regardless; only a restart would lose them.
  }
}

/** The PC's own calendar date, which is what "every weekday" means to its owner. */
function dateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function validSchedule(s) {
  return s && typeof s === 'object' &&
    typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.id) &&
    typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) &&
    Array.isArray(s.days) && s.days.length > 0 && s.days.length <= 7 &&
    s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    ACTIONS.includes(s.action) &&
    typeof s.enabled === 'boolean' &&
    (s.skip === null || s.skip === undefined || (typeof s.skip === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.skip)));
}

function setSchedules(list, who = {}) {
  if (!Array.isArray(list)) throw new Error('schedules must be a list.');
  if (list.length > MAX_SCHEDULES) throw new Error(`At most ${MAX_SCHEDULES} schedules.`);
  for (const s of list) {
    if (!validSchedule(s)) throw new Error('One of the schedules is not valid.');
  }
  const clean = list.map((s) => ({
    id: s.id, time: s.time, days: [...new Set(s.days)].sort(), action: s.action, enabled: s.enabled, skip: s.skip || null,
  }));
  // Forget what fired for schedules that no longer exist.
  const ids = new Set(clean.map((s) => s.id));
  for (const id of Object.keys(schedules.fired)) if (!ids.has(id)) delete schedules.fired[id];
  schedules.list = clean;
  saveSchedules();
  activity.record('schedulesChanged', { ...who, detail: `${clean.filter((s) => s.enabled).length} on, ${clean.length} in all` });
  return allSchedules();
}

/** The moments this schedule happens, around now: yesterday, today, tomorrow. */
function targetsAround(s, now) {
  const [hours, minutes] = s.time.split(':').map(Number);
  const out = [];
  for (const offset of [-1, 0, 1]) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hours, minutes, 0, 0);
    if (s.days.includes(d.getDay())) out.push(d);
  }
  return out;
}

function nextOccurrence(s, now = new Date()) {
  if (!s.enabled) return null;
  const [hours, minutes] = s.time.split(':').map(Number);
  for (let offset = 0; offset <= 8; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hours, minutes, 0, 0);
    if (d <= now) continue;
    if (!s.days.includes(d.getDay())) continue;
    if (s.skip === dateKey(d)) continue;
    return d;
  }
  return null;
}

function allSchedules() {
  const now = new Date();
  return schedules.list.map((s) => {
    const next = nextOccurrence(s, now);
    return { ...s, next: next ? next.toISOString() : null };
  });
}

function nextSchedule() {
  let best = null;
  for (const s of allSchedules()) {
    if (s.next && (!best || s.next < best.next)) best = s;
  }
  if (!best) return null;
  return {
    id: best.id,
    action: best.action,
    time: best.time,
    at: best.next,
    inSeconds: Math.max(0, Math.round((new Date(best.next) - Date.now()) / 1000)),
  };
}

async function checkSchedules() {
  const now = new Date();
  let changed = false;
  for (const s of schedules.list) {
    // A skip is for one day; once that day is behind us, it goes.
    if (s.skip && s.skip < dateKey(new Date(now.getTime() - 86400000))) {
      s.skip = null;
      changed = true;
    }
    if (!s.enabled) continue;
    for (const target of targetsAround(s, now)) {
      const key = dateKey(target);
      if (s.skip === key || schedules.fired[s.id] === key) continue;
      const warnAt = target.getTime() - SCHEDULE_WARNING_SECONDS * 1000;
      // A minute's grace after the time itself, for a PC that was busy or
      // just woke up -- but no more: a schedule missed by an hour has missed.
      if (now.getTime() < warnAt || now.getTime() > target.getTime() + 60000) continue;

      schedules.fired[s.id] = key;
      changed = true;
      const seconds = Math.max(5, Math.round((target.getTime() - now.getTime()) / 1000));
      activity.record('scheduleFired', { detail: `${s.action} at ${s.time}` });
      const verb = s.action === 'restart' ? 'restarts' : s.action === 'sleep' ? 'goes to sleep' : 'shuts down';
      popup({
        title: `This PC ${verb} at ${s.time}`,
        body: 'As scheduled in Reveille. Save your work, or cancel it from Reveille on your phone.',
        seconds: 60,
        tone: 'warn',
      }).catch(() => {});
      await fire(s.action, seconds).catch((err) => activity.record('failed', { detail: err.message }));
    }
  }
  if (changed) saveSchedules();
}

// -------------------------------------------------------------------- tick --

let ticking = false;

function start() {
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await checkFinished();
      await checkSchedules();
    } catch {
      // One bad tick must not stop the next.
    } finally {
      ticking = false;
    }
  }, TICK_MS);
  timer.unref?.();
}

/** The short version, for /health. */
function summary() {
  return { whenFinished: finishedStatus(), nextSchedule: nextSchedule() };
}

/** Everything, for /automations. */
function details() {
  return {
    whenFinished: finishedStatus(),
    schedules: allSchedules(),
    nextSchedule: nextSchedule(),
    supports: { network: networkSupported(), maxSchedules: MAX_SCHEDULES },
  };
}

module.exports = {
  start,
  summary,
  details,
  setWhenFinished,
  clearWhenFinished,
  setSchedules,
  cancelFiring,
  firingPending,
  // for tests
  _internal: { nextOccurrence, targetsAround, dateKey, validSchedule },
};

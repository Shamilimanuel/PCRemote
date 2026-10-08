const { spawn } = require('child_process');
const path = require('path');

/**
 * Talks to helper/reveille-helper.ps1: one PowerShell process, started on
 * first use and kept, for the things Node cannot do on Windows by itself --
 * volume, media keys, the screen, and how busy the graphics card and network
 * are. See that file for why it is PowerShell.
 *
 * One request per line out, one reply per line back, matched by id. If the
 * helper dies, everything waiting on it fails and the next call starts a new
 * one -- a broken volume slider should never take the agent down with it.
 */

const SCRIPT = path.join(__dirname, '..', 'helper', 'reveille-helper.ps1');

// Starting PowerShell and compiling the C# takes a couple of seconds the first
// time; after that a request is a few milliseconds.
const FIRST_CALL_MS = 25000;
const CALL_MS = 10000;

let child = null;
let buffer = '';
let nextId = 1;
let warm = false;
const waiting = new Map();

function available() {
  return process.platform === 'win32';
}

function failAll(message) {
  for (const entry of waiting.values()) entry.reject(new Error(message));
  waiting.clear();
}

function start() {
  // A script block, not -File: an execution policy applies to script files,
  // and this never makes the machine's owner change theirs.
  const bootstrap = `& ([scriptblock]::Create([IO.File]::ReadAllText('${SCRIPT.replace(/'/g, "''")}')))`;
  const encoded = Buffer.from(bootstrap, 'utf16le').toString('base64');

  child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  warm = false;
  buffer = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) receive(line);
    }
  });

  let errors = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    errors = (errors + chunk).slice(-2000);
  });

  const self = child;
  child.on('exit', (code) => {
    if (child === self) child = null;
    failAll(`The Windows helper stopped${code ? ` (code ${code})` : ''}.${errors ? ' ' + errors.trim().split('\n')[0] : ''}`);
  });
  child.on('error', (err) => {
    if (child === self) child = null;
    failAll(`The Windows helper could not start: ${err.message}`);
  });
}

function receive(line) {
  let reply;
  try {
    reply = JSON.parse(line);
  } catch {
    return;   // not one of ours; PowerShell occasionally writes stray text
  }
  const entry = waiting.get(reply.id);
  if (!entry) return;
  waiting.delete(reply.id);
  warm = true;
  if (reply.ok) entry.resolve(reply.result ?? null);
  else entry.reject(new Error(reply.error || 'The Windows helper failed.'));
}

/**
 * Asks the helper to do one thing.
 * @param {string} cmd  ping | volume | key | screen | gpu | network
 * @param {object} [args]
 */
function call(cmd, args = {}) {
  if (!available()) return Promise.reject(new Error('This needs Windows.'));
  if (!child) start();

  const id = nextId++;
  const timeoutMs = warm ? CALL_MS : FIRST_CALL_MS;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('The Windows helper did not answer in time.'));
    }, timeoutMs);
    waiting.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    try {
      child.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    } catch (err) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(err);
    }
  });
}

/** Starts it in the background, so the first real request is not the slow one. */
function warmUp() {
  if (!available()) return;
  call('ping').catch(() => {});
}

function stop() {
  if (child) child.kill();
  child = null;
}

module.exports = { available, call, warmUp, stop };

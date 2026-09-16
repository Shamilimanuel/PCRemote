/**
 * The lock-screen responder.
 *
 * The agent proper is started by a Scheduled Task with an "at log on" trigger,
 * so after a Wake-on-LAN start from a powered-off PC there is a stretch --
 * boot, then the lock screen, then however long it takes someone to walk over
 * and type a PIN -- where the machine is plainly awake and the phone still
 * shows it as offline, because nothing is answering /health yet.
 *
 * This is what answers during that stretch. It is started at boot instead of at
 * log on, listens on its own port, and does exactly one thing: confirm the
 * machine is powered on. It cannot shut down, restart, sleep or lock anything,
 * because it has no code that does.
 *
 * That restraint is the point. Registering anything to start before log on
 * needs administrator approval once (see install-presence-task.ps1), and the
 * process it starts keeps running while the PC sits unattended at the lock
 * screen. Something in that position should be able to do as close to nothing
 * as possible. Every control still goes to the real agent, which still starts
 * only once you have logged in.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DEFAULT_PORT = 5533;

/**
 * Read-only on purpose: the agent's loadOrCreateConfig would mint a fresh token
 * if config.json were missing, and a token generated out here -- by a task
 * running before anyone has logged in -- would silently unpair every phone. If
 * there is no config yet there is nothing to guard, so stop instead.
 */
function readConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch {
    return null;
  }
  try {
    const config = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return config && config.token ? config : null;
  } catch {
    return null;
  }
}

function presencePort(config) {
  if (Number.isFinite(Number(config.presencePort))) return Number(config.presencePort);
  return (Number(config.port) || DEFAULT_PORT) + 1;
}

function tokenMatches(header, expected) {
  const [scheme, token] = String(header || '').split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const config = readConfig();
if (!config) {
  console.error('No paired config.json next to this script; nothing to answer for.');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  if (req.method !== 'GET' || url !== '/health') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (!tokenMatches(req.headers.authorization, config.token)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      // Deliberately not 'ok'. The app uses this to tell "powered on, nobody
      // logged in" apart from "agent answering", and showing them as the same
      // thing would promise buttons that will not work yet.
      status: 'locked',
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSeconds: Math.floor(os.uptime()),
    })
  );
});

// Losing the port is not worth a crash loop: the agent's own port is the one
// that matters, and a machine that is awake will say so again at next boot.
server.on('error', (err) => {
  console.error('Lock-screen responder could not listen:', err.message);
  process.exit(1);
});

server.listen(presencePort(config), '0.0.0.0', () => {
  console.log(`Reveille lock-screen responder listening on ${presencePort(config)}`);
});

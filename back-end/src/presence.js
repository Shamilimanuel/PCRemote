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
const { createNonceCache, verifyRequest, signResponse } = require('./signing');
const { isLocalAddress, describe } = require('./netguard');

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

/**
 * The old scheme: the token itself, in the clear, on every poll.
 *
 * Still accepted, because the phone app and this are updated separately and
 * whoever updates one first should not lose the ability to see their own PC.
 * It goes when the agent's does -- both are gated on the same reasoning.
 */
function tokenMatches(header, expected) {
  const [scheme, token] = String(header || '').split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const nonces = createNonceCache();
const ALLOW_BEARER = process.env.REVEILLE_REQUIRE_SIGNING !== '1';
const ALLOW_ANY_ADDRESS = process.env.REVEILLE_ALLOW_PUBLIC === '1';

/**
 * Checks a request the same way the agent does.
 *
 * This has to move in step with the agent: the app signs every request it
 * makes, including the one that asks whether the PC is sitting at its lock
 * screen. Leaving this on bearer tokens alone would have meant the app update
 * silently broke the one thing this process exists to report.
 *
 * @returns {string|null} the request's nonce when signed, null when it was a
 *   bearer token, and undefined is never returned -- callers check `ok`.
 */
function authorize(req, token) {
  const header = req.headers.authorization || '';

  if (header.startsWith('Reveille ')) {
    const result = verifyRequest({
      header,
      secret: token,
      method: req.method,
      path: req.url || '',
      body: '',          // this endpoint only ever answers GET
      nonces,
    });
    return result.ok ? { ok: true, nonce: result.nonce } : { ok: false };
  }

  if (ALLOW_BEARER && tokenMatches(header, token)) return { ok: true, nonce: null };
  return { ok: false };
}

const config = readConfig();
if (!config) {
  console.error('No paired config.json next to this script; nothing to answer for.');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  // Nothing off the local network gets an answer, for the same reason the
  // agent refuses: one router port-forward should not turn this into a public
  // service. See netguard.js.
  if (!ALLOW_ANY_ADDRESS && !isLocalAddress(req.socket.remoteAddress)) {
    console.warn(`refused a request from ${describe(req.socket.remoteAddress)} (not a local network)`);
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Reveille only answers on your local network.' }));
    return;
  }

  const url = (req.url || '').split('?')[0];

  if (req.method !== 'GET' || url !== '/health') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const auth = authorize(req, config.token);
  if (!auth.ok) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const body = JSON.stringify({
    // Deliberately not 'ok'. The app uses this to tell "powered on, nobody
    // logged in" apart from "agent answering", and showing them as the same
    // thing would promise buttons that will not work yet.
    status: 'locked',
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSeconds: Math.floor(os.uptime()),
  });

  const headers = { 'content-type': 'application/json' };
  // Signed only when the request was: the signature is bound to the nonce the
  // phone chose, and a bearer request never supplied one.
  if (auth.nonce) {
    headers['x-reveille-signature'] = signResponse(config.token, { nonce: auth.nonce, body });
  }

  res.writeHead(200, headers);
  res.end(body);
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

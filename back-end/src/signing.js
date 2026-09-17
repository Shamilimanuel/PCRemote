const crypto = require('crypto');

/**
 * Proving a request came from your phone without ever sending the secret.
 *
 * The agent speaks plain HTTP. It has to: a self-signed certificate makes the
 * phone refuse the connection, no certificate authority will issue one for
 * 192.168.1.72, and pinning a per-install certificate in React Native needs a
 * native module and compile-time configuration -- there is nothing to pin at
 * build time. So TLS is not available here in any honest form.
 *
 * What was available, and what this replaces, was sending the token itself in
 * an Authorization header on every single poll. Anyone watching that network
 * could read it once and then shut the machine down, restart it, or reboot it
 * into firmware settings whenever they liked.
 *
 * So the token stops travelling. It becomes a key, the phone signs each request
 * with it, and only the signature goes over the wire -- useless for anything
 * except the exact request it was computed for. A timestamp and a nonce stop
 * the same signature being replayed. The agent signs its replies too, bound to
 * the request's nonce, so the phone can tell a real agent from something
 * answering in its place.
 *
 * This is the scheme behind AWS's SigV4 and Hawk. It is not clever, which is
 * the point.
 *
 * ## The canonical string
 *
 * Both sides build this exact text and HMAC it. Every field is on its own line
 * and nothing is optional, because a signature is only as good as two
 * implementations agreeing character for character:
 *
 *     REVEILLE-HMAC-SHA256
 *     <METHOD, uppercase>
 *     <path, including any query string>
 *     <lowercase hex sha256 of the raw body, empty string hashed if no body>
 *     <unix seconds>
 *     <nonce>
 *
 * The key is the UTF-8 bytes of the pairing token as it is written down -- the
 * same string the QR code carries, not a decoded form of it, so there is no
 * parsing step that the two sides could disagree about.
 *
 * ## The header
 *
 *     Authorization: Reveille <timestamp>.<nonce>.<signature hex>
 *
 * ## The reply
 *
 *     X-Reveille-Signature: <signature hex>
 *
 * over a different canonical string, tied to the nonce the phone just chose:
 *
 *     REVEILLE-HMAC-SHA256-RESPONSE
 *     <the request's nonce>
 *     <lowercase hex sha256 of the response body>
 *
 * Binding it to the nonce is what stops a recorded reply being played back
 * later to claim a PC is awake when it is not.
 */

const SCHEME = 'Reveille';
const REQUEST_PREFIX = 'REVEILLE-HMAC-SHA256';
const RESPONSE_PREFIX = 'REVEILLE-HMAC-SHA256-RESPONSE';

/**
 * How far apart the two clocks may be.
 *
 * Phones and PCs both keep time over the network, so they agree closely. Thirty
 * seconds is loose enough that nobody is locked out by drift and tight enough
 * that a captured signature is worthless almost immediately.
 */
const MAX_SKEW_SECONDS = 30;

/** Nonces are remembered for as long as a timestamp can stay valid, then dropped. */
const NONCE_TTL_MS = (MAX_SKEW_SECONDS * 2 + 5) * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value ?? '', 'utf8').digest('hex');
}

/** The text both sides sign. Kept in one place so it cannot drift. */
function canonicalRequest({ method, path, body, timestamp, nonce }) {
  return [
    REQUEST_PREFIX,
    String(method).toUpperCase(),
    path,
    sha256Hex(body),
    String(timestamp),
    nonce,
  ].join('\n');
}

function canonicalResponse({ nonce, body }) {
  return [RESPONSE_PREFIX, nonce, sha256Hex(body)].join('\n');
}

function hmacHex(secret, text) {
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(text, 'utf8').digest('hex');
}

/** The bare signature, given every field explicitly. */
function signRequestValue(secret, parts) {
  return hmacHex(secret, canonicalRequest(parts));
}

/**
 * Builds a whole Authorization header, choosing the timestamp and nonce.
 *
 * Deliberately the same name and the same argument order as signRequest in
 * front-end/src/lib/signing.ts. The two modules mirror each other, and the
 * first version of this file had a signRequest that took an options object and
 * returned a bare string -- same name, different shape, on the other side of
 * the project. That cost an hour.
 */
function signRequest(secret, method, path, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  const signature = signRequestValue(secret, { method, path, body, timestamp, nonce });
  return { authorization: `${SCHEME} ${timestamp}.${nonce}.${signature}`, nonce };
}

function signResponse(secret, parts) {
  return hmacHex(secret, canonicalResponse(parts));
}

/** Constant-time compare that cannot throw on a length mismatch. */
function sameSignature(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Splits `Reveille <timestamp>.<nonce>.<signature>` apart.
 * Returns null for anything that is not that shape.
 */
function parseAuthorization(header) {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme !== SCHEME || !value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  const [timestamp, nonce, signature] = parts;
  if (!/^\d{1,15}$/.test(timestamp)) return null;
  if (!/^[0-9a-f]{8,64}$/.test(nonce)) return null;
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;

  return { timestamp: Number(timestamp), nonce, signature };
}

/**
 * Remembers nonces just long enough that none can be used twice.
 *
 * Bounded by time rather than count: entries older than a timestamp could
 * possibly be are dropped, so this cannot be made to grow without bound by
 * anyone throwing requests at it.
 */
function createNonceCache(now = () => Date.now()) {
  const seen = new Map();

  function prune() {
    const cutoff = now() - NONCE_TTL_MS;
    for (const [nonce, at] of seen) {
      if (at < cutoff) seen.delete(nonce);
    }
  }

  return {
    /** True if this nonce is fresh; records it. False if it has been used. */
    claim(nonce) {
      prune();
      if (seen.has(nonce)) return false;
      seen.set(nonce, now());
      return true;
    },
    get size() {
      return seen.size;
    },
  };
}

/**
 * Checks a signed request.
 *
 * @returns {{ ok: true, nonce: string } | { ok: false, reason: string }}
 */
function verifyRequest({ header, secret, method, path, body, nonces, nowSeconds }) {
  const parsed = parseAuthorization(header);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }

  const expected = signRequestValue(secret, {
    method,
    path,
    body,
    timestamp: parsed.timestamp,
    nonce: parsed.nonce,
  });
  // Signature before nonce, so a wrong secret cannot burn a nonce and lock out
  // the real phone by making it pick again.
  if (!sameSignature(expected, parsed.signature)) {
    return { ok: false, reason: 'signature' };
  }

  if (nonces && !nonces.claim(parsed.nonce)) {
    return { ok: false, reason: 'replay' };
  }

  return { ok: true, nonce: parsed.nonce };
}

module.exports = {
  SCHEME,
  MAX_SKEW_SECONDS,
  NONCE_TTL_MS,
  sha256Hex,
  canonicalRequest,
  canonicalResponse,
  signRequestValue,
  signRequest,
  signResponse,
  sameSignature,
  parseAuthorization,
  createNonceCache,
  verifyRequest,
};

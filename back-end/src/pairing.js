const os = require('os');
const { getPrimaryNetworkInfo } = require('./config');

/**
 * What the pairing QR encodes. Kept deliberately short -- every character makes
 * the QR denser and harder for a phone camera to read across a desk.
 *
 * `v` lets the app reject a payload from a future agent it doesn't understand
 * rather than silently mis-parsing it.
 */
const PAYLOAD_VERSION = 1;

function buildPairingPayload(config) {
  const adapters = getPrimaryNetworkInfo();
  const primary = adapters[0] || null;

  const payload = {
    v: PAYLOAD_VERSION,
    name: os.hostname(),
    port: config.port,
    token: config.token,
    ip: primary ? primary.ip : null,
    mac: primary ? primary.mac.toUpperCase() : null,
  };

  // Deliberately not listing the other adapters here. They would add ~70
  // characters, which pushes the QR up a version and makes it measurably
  // harder for a phone to read across a desk -- and the app only ever uses the
  // primary address anyway. They are printed as text instead.
  return payload;
}

/**
 * The same values, as one short string for the QR code.
 *
 *   R1*<ip>*<port>*<TOKEN>*<MAC>*<name>
 *
 * JSON cost about fifty characters in keys, braces and quotes, which pushed the
 * code from 37 modules square to 49 -- a third larger on screen for nothing a
 * reader ever sees.
 *
 * Uppercase is not cosmetic. QR has an alphanumeric mode covering 0-9, A-Z and
 * a few symbols that packs two characters into eleven bits, against eight bits
 * each in byte mode. Everything before the name fits it. The name is last and
 * keeps whatever case the machine has, so the encoder can put one byte segment
 * at the end and leave the rest dense -- which costs nothing, because a version
 * only steps up when it must.
 *
 * `*` separates because it is one of the few punctuation marks alphanumeric
 * mode allows, and it cannot appear in a hostname, an address or hex.
 */
const COMPACT_PREFIX = 'R1';

/** True for a token that survives a round trip through upper case. */
function isHex(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value);
}

function buildCompactPayload(config) {
  const payload = buildPairingPayload(config);
  if (!payload.ip || !payload.mac) return null;

  // Uppercased only when it is hex, which every token this agent generates is
  // (randomBytes().toString('hex')). Anything else goes as it stands rather
  // than being quietly altered -- the token is an HMAC key, and it is the exact
  // characters that matter.
  const token = isHex(payload.token) ? payload.token.toUpperCase() : payload.token;

  return [
    COMPACT_PREFIX,
    payload.ip,
    String(payload.port),
    token,
    payload.mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase(),
    payload.name,
  ].join('*');
}

module.exports = { PAYLOAD_VERSION, COMPACT_PREFIX, buildPairingPayload, buildCompactPayload };

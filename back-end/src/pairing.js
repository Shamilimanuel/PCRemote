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

module.exports = { PAYLOAD_VERSION, buildPairingPayload };

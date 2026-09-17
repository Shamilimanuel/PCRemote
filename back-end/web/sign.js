/*
   Request signing for the browser version.

   SHA-256 and HMAC by hand, because this page cannot use crypto.subtle.

   The agent serves over plain http:// to a LAN address, which browsers treat
   as an insecure context, and crypto.subtle simply does not exist there. The
   alternative was leaving this page on bearer tokens -- sending the real token
   on every poll -- while the phone app had stopped doing that. Same token, so
   that would have left the hole open for everyone, not just whoever opens the
   web page.

   Loaded as a plain script by index.html, so these are globals there. The
   module export at the bottom is for tools/check-websign.js, which checks every
   value in here against Node's own crypto -- a hand-rolled hash that is subtly
   wrong would fail silently and identically every time, which is the worst way
   for a hash to be wrong.
*/
var SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

/* Uint8Array in, 32 bytes out. */
function sha256Bytes(msg) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  var len = msg.length;
  // One 0x80 byte, then zeros, then a 64-bit big-endian bit count.
  var blocks = Math.ceil((len + 9) / 64);
  var buf = new Uint8Array(blocks * 64);
  buf.set(msg);
  buf[len] = 0x80;

  var view = new DataView(buf.buffer);
  var bits = len * 8;
  view.setUint32(buf.length - 8, Math.floor(bits / 4294967296), false);
  view.setUint32(buf.length - 4, bits >>> 0, false);

  var w = new Uint32Array(64);
  for (var off = 0; off < buf.length; off += 64) {
    var i;
    for (i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (i = 16; i < 64; i++) {
      var p = w[i - 15], q = w[i - 2];
      var s0 = (rotr(p, 7) ^ rotr(p, 18) ^ (p >>> 3)) >>> 0;
      var s1 = (rotr(q, 17) ^ rotr(q, 19) ^ (q >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    var a = H[0], b = H[1], c = H[2], d = H[3];
    var e = H[4], f = H[5], g = H[6], h = H[7];

    for (i = 0; i < 64; i++) {
      var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  var out = new Uint8Array(32);
  var dv = new DataView(out.buffer);
  for (var j = 0; j < 8; j++) dv.setUint32(j * 4, H[j], false);
  return out;
}

function utf8Bytes(str) { return new TextEncoder().encode(str); }

function toHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += (bytes[i] + 0x100).toString(16).slice(1);
  return s;
}

function sha256Hex(str) { return toHex(sha256Bytes(utf8Bytes(str))); }

/* HMAC-SHA256, RFC 2104. Block size 64 for SHA-256. */
function hmacSha256Hex(secret, message) {
  var key = utf8Bytes(secret);
  if (key.length > 64) key = sha256Bytes(key);

  var inner = new Uint8Array(64);
  var outer = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    var k = i < key.length ? key[i] : 0;
    inner[i] = k ^ 0x36;
    outer[i] = k ^ 0x5c;
  }

  var msg = utf8Bytes(message);
  var first = new Uint8Array(64 + msg.length);
  first.set(inner); first.set(msg, 64);
  var hashed = sha256Bytes(first);

  var second = new Uint8Array(64 + 32);
  second.set(outer); second.set(hashed, 64);
  return toHex(sha256Bytes(second));
}

/* The same canonical strings as back-end/src/signing.js. */
function canonicalRequest(method, path, body, timestamp, nonce) {
  return ['REVEILLE-HMAC-SHA256', method.toUpperCase(), path,
          sha256Hex(body || ''), String(timestamp), nonce].join('\n');
}

function canonicalResponse(nonce, body) {
  return ['REVEILLE-HMAC-SHA256-RESPONSE', nonce, sha256Hex(body || '')].join('\n');
}

function signRequest(secret, method, path, body) {
  var timestamp = Math.floor(Date.now() / 1000);
  var random = Math.floor(Math.random() * 0xffffffff);
  // Unsigned shift: `& 0xffffffff` yields a signed int in JavaScript and
  // Date.now() is large enough to come out negative, which puts a minus sign
  // in the nonce and gets the whole header rejected as malformed.
  var clock = Date.now() >>> 0;
  var nonce = ('0000000' + random.toString(16)).slice(-8) +
              ('0000000' + clock.toString(16)).slice(-8);
  var signature = hmacSha256Hex(secret, canonicalRequest(method, path, body, timestamp, nonce));
  return { authorization: 'Reveille ' + timestamp + '.' + nonce + '.' + signature, nonce: nonce };
}

function verifyResponse(secret, nonce, body, header) {
  if (!header) return true;   // an agent older than signing sends nothing
  return hmacSha256Hex(secret, canonicalResponse(nonce, body)) === String(header).trim();
}

/* Node, for the checker. In the browser this block simply does not run. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sha256Hex: sha256Hex,
    hmacSha256Hex: hmacSha256Hex,
    canonicalRequest: canonicalRequest,
    canonicalResponse: canonicalResponse,
    signRequest: signRequest,
    verifyResponse: verifyResponse
  };
}

// The .js extensions are required: @noble/hashes 2.x declares its subpaths
// that way in package.json "exports", and the bare paths do not resolve.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * The phone's half of the request-signing scheme.
 *
 * Must produce byte-identical signatures to back-end/src/signing.js, which
 * carries the full explanation of why the token stops travelling and what the
 * canonical string looks like. The two are checked against shared vectors in
 * signing.test.ts -- a signature is only as good as two implementations
 * agreeing character for character, and nothing here would fail loudly if they
 * drifted. It would just stop working, everywhere, at once.
 *
 * Pure JavaScript on purpose. @noble/hashes is audited and has no dependencies
 * and no native module, so this needs nothing from the platform and works the
 * same in the app, in a test, and anywhere else it is ever run.
 */

const SCHEME = 'Reveille';
const REQUEST_PREFIX = 'REVEILLE-HMAC-SHA256';
const RESPONSE_PREFIX = 'REVEILLE-HMAC-SHA256-RESPONSE';

export type SignedRequest = {
  /** The Authorization header value. */
  authorization: string;
  /** Kept so the reply's signature can be checked against it. */
  nonce: string;
};

function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value ?? '')));
}

function hmacHex(secret: string, text: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(text)));
}

/** The text both sides sign. Mirrors canonicalRequest in signing.js exactly. */
export function canonicalRequest(parts: {
  method: string;
  path: string;
  body: string;
  timestamp: number | string;
  nonce: string;
}): string {
  return [
    REQUEST_PREFIX,
    parts.method.toUpperCase(),
    parts.path,
    sha256Hex(parts.body),
    String(parts.timestamp),
    parts.nonce,
  ].join('\n');
}

export function canonicalResponse(parts: { nonce: string; body: string }): string {
  return [RESPONSE_PREFIX, parts.nonce, sha256Hex(parts.body)].join('\n');
}

export function signRequestValue(
  secret: string,
  parts: Parameters<typeof canonicalRequest>[0]
): string {
  return hmacHex(secret, canonicalRequest(parts));
}

/**
 * A nonce only has to be unique, not unguessable -- it exists so the agent can
 * refuse a signature it has already seen. Math.random plus the clock is plenty
 * and, unlike expo-crypto, needs no await on a hot path that runs every ten
 * seconds.
 */
function makeNonce(): string {
  const random = Math.floor(Math.random() * 0xffffffff);
  // `>>> 0`, not `& 0xffffffff`. Bitwise AND in JavaScript yields a *signed*
  // 32-bit integer, and Date.now() is large enough to come out negative -- so
  // toString(16) produced a leading minus sign and the agent rejected the whole
  // header as malformed. Unsigned shift keeps it in 0..2^32-1.
  const clock = Date.now() >>> 0;
  return random.toString(16).padStart(8, '0') + clock.toString(16).padStart(8, '0');
}

/** Builds the Authorization header for one request. */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string
): SignedRequest {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = makeNonce();
  const signature = signRequestValue(secret, { method, path, body, timestamp, nonce });
  return { authorization: `${SCHEME} ${timestamp}.${nonce}.${signature}`, nonce };
}

/** Length-independent compare. Not timing-safe, and does not need to be: a
 *  mismatch here means the reply is discarded, and the attacker already knows
 *  what they sent. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks that a reply came from something holding the same token, and that it
 * is the reply to *this* request rather than a recording of an older one.
 *
 * A missing header is accepted, because an agent from before this change does
 * not send one and its owner should not be locked out of their own PC by
 * updating the app first. Once both halves are updated that leniency should
 * go -- see verifyResponse's caller.
 */
export function verifyResponse(
  secret: string,
  nonce: string,
  body: string,
  header: string | null
): { ok: boolean; signed: boolean } {
  if (!header) return { ok: true, signed: false };
  const expected = hmacHex(secret, canonicalResponse({ nonce, body }));
  return { ok: sameSignature(expected, header.trim()), signed: true };
}

import { Device } from '../types/device';

/**
 * Reads the payload from the agent's pairing QR (`npm run pair` on the PC).
 *
 * Anything scanned here came off a camera pointed at the world, so treat it as
 * hostile input: check the shape, the version and every field before letting it
 * near storage. A QR that isn't ours should produce a clear message, not a
 * half-filled form.
 */

const SUPPORTED_VERSION = 1;

/**
 * The compact form the agent prints now: `R1*ip*port*TOKEN*MAC*name`.
 *
 * JSON cost about fifty characters in keys and quotes, which pushed the printed
 * code from 37 modules square to 49 -- a third bigger on screen for nothing a
 * reader ever sees. The JSON form is still accepted, because an agent that has
 * not been updated yet still prints it and nobody should have to update both
 * halves in one go to pair a machine.
 */
const COMPACT_PREFIX = 'R1';

export type PairingResult =
  | { ok: true; device: Omit<Device, 'id'> }
  | { ok: false; reason: string };

function isIpv4(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
  );
}

function isMac(value: unknown): value is string {
  return typeof value === 'string' && value.replace(/[^0-9a-fA-F]/g, '').length === 12;
}

function parseCompact(raw: string): PairingResult | null {
  const parts = raw.trim().split('*');
  if (parts[0] !== COMPACT_PREFIX) return null;

  // Past the prefix it is positional, so a short one is malformed rather than
  // partly usable. The name may itself contain nothing odd, but it is last so
  // anything after the MAC is the name.
  if (parts.length < 5) return { ok: false, reason: 'That pairing code is incomplete.' };

  const [, ip, port, token, mac, ...rest] = parts;

  // The agent uppercases the token so the whole string fits QR's alphanumeric
  // mode, which is what makes the code smaller. Every token it generates is
  // lowercase hex, so lowering it back is exact -- and it has to be exact,
  // because the token is an HMAC key and the bytes are what sign a request.
  // Anything that is not hex is left alone rather than quietly altered.
  const restored = /^[0-9a-fA-F]+$/.test(token) ? token.toLowerCase() : token;

  return finish({
    ip,
    port: Number(port),
    token: restored,
    mac,
    name: rest.join('*'),
  });
}

export function parsePairingPayload(raw: string): PairingResult {
  const compact = parseCompact(raw);
  if (compact) return compact;

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "That isn't a Reveille pairing code." };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, reason: "That isn't a Reveille pairing code." };
  }

  if (data.v !== SUPPORTED_VERSION) {
    return {
      ok: false,
      reason:
        typeof data.v === 'number'
          ? 'That code was made by a newer agent. Update the app.'
          : "That isn't a Reveille pairing code.",
    };
  }

  return finish(data);
}

/**
 * The checks both formats go through.
 *
 * Whatever produced these values, they came off a camera pointed at the world,
 * so every one is checked before it can reach storage.
 */
function finish(data: {
  ip: unknown;
  port: unknown;
  token: unknown;
  mac: unknown;
  name: unknown;
}): PairingResult {
  if (!isIpv4(data.ip)) return { ok: false, reason: 'The code has no usable address.' };
  if (!isMac(data.mac)) return { ok: false, reason: 'The code has no usable MAC address.' };
  if (typeof data.token !== 'string' || data.token.length < 16) {
    return { ok: false, reason: 'The code has no usable token.' };
  }

  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: 'The code has no usable port.' };
  }

  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'My PC';

  return {
    ok: true,
    device: {
      name,
      ip: data.ip,
      port,
      token: data.token,
      mac: formatMac(data.mac),
    },
  };
}

export function formatMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return (hex.match(/../g) ?? []).join(':');
}

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

export function parsePairingPayload(raw: string): PairingResult {
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

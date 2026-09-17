import { Device, HealthResponse, PendingAction, Route } from '../types/device';
import { signRequest, verifyResponse } from './signing';

const TIMEOUT_MS = 5000;
// Background polls shouldn't hold a spinner for five seconds on a PC that is
// simply switched off, so they get a tighter budget.
const PING_TIMEOUT_MS = 2500;

export type Answered<T> = { data: T; route: Route };

type Target = { url: string; route: Route };

/**
 * The LAN address first, then the remote one. Order matters: at home the local
 * address is faster and doesn't leave the house, so it should always win.
 */
function targets(device: Device): Target[] {
  const list: Target[] = [{ url: `http://${device.ip}:${device.port}`, route: 'local' }];
  const remote = device.remoteHost?.trim();
  if (remote) {
    // Accept either "host" or "host:port"; fall back to the device's port.
    const hasPort = /:\d+$/.test(remote);
    list.push({ url: `http://${hasPort ? remote : `${remote}:${device.port}`}`, route: 'remote' });
  }
  return list;
}

async function once(target: Target, device: Device, path: string, init: RequestInit | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // The token is a key now, not a password to hand over. It signs the request
  // and stays on the phone -- see lib/signing.ts for why that matters on a
  // network where anything could be listening.
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = typeof init?.body === 'string' ? init.body : '';
  const signed = signRequest(device.token, method, path, body);

  try {
    const response = await fetch(`${target.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: signed.authorization,
        'Content-Type': 'application/json',
      },
    });

    // Read as text, because the reply's signature covers the exact bytes sent.
    // Parsing first and re-serialising would check a different string.
    const text = await response.text();

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = parsed.error;
      } catch {
        // A non-JSON error body is still an error; the status stands.
      }
      throw new Error(message);
    }

    // An agent holding the same token is the only thing that can produce this.
    // An older agent sends nothing, which is accepted so that updating the app
    // first does not lock anyone out of their own PC.
    const verdict = verifyResponse(
      device.token,
      signed.nonce,
      text,
      response.headers.get('X-Reveille-Signature')
    );
    if (!verdict.ok) {
      throw new Error("That reply didn't come from your PC. Check the address and pair again.");
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T = any>(
  device: Device,
  path: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS
): Promise<Answered<T>> {
  let lastError: Error = new Error('No address configured');

  for (const target of targets(device)) {
    try {
      const data = await once(target, device, path, init, timeoutMs);
      return { data, route: target.route };
    } catch (err) {
      lastError = err as Error;
      // A wrong token fails identically on every address, so don't waste the
      // timeout budget trying the next one.
      if (lastError.message.includes('401') || lastError.message === 'Unauthorized') break;
    }
  }

  throw lastError;
}

export function checkHealth(device: Device) {
  return request<HealthResponse>(device, '/health');
}

/** Same as checkHealth, but with the shorter timeout used by status polling. */
export function pingHealth(device: Device) {
  return request<HealthResponse>(device, '/health', undefined, PING_TIMEOUT_MS);
}

/**
 * Asks the lock-screen responder -- a separate, much smaller thing than the
 * agent, on its own port -- whether the PC is powered on. Worth calling only
 * once the agent itself has failed to answer, since a PC that is fully up
 * answers on both and the agent's reply is the one with everything in it.
 *
 * The port is the agent's plus one, matching src/presence.js on the PC.
 */
export function pingPresence(device: Device) {
  return request<HealthResponse>(
    { ...device, port: device.port + 1 },
    '/health',
    undefined,
    PING_TIMEOUT_MS
  );
}

export function sendAction(
  device: Device,
  action: Exclude<PendingAction, null>,
  delaySeconds?: number
) {
  return request(device, '/action', {
    method: 'POST',
    body: JSON.stringify(
      delaySeconds === undefined ? { action } : { action, delaySeconds }
    ),
  });
}

export function cancelShutdown(device: Device) {
  return request(device, '/cancel', { method: 'POST' });
}

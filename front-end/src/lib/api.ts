import { Device, HealthResponse, PendingAction, Route } from '../types/device';

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

  try {
    const response = await fetch(`${target.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${device.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed with status ${response.status}`);
    }

    return response.json().catch(() => ({}));
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

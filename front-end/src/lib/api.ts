import { Device, HealthResponse, PendingAction } from '../types/device';

const TIMEOUT_MS = 5000;
// Background polls shouldn't hold a spinner for five seconds on a PC that is
// simply switched off, so they get a tighter budget.
const PING_TIMEOUT_MS = 2500;

async function request(device: Device, path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://${device.ip}:${device.port}${path}`, {
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

export function checkHealth(device: Device): Promise<HealthResponse> {
  return request(device, '/health');
}

/** Same as checkHealth, but with the shorter timeout used by status polling. */
export function pingHealth(device: Device): Promise<HealthResponse> {
  return request(device, '/health', undefined, PING_TIMEOUT_MS);
}

export function sendAction(device: Device, action: Exclude<PendingAction, null>) {
  return request(device, '/action', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function cancelShutdown(device: Device) {
  return request(device, '/cancel', { method: 'POST' });
}

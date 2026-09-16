import { useCallback, useEffect, useRef, useState } from 'react';
import { Device, DeviceStatus, HealthResponse, Route } from '../types/device';
import { pingHealth, pingPresence } from '../lib/api';

const DEFAULT_INTERVAL_MS = 10000;

type Result = {
  status: DeviceStatus;
  health: HealthResponse | null;
  /** Round-trip time of the last successful poll, in milliseconds. */
  latencyMs: number | null;
  /** Which address answered — the LAN one, or the remote fallback. */
  route: Route | null;
  /** Re-checks immediately instead of waiting for the next interval. */
  refresh: () => void;
};

/**
 * Polls the agent's /health endpoint so the UI can show whether the PC is
 * actually awake.
 *
 * When that fails it asks the lock-screen responder as well, because those two
 * failures are not the same thing. A PC woken from a full shutdown boots to the
 * lock screen and sits there, plainly on, while the agent -- which Windows only
 * starts once someone logs in -- is not running yet. Treating that as offline
 * is what made waking a PC look like it had done nothing until somebody walked
 * over and typed a PIN.
 *
 * The second ping only happens on the failing path, so a healthy PC still costs
 * exactly one request per interval. A PC that is genuinely off costs two, both
 * of which fail on the same short timeout.
 */
export function useDeviceStatus(device: Device, intervalMs = DEFAULT_INTERVAL_MS): Result {
  const [status, setStatus] = useState<DeviceStatus>('unknown');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Only the fields the poll actually uses, so editing a device's name doesn't
  // restart the timer.
  const { ip, port, token, remoteHost } = device;
  const deviceRef = useRef(device);
  deviceRef.current = device;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const startedAt = Date.now();
      try {
        const { data, route: via } = await pingHealth(deviceRef.current);
        if (cancelled) return;
        setHealth(data);
        setLatencyMs(Date.now() - startedAt);
        setRoute(via);
        setStatus('online');
        return;
      } catch {
        if (cancelled) return;
      }

      // Health is deliberately left null here. The responder knows the machine
      // is on and nothing else -- no stats, no capabilities -- and handing the
      // UI a half-filled reply would have it draw panels out of missing data.
      try {
        await pingPresence(deviceRef.current);
        if (cancelled) return;
        setHealth(null);
        setLatencyMs(null);
        setRoute(null);
        setStatus('locked');
      } catch {
        if (cancelled) return;
        setHealth(null);
        setLatencyMs(null);
        setRoute(null);
        setStatus('offline');
      }
    }

    poll();
    // 0 means the user turned background checking off to save battery. The
    // first poll still runs, so opening a PC always shows something current.
    if (intervalMs <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ip, port, token, remoteHost, intervalMs, nonce]);

  return { status, health, latencyMs, route, refresh };
}

/** "3d 4h", "5h 12m", "8m" -- compact enough for a subtitle line. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

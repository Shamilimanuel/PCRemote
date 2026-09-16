import { useCallback, useEffect, useRef, useState } from 'react';
import { Device, DeviceStatus, HealthResponse, Route } from '../types/device';
import { pingHealth } from '../lib/api';

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
 * actually awake. A failed poll means "not reachable", which from the phone's
 * point of view is indistinguishable from off/asleep -- both render as offline.
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
      } catch {
        if (cancelled) return;
        setHealth(null);
        setLatencyMs(null);
        setRoute(null);
        setStatus('offline');
      }
    }

    poll();
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

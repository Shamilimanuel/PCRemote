import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from '../types/device';
import { pingHealth } from '../lib/api';
import { sendMagicPacket } from '../lib/wol';

/**
 * Watches for the PC to come up after a wake signal.
 *
 * The signal itself is fire-and-forget by necessity — the machine is off and
 * cannot acknowledge anything — so the only way to know whether it worked is to
 * keep knocking until someone answers. That is what this does, and the counting
 * is the point: a cold start takes twenty to forty seconds, which feels like
 * failure unless the app says otherwise.
 */

const KNOCK_EVERY_MS = 2000;
const GIVE_UP_SECONDS = 60;

export type WakeState = 'idle' | 'sending' | 'waiting' | 'awake' | 'gaveup';

export type WakeWatch = {
  state: WakeState;
  /** Seconds since the signal went out. */
  elapsed: number;
  /** How long it took, once awake. */
  tookSeconds: number | null;
  start: () => Promise<void>;
  dismiss: () => void;
  giveUpSeconds: number;
};

export function useWakeWatch(device: Device, onAwake?: () => void): WakeWatch {
  const [state, setState] = useState<WakeState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [tookSeconds, setTookSeconds] = useState<number | null>(null);

  const cancelled = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const knocker = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    if (knocker.current) clearInterval(knocker.current);
    ticker.current = null;
    knocker.current = null;
  }, []);

  // Unmounting mid-wait must not leave timers knocking at a PC nobody is
  // watching for.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      stop();
    };
  }, [stop]);

  const dismiss = useCallback(() => {
    stop();
    setState('idle');
    setElapsed(0);
    setTookSeconds(null);
  }, [stop]);

  const start = useCallback(async () => {
    stop();
    setState('sending');
    setElapsed(0);
    setTookSeconds(null);

    await sendMagicPacket(device.mac, device.ip);
    if (cancelled.current) return;

    const startedAt = Date.now();
    setState('waiting');

    const since = () => Math.round((Date.now() - startedAt) / 1000);

    ticker.current = setInterval(() => {
      if (cancelled.current) return;
      const seconds = since();
      setElapsed(seconds);
      if (seconds >= GIVE_UP_SECONDS) {
        stop();
        setState('gaveup');
      }
    }, 1000);

    knocker.current = setInterval(async () => {
      if (cancelled.current) return;
      try {
        await pingHealth(device);
        if (cancelled.current) return;
        stop();
        setTookSeconds(since());
        setState('awake');
        onAwake?.();
      } catch {
        // Expected, repeatedly, until it isn't.
      }
    }, KNOCK_EVERY_MS);
  }, [device, onAwake, stop]);

  return { state, elapsed, tookSeconds, start, dismiss, giveUpSeconds: GIVE_UP_SECONDS };
}

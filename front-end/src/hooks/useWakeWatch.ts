import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from '../types/device';
import { pingHealth, pingPresence } from '../lib/api';
import { sendMagicPacket } from '../lib/wol';
import {
  CONFIRM_SECONDS,
  GIVE_UP_SECONDS,
  KNOCK_EVERY_MS,
  WakeState,
  canConfirmFromOutside,
  knockDelayMs,
  phaseFor,
} from '../lib/wakeRules';

export type { WakeState };

/**
 * Watches for the PC to come up after a wake signal.
 *
 * The signal itself is fire-and-forget by necessity — the machine is off and
 * cannot acknowledge anything — so the only way to know whether it worked is to
 * keep knocking until someone answers. That is what this does, and the counting
 * is the point: a cold start takes twenty to forty seconds, which feels like
 * failure unless the app says otherwise.
 *
 * It knocks on the lock-screen responder as well as the agent, because on a PC
 * started from fully off the agent does not exist yet -- Windows starts it when
 * someone logs in.
 *
 * The important thing this does NOT do is claim the wake failed. On a PC that
 * has not had the lock-screen responder installed, *nothing can answer* until
 * somebody walks over and signs in, so silence after a minute is not evidence
 * of anything. It used to show a red cross there, on a machine that had in fact
 * started perfectly, and then sit on that cross even after the PC finished
 * booting -- the only way to clear it was to leave the screen and come back.
 *
 * So after a minute it stops claiming progress and says what it actually knows,
 * and it carries on listening for five minutes. It also takes confirmation from
 * outside via confirmAwake(), because the ten-second status poll runs anyway and
 * whichever of the two hears back first should settle it.
 */

export type WakeWatch = {
  state: WakeState;
  /** Seconds since the signal went out. */
  elapsed: number;
  /** How long it took, once awake. */
  tookSeconds: number | null;
  start: () => Promise<void>;
  dismiss: () => void;
  /** Settles the watch as awake — for when something else noticed first. */
  confirmAwake: () => void;
  confirmSeconds: number;
};

export function useWakeWatch(device: Device, onAwake?: () => void): WakeWatch {
  const [state, setState] = useState<WakeState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [tookSeconds, setTookSeconds] = useState<number | null>(null);

  const cancelled = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const knocker = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number | null>(null);
  // Read inside the knock loop, which must not be rebuilt on every state change.
  const stateRef = useRef<WakeState>('idle');
  stateRef.current = state;

  const stop = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    if (knocker.current) clearTimeout(knocker.current);
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
    startedAt.current = null;
    setState('idle');
    setElapsed(0);
    setTookSeconds(null);
  }, [stop]);

  const settleAwake = useCallback(() => {
    stop();
    const began = startedAt.current;
    setTookSeconds(began === null ? null : Math.round((Date.now() - began) / 1000));
    setState('awake');
    onAwake?.();
  }, [onAwake, stop]);

  /**
   * Called when the status poll saw the PC before this watch's own knock did.
   *
   * 'gaveup' counts as outstanding on purpose. A cross on screen while the pill
   * beside it reads Awake is the exact thing being fixed here, and a PC that
   * answers at minute six has still plainly started.
   */
  const confirmAwake = useCallback(() => {
    if (cancelled.current) return;
    const began = startedAt.current;
    const elapsedMs = began === null ? null : Date.now() - began;
    if (!canConfirmFromOutside(stateRef.current, elapsedMs)) return;
    settleAwake();
  }, [settleAwake]);

  const start = useCallback(async () => {
    stop();
    setState('sending');
    setElapsed(0);
    setTookSeconds(null);

    await sendMagicPacket(device.mac, device.ip);
    if (cancelled.current) return;

    const began = Date.now();
    startedAt.current = began;
    setState('waiting');

    const since = () => Math.round((Date.now() - began) / 1000);

    ticker.current = setInterval(() => {
      if (cancelled.current) return;
      const seconds = since();
      setElapsed(seconds);
      const phase = phaseFor(seconds, stateRef.current);
      if (phase === 'gaveup') stop();
      // Past the minute this stops claiming progress but keeps listening.
      setState((current) => phaseFor(seconds, current));
    }, 1000);

    // Self-scheduling rather than a fixed interval, so it can ease off from
    // every two seconds to every five once the first minute is gone.
    const knock = async () => {
      if (cancelled.current) return;
      try {
        await pingHealth(device).catch(() => pingPresence(device));
        if (cancelled.current) return;
        settleAwake();
        return;
      } catch {
        // Expected, repeatedly, until it isn't.
      }
      if (cancelled.current) return;
      const seconds = since();
      if (seconds >= GIVE_UP_SECONDS) return;   // the ticker reports this
      knocker.current = setTimeout(knock, knockDelayMs(seconds));
    };
    knocker.current = setTimeout(knock, KNOCK_EVERY_MS);
  }, [device, settleAwake, stop]);

  return {
    state,
    elapsed,
    tookSeconds,
    start,
    dismiss,
    confirmAwake,
    confirmSeconds: CONFIRM_SECONDS,
  };
}

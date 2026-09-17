/**
 * When a wake counts as done, still in progress, or actually failed.
 *
 * Separate from the hook that uses it, and importing nothing, so the rules can
 * be checked without a phone, a React renderer, or a PC that is genuinely
 * switched off. The last bug here was a rule that was wrong rather than a timer
 * that misfired, and a rule is only cheap to get right if it is cheap to test.
 */

export const KNOCK_EVERY_MS = 2000;
export const SLOW_KNOCK_MS = 5000;

/** How long a wake is described as "in progress"; also what the ring fills over. */
export const CONFIRM_SECONDS = 60;

/** How long it keeps listening before calling it a genuine failure. */
export const GIVE_UP_SECONDS = 300;

/**
 * How long before an outside report of "online" is believed.
 *
 * The status poll runs every ten seconds, so its answer can be that stale. Tap
 * Wake a moment after shutting the PC down and it would still be holding the
 * last successful ping, which would settle the wake as done before the machine
 * had finished switching off. Nothing real comes back this fast, and the watch's
 * own knock is not gated -- so a genuine quick wake from sleep is still reported
 * the instant it answers.
 */
export const TRUST_OUTSIDE_AFTER_MS = 5000;

export type WakeState =
  | 'idle'
  | 'sending'
  | 'waiting'
  /** A minute gone, nothing back yet. Probably sitting at the sign-in screen. */
  | 'unconfirmed'
  | 'awake'
  | 'gaveup';

/**
 * What the state should become, given how long we have been waiting.
 *
 * Only ever moves a wake that is still outstanding. 'awake' and 'gaveup' are
 * settled, and the clock must not walk them back.
 */
export function phaseFor(elapsedSeconds: number, current: WakeState): WakeState {
  if (current !== 'waiting' && current !== 'unconfirmed') return current;
  if (elapsedSeconds >= GIVE_UP_SECONDS) return 'gaveup';
  if (elapsedSeconds >= CONFIRM_SECONDS) return 'unconfirmed';
  return current;
}

/** How long to wait before knocking again. Eases off once the minute is up. */
export function knockDelayMs(elapsedSeconds: number): number {
  return elapsedSeconds < CONFIRM_SECONDS ? KNOCK_EVERY_MS : SLOW_KNOCK_MS;
}

/**
 * Whether a report of "online" from the status poll should settle this wake.
 *
 * 'gaveup' is included deliberately: a cross on screen while the status pill
 * beside it reads Awake is the exact thing being fixed, and a PC that answers
 * at minute six has still plainly started.
 */
export function canConfirmFromOutside(state: WakeState, elapsedMs: number | null): boolean {
  if (state !== 'waiting' && state !== 'unconfirmed' && state !== 'gaveup') return false;
  if (elapsedMs === null) return false;
  return elapsedMs >= TRUST_OUTSIDE_AFTER_MS;
}

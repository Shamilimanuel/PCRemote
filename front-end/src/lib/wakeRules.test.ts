/**
 * Checks for the wake rules. Run it with:
 *
 *     npx tsx src/lib/wakeRules.test.ts
 *
 * No test runner and no dependency to install -- wakeRules.ts imports nothing,
 * which is the whole reason it is a separate file. The alternative to this is a
 * phone, a PC that is genuinely switched off, and five minutes per attempt.
 */

import { phaseFor, knockDelayMs, canConfirmFromOutside, WakeState } from './wakeRules';

let pass = 0;
let fail = 0;

function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}  got=${String(got)} want=${String(want)}`);
}

console.log('=== phase: when the app stops claiming progress ===');
is('t=0   waiting', phaseFor(0, 'waiting'), 'waiting');
is('t=59  waiting', phaseFor(59, 'waiting'), 'waiting');
is('t=60  stops claiming progress', phaseFor(60, 'waiting'), 'unconfirmed');
is('t=299 still listening', phaseFor(299, 'unconfirmed'), 'unconfirmed');
is('t=300 genuine failure', phaseFor(300, 'unconfirmed'), 'gaveup');
is('awake is never walked back', phaseFor(400, 'awake'), 'awake');
is('gaveup is never walked back', phaseFor(400, 'gaveup'), 'gaveup');
is('idle untouched', phaseFor(400, 'idle'), 'idle');
is('sending untouched', phaseFor(400, 'sending'), 'sending');

console.log('\n=== knock pacing ===');
is('t=0   every 2s', knockDelayMs(0), 2000);
is('t=59  every 2s', knockDelayMs(59), 2000);
is('t=60  eases to 5s', knockDelayMs(60), 5000);
is('t=250 every 5s', knockDelayMs(250), 5000);

console.log('\n=== believing the ten-second status poll ===');
is('idle: ignore', canConfirmFromOutside('idle', 99000), false);
is('already awake: ignore', canConfirmFromOutside('awake', 99000), false);
is('waiting, 1s in: ignore (poll may be stale)', canConfirmFromOutside('waiting', 1000), false);
is('waiting, 4.9s in: ignore', canConfirmFromOutside('waiting', 4900), false);
is('waiting, 5s in: believe', canConfirmFromOutside('waiting', 5000), true);
is('unconfirmed at 95s: believe', canConfirmFromOutside('unconfirmed', 95000), true);
is('gaveup at 400s: believe', canConfirmFromOutside('gaveup', 400000), true);
is('no start time: ignore', canConfirmFromOutside('waiting', null), false);

/**
 * The bug this was written for: a PC with no lock-screen responder answers
 * nothing at all until somebody signs in, so the wake used to run to a minute,
 * show a red cross, and keep showing it after the PC had finished booting.
 */
console.log('\n=== a PC that starts, then waits to be signed into ===');
function runUntilSignIn(signInAt: number) {
  let state: WakeState = 'waiting';
  for (let t = 1; t <= 600; t++) {
    state = phaseFor(t, state);
    const agentRunning = t >= signInAt + 5;   // Windows starts it at log on
    const pollTick = t % 10 === 0;
    if (agentRunning && pollTick && canConfirmFromOutside(state, t * 1000)) {
      return { state: 'awake' as WakeState, shownAt: t };
    }
  }
  return { state, shownAt: null as number | null };
}

for (const signInAt of [25, 95, 240, 400]) {
  const result = runUntilSignIn(signInAt);
  is(`signed in at ${signInAt}s -> Awake (shown at ${result.shownAt}s)`, result.state, 'awake');
}

console.log('\n=== a PC that genuinely never comes up ===');
{
  let state: WakeState = 'waiting';
  for (let t = 1; t <= 600; t++) state = phaseFor(t, state);
  is('still reports failure', state, 'gaveup');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

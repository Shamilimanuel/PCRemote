import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The button sounds, baked to files by scripts/build-sounds.js.
 *
 * Players are created once and rewound rather than recreated, so a fast series
 * of taps doesn't pile up allocations. Every failure here is swallowed: a
 * missing sound should never be the reason an action doesn't happen.
 */

export type Voice =
  | 'tap' | 'wake' | 'restart' | 'sleep' | 'lock'
  | 'shutdown' | 'cancel' | 'bios' | 'done' | 'fail';

const FILES: Record<Voice, number> = {
  tap: require('../../assets/sounds/tap.wav'),
  wake: require('../../assets/sounds/wake.wav'),
  restart: require('../../assets/sounds/restart.wav'),
  sleep: require('../../assets/sounds/sleep.wav'),
  lock: require('../../assets/sounds/lock.wav'),
  shutdown: require('../../assets/sounds/shutdown.wav'),
  cancel: require('../../assets/sounds/cancel.wav'),
  bios: require('../../assets/sounds/bios.wav'),
  done: require('../../assets/sounds/done.wav'),
  fail: require('../../assets/sounds/fail.wav'),
};

const players = new Map<Voice, AudioPlayer>();
let enabled = true;
let configured = false;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

async function configure() {
  if (configured) return;
  configured = true;
  try {
    await setAudioModeAsync({
      // This was false, meaning to respect the iOS silent switch. On Android it
      // means something else entirely: "playback is suppressed when the ringer
      // mode is silent or vibrate". So anyone whose phone was on vibrate -- most
      // people, most of the time -- got no button sounds at all, while the app's
      // own Sound setting sat there switched on, promising otherwise.
      //
      // These are not notifications. They are feedback for a button the person
      // just deliberately pressed, and the switch in Settings is the control for
      // them. That switch should be the only thing that silences them.
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      // The documented choice for UI feedback: no audio focus is requested, so
      // a tap never interrupts or ducks someone's music.
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // Older or unusual devices: play anyway rather than staying silent.
  }
}

export function play(voice: Voice) {
  if (!enabled) return;
  void configure();

  void (async () => {
    try {
      let player = players.get(voice);
      if (!player) {
        player = createAudioPlayer(FILES[voice]);
        players.set(voice, player);
      }
      // seekTo(0) rather than a new player, so rapid taps retrigger cleanly --
      // but awaited. It returns a promise, and play() used to be called while
      // the rewind was still in flight, which leaves the player sitting at the
      // end of the clip it just finished. Pressing the same button twice could
      // therefore produce silence the second time.
      await player.seekTo(0);
      player.play();
    } catch {
      // Sound is a nicety. Never let it break the button.
    }
  })();
}

/** Frees the native players. Called when the app unmounts. */
export function releaseSounds() {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // already gone
    }
  }
  players.clear();
}

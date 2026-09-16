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
    // Mix with whatever else is playing, and respect the silent switch --
    // a button click has no business interrupting someone's music.
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // Older or unusual devices: play anyway rather than staying silent.
  }
}

export function play(voice: Voice) {
  if (!enabled) return;
  void configure();

  try {
    let player = players.get(voice);
    if (!player) {
      player = createAudioPlayer(FILES[voice]);
      players.set(voice, player);
    }
    // seekTo(0) rather than a new player, so rapid taps retrigger cleanly.
    void player.seekTo(0);
    player.play();
  } catch {
    // Sound is a nicety. Never let it break the button.
  }
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

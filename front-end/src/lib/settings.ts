import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName } from '../theme/clay';

export type ConfirmStyle = 'dialog' | 'hold' | 'off';

const KEY = 'reveille:settings';

export type Settings = {
  theme: ThemeName;
  sound: boolean;
  haptics: boolean;
  /**
   * How shutdown, restart and BIOS ask for confirmation.
   *   dialog  a panel with two buttons
   *   hold    press and hold the button itself until it fills
   *   off     fire immediately
   */
  confirmStyle: ConfirmStyle;
  /** Seconds between health polls. 0 turns polling off to save battery. */
  pollSeconds: number;
};

export const DEFAULTS: Settings = {
  theme: 'midnight',
  sound: true,
  haptics: true,
  confirmStyle: 'hold',
  pollSeconds: 10,
};

/** How long a hold-to-confirm press must last. */
export const HOLD_MS = 1400;

export const POLL_CHOICES = [10, 30, 0];

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    // Carried over from when this was a boolean.
    if (saved.confirmStyle === undefined && saved.confirmDestructive !== undefined) {
      saved.confirmStyle = saved.confirmDestructive ? 'dialog' : 'off';
      delete saved.confirmDestructive;
    }
    // Spread over the defaults so a setting added later doesn't come back
    // undefined for anyone who already has a saved file.
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not worth interrupting anyone over; it reverts to defaults next launch.
  }
}

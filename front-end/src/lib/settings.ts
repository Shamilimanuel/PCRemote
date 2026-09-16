import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName } from '../theme/clay';

const KEY = 'reveille:settings';

export type Settings = {
  theme: ThemeName;
  sound: boolean;
  haptics: boolean;
  /** Ask before shutdown and restart. Off trades a safety net for speed. */
  confirmDestructive: boolean;
  /** Seconds between health polls. 0 turns polling off to save battery. */
  pollSeconds: number;
};

export const DEFAULTS: Settings = {
  theme: 'midnight',
  sound: true,
  haptics: true,
  confirmDestructive: true,
  pollSeconds: 10,
};

export const POLL_CHOICES = [10, 30, 0];

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
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

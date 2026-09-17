import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Device } from '../types/device';

/**
 * Where saved PCs live on the phone.
 *
 * Everything except the token goes in AsyncStorage, which is an ordinary file
 * in the app's data directory. The token does not: it is the one piece that
 * lets anything shut this machine down, and it belongs behind the Android
 * Keystore rather than in plain text next to the hostname.
 *
 * Devices saved before this change have their token in the AsyncStorage blob.
 * getDevices moves those across the first time it reads them, so nobody has to
 * pair again -- see migrate below.
 */

// Predates the rename to Reveille. Changing it would orphan every PC
// already saved on the phone, so it stays as it is.
const DEVICES_KEY = 'pc-remote:devices';

/** SecureStore keys must be alphanumeric, '.', '-' or '_'; device ids contain '-'. */
function tokenKey(id: string): string {
  return `reveille_token_${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function readToken(id: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(tokenKey(id))) ?? '';
  } catch {
    // A device with no readable token is useless but must not crash the list;
    // the PC simply fails to authenticate and can be re-paired.
    return '';
  }
}

async function writeToken(id: string, token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(tokenKey(id), token);
  } catch {
    // Nothing sensible to do here. Rather than lose the device entirely, the
    // token falls back to living in the record, which is where it used to be.
  }
}

async function forgetToken(id: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(tokenKey(id));
  } catch {
    // Already gone, or the store is unavailable. Either way, nothing to undo.
  }
}

type StoredDevice = Omit<Device, 'token'> & { token?: string };

async function readList(): Promise<StoredDevice[]> {
  const raw = await AsyncStorage.getItem(DEVICES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredDevice[]) : [];
  } catch {
    return [];
  }
}

async function writeList(devices: StoredDevice[]): Promise<void> {
  await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export async function getDevices(): Promise<Device[]> {
  const stored = await readList();

  // Anything still carrying a token inline was saved by an older version.
  // Move it into the keystore and strip it from the plain-text record.
  const needsMigrating = stored.some((d) => typeof d.token === 'string' && d.token);
  if (needsMigrating) {
    for (const device of stored) {
      if (device.token) await writeToken(device.id, device.token);
    }
    await writeList(stored.map(({ token, ...rest }) => rest));
  }

  return Promise.all(
    stored.map(async (device) => ({
      ...device,
      // The inline token is still preferred for this one read, in case writing
      // to the keystore just failed; the next read will use the stored copy.
      token: device.token || (await readToken(device.id)),
    }))
  );
}

export async function saveDevice(device: Device): Promise<void> {
  await writeToken(device.id, device.token);

  const stored = await readList();
  const { token, ...withoutToken } = device;
  const index = stored.findIndex((d) => d.id === device.id);
  if (index >= 0) {
    stored[index] = withoutToken;
  } else {
    stored.push(withoutToken);
  }
  await writeList(stored);
}

export async function deleteDevice(id: string): Promise<void> {
  await forgetToken(id);
  const stored = await readList();
  await writeList(stored.filter((d) => d.id !== id));
}

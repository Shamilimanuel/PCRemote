import AsyncStorage from '@react-native-async-storage/async-storage';
import { Device } from '../types/device';

// Predates the rename to Reveille. Changing it would orphan every PC
// already saved on the phone, so it stays as it is.
const DEVICES_KEY = 'pc-remote:devices';

export async function getDevices(): Promise<Device[]> {
  const raw = await AsyncStorage.getItem(DEVICES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Device[];
  } catch {
    return [];
  }
}

export async function saveDevice(device: Device): Promise<void> {
  const devices = await getDevices();
  const index = devices.findIndex((d) => d.id === device.id);
  if (index >= 0) {
    devices[index] = device;
  } else {
    devices.push(device);
  }
  await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export async function deleteDevice(id: string): Promise<void> {
  const devices = await getDevices();
  const next = devices.filter((d) => d.id !== id);
  await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(next));
}

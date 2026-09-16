import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Device } from './src/types/device';
import { getDevices, saveDevice, deleteDevice } from './src/lib/storage';
import DeviceListScreen from './src/screens/DeviceListScreen';
import DeviceFormScreen from './src/screens/DeviceFormScreen';
import ControlScreen from './src/screens/ControlScreen';
import ScanScreen from './src/screens/ScanScreen';

type Screen = 'list' | 'add' | 'edit' | 'control' | 'scan';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<Screen>('list');
  const [selected, setSelected] = useState<Device | null>(null);
  // Filled by a scan, handed to the form as its starting values.
  const [scanned, setScanned] = useState<Omit<Device, 'id'> | null>(null);

  const refresh = useCallback(async () => {
    setDevices(await getDevices());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator color="#3D7EFF" />
        </View>
      </SafeAreaProvider>
    );
  }

  async function handleSave(device: Device) {
    await saveDevice(device);
    await refresh();
    setScanned(null);
    setSelected(device);
    setView('control');
  }

  async function handleDelete() {
    if (!selected) return;
    await deleteDevice(selected.id);
    await refresh();
    setSelected(null);
    setView('list');
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        {view === 'list' && (
          <DeviceListScreen
            devices={devices}
            onSelect={(device) => {
              setSelected(device);
              setView('control');
            }}
            onAdd={() => {
              setSelected(null);
              setView('add');
            }}
          />
        )}

        {(view === 'add' || view === 'edit') && (
          <DeviceFormScreen
            initial={
              view === 'edit' && selected
                ? selected
                : scanned
                ? { id: '', ...scanned }
                : undefined
            }
            isNew={view === 'add'}
            onScan={() => setView('scan')}
            onSave={handleSave}
            onCancel={() => setView(selected ? 'control' : 'list')}
            onDelete={view === 'edit' ? handleDelete : undefined}
          />
        )}

        {view === 'scan' && (
          <ScanScreen
            onScanned={(device) => {
              setScanned(device);
              setView('add');
            }}
            onCancel={() => setView('add')}
          />
        )}

        {view === 'control' && selected && (
          <ControlScreen device={selected} onBack={() => setView('list')} onEdit={() => setView('edit')} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1115' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1115' },
});

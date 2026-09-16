import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { DialogProvider } from './src/components/Dialog';
import { Device } from './src/types/device';
import { getDevices, saveDevice, deleteDevice } from './src/lib/storage';
import DeviceListScreen from './src/screens/DeviceListScreen';
import DeviceFormScreen from './src/screens/DeviceFormScreen';
import ControlScreen from './src/screens/ControlScreen';
import ScanScreen from './src/screens/ScanScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type Screen = 'list' | 'add' | 'edit' | 'control' | 'scan' | 'settings';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DialogProvider>
          <Shell />
        </DialogProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { theme, ready: themeReady } = useTheme();
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

  const handleSave = useCallback(
    async (device: Device) => {
      await saveDevice(device);
      await refresh();
      setScanned(null);
      setSelected(device);
      setView('control');
    },
    [refresh]
  );

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    await deleteDevice(selected.id);
    await refresh();
    setSelected(null);
    setView('list');
  }, [selected, refresh]);

  if (loading || !themeReady) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.ground }]}>
        <ActivityIndicator color={theme.dusk} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.ground }]}>
      {/* Dawn is a light theme; the other two want light status bar text. */}
      <StatusBar style={theme.name === 'dawn' ? 'dark' : 'light'} />

      {view === 'list' && (
        <DeviceListScreen
          devices={devices}
          onSettings={() => setView('settings')}
          onSelect={(device) => {
            setSelected(device);
            setView('control');
          }}
          onAdd={() => {
            setSelected(null);
            setScanned(null);
            setView('add');
          }}
        />
      )}

      {(view === 'add' || view === 'edit') && (
        <DeviceFormScreen
          initial={
            view === 'edit' && selected ? selected : scanned ? { id: '', ...scanned } : undefined
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
        <ControlScreen
          device={selected}
          onBack={() => setView('list')}
          onEdit={() => setView('edit')}
          onSettings={() => setView('settings')}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen onBack={() => setView(selected ? 'control' : 'list')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import StatusPill from '../components/StatusPill';
import UpdateBanner from '../components/UpdateBanner';

type Props = {
  devices: Device[];
  onSelect: (device: Device) => void;
  onAdd: () => void;
};

export default function DeviceListScreen({ devices, onSelect, onAdd }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reveille</Text>
        <Pressable style={styles.addButton} onPress={onAdd}>
          <Text style={styles.addButtonText}>+ Add PC</Text>
        </Pressable>
      </View>

      <UpdateBanner />

      {devices.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No PCs added yet.</Text>
          <Text style={styles.emptySubtext}>
            Run the agent on your PC, then tap "+ Add PC" and enter the details it prints out.
          </Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <DeviceCard device={item} onPress={() => onSelect(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function DeviceCard({ device, onPress }: { device: Device; onPress: () => void }) {
  const { status } = useDeviceStatus(device);

  return (
    <Pressable style={styles.deviceCard} onPress={onPress}>
      <View style={styles.deviceCardText}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceMeta}>
          {device.ip}:{device.port}
        </Text>
      </View>
      <StatusPill status={status} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  addButton: {
    backgroundColor: '#3D7EFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  deviceCard: {
    backgroundColor: '#1B1E27',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deviceCardText: { flexShrink: 1 },
  deviceName: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  deviceMeta: { color: '#8A8F9C', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { color: '#8A8F9C', textAlign: 'center', lineHeight: 20 },
});

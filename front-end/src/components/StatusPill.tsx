import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DeviceStatus } from '../types/device';

const LABELS: Record<DeviceStatus, string> = {
  unknown: 'Checking…',
  online: 'Online',
  locked: 'Lock screen',
  offline: 'Offline',
};

const COLORS: Record<DeviceStatus, string> = {
  unknown: '#8A8F9C',
  online: '#5FD68C',
  // Amber rather than green: the PC is on, but nothing here can act on it yet.
  locked: '#E0B15F',
  offline: '#5A5F6B',
};

export default function StatusPill({ status, detail }: { status: DeviceStatus; detail?: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: COLORS[status] }]} />
      <Text style={[styles.label, { color: COLORS[status] }]}>{LABELS[status]}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  detail: { color: '#5A5F6B', fontSize: 13 },
});

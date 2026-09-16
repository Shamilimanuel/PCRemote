import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device, DeviceStatus, HealthResponse, NetworkInterface, Route } from '../types/device';
import { NetworkIcon, AlertIcon } from './icons';

type Props = {
  device: Device;
  health: HealthResponse | null;
  latencyMs: number | null;
  status: DeviceStatus;
  route: Route | null;
};

function normalizeMac(mac: string): string {
  return mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

function formatMac(mac: string): string {
  const hex = normalizeMac(mac);
  if (hex.length !== 12) return mac.toUpperCase();
  return (hex.match(/../g) ?? []).join(':').toUpperCase();
}

/** The adapter the agent is actually answering on, matched by the address we dialled. */
function activeInterface(device: Device, health: HealthResponse | null): NetworkInterface | null {
  const interfaces = health?.interfaces;
  if (!interfaces || interfaces.length === 0) return null;
  return interfaces.find((entry) => entry.ip === device.ip) ?? interfaces[0];
}

export default function NetworkInfo({ device, health, latencyMs, status, route }: Props) {
  const active = activeInterface(device, health);
  const offline = status !== 'online';

  // A saved MAC that doesn't belong to this adapter is the quiet failure mode
  // behind "Start does nothing" -- the magic packet goes out addressed to a
  // machine that isn't there.
  const macMismatch = Boolean(active && normalizeMac(active.mac) !== normalizeMac(device.mac));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <NetworkIcon size={16} color="#8A8F9C" strokeWidth={1.7} />
        <Text style={styles.cardTitle}>Network</Text>
      </View>

      <Row label="Host name" value={health?.hostname ?? (offline ? 'Unknown until online' : '—')} muted={offline} />
      <Row label="Adapter" value={active?.interface ?? (offline ? 'Unknown until online' : '—')} muted={offline} />
      <Row label="IP address" value={`${device.ip}:${device.port}`} />
      {device.remoteHost ? (
        <Row
          label="Reached via"
          value={route === 'remote' ? `${device.remoteHost} (away)` : route === 'local' ? 'Home Wi-Fi' : '—'}
          muted={offline}
        />
      ) : null}
      <Row label="Subnet mask" value={active?.netmask ?? '—'} muted={offline} />
      <Row label="Wake broadcast" value={active?.broadcast ?? `${device.ip.split('.').slice(0, 3).join('.')}.255`} />
      <Row label="MAC address" value={formatMac(device.mac)} warn={macMismatch} />
      <Row
        label="Response time"
        value={latencyMs === null ? 'No reply' : `${latencyMs} ms`}
        muted={latencyMs === null}
      />

      {macMismatch && active && (
        <View style={styles.warning}>
          <AlertIcon size={14} color="#E0A33E" strokeWidth={1.8} />
          <Text style={styles.warningText}>
            This adapter's MAC is {formatMac(active.mac)}. Start won't wake the PC until you tap Edit
            and correct it.
          </Text>
        </View>
      )}
    </View>
  );
}

function Row({ label, value, muted, warn }: { label: string; value: string; muted?: boolean; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted, warn && styles.rowValueWarn]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1B1E27',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardTitle: {
    color: '#8A8F9C',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2E3A',
  },
  rowLabel: { color: '#8A8F9C', fontSize: 13 },
  rowValue: { color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  rowValueMuted: { color: '#5A5F6B' },
  rowValueWarn: { color: '#E0A33E' },
  warning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#2A2317',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  warningText: { color: '#E0A33E', fontSize: 12, lineHeight: 17, flexShrink: 1 },
});

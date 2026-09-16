import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device, DeviceStatus, HealthResponse, NetworkInterface, Route } from '../types/device';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';
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
  const { theme, t } = useTheme();
  const active = activeInterface(device, health);
  const offline = status !== 'online';

  // A saved MAC that doesn't belong to this adapter is the quiet failure mode
  // behind "Wake does nothing" -- the packet goes out addressed to a machine
  // that isn't there.
  const macMismatch = Boolean(active && normalizeMac(active.mac) !== normalizeMac(device.mac));

  return (
    <View style={[styles.card, sunken(theme, 0.8)]}>
      <View style={styles.head}>
        <NetworkIcon size={15} color={theme.ink3} strokeWidth={1.8} />
        <Text style={[styles.headText, { color: theme.ink3 }]}>{t.network}</Text>
      </View>

      <Row label={t.hostName} value={health?.hostname ?? (offline ? t.unknownUntilAwake : '—')} muted={offline} />
      <Row label={t.adapter} value={active?.interface ?? (offline ? t.unknownUntilAwake : '—')} muted={offline} />
      <Row label={t.ipAddress} value={device.ip} />
      <Row label={t.port} value={String(device.port)} />
      {device.remoteHost ? (
        <Row
          label={t.reachedVia}
          value={route === 'remote' ? t.away : route === 'local' ? t.homeWifi : '—'}
          muted={offline}
        />
      ) : null}
      <Row label={t.subnetMask} value={active?.netmask ?? '—'} muted={offline} />
      <Row
        label={t.wakeBroadcast}
        value={active?.broadcast ?? `${device.ip.split('.').slice(0, 3).join('.')}.255`}
      />
      <Row label={t.macAddress} value={formatMac(device.mac)} warn={macMismatch} />
      <Row
        label={t.responseTime}
        value={latencyMs === null ? t.noReply : `${latencyMs} ms`}
        muted={latencyMs === null}
      />

      {macMismatch && active && (
        <View style={[styles.warning, { backgroundColor: theme.ground }]}>
          <AlertIcon size={14} color={theme.dawnDeep} strokeWidth={1.9} />
          <Text style={[styles.warningText, { color: theme.dawnDeep }]}>
            {t.macMismatch(formatMac(active.mac))}
          </Text>
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  muted,
  warn,
}: {
  label: string;
  value: string;
  muted?: boolean;
  warn?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: theme.ground }]}>
      <Text style={[styles.rowLabel, { color: theme.ink3 }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: warn ? theme.dawnDeep : muted ? theme.ink3 : theme.ink },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 4, marginTop: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 13, paddingBottom: 8 },
  headText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 12.5, fontWeight: '700' },
  rowValue: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
  },
  warning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 11,
    marginVertical: 10,
  },
  warningText: { fontSize: 12, lineHeight: 17, flexShrink: 1, fontWeight: '600' },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MachineStats } from '../types/device';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';

/**
 * What the machine is doing, so "is that render finished" is answerable from
 * the sofa. Bars rather than numbers alone: the question is almost always
 * "busy or not", and a bar answers that at a glance.
 */

function gb(bytes: number): string {
  return `${(bytes / 1073741824).toFixed(bytes >= 107374182400 ? 0 : 1)} GB`;
}

export default function Vitals({ stats }: { stats: MachineStats | null | undefined }) {
  const { theme } = useTheme();
  if (!stats) return null;

  const memUsed = stats.memory.totalBytes - stats.memory.freeBytes;
  const diskUsedPercent = stats.disk
    ? Math.round(100 * (1 - stats.disk.freeBytes / stats.disk.totalBytes))
    : null;

  return (
    <View style={[styles.card, sunken(theme, 0.8)]}>
      <Bar
        label="Processor"
        percent={stats.cpuPercent}
        detail={stats.cpuPercent === null ? 'measuring…' : `${stats.cores} cores`}
      />
      <Bar
        label="Memory"
        percent={stats.memory.usedPercent}
        detail={`${gb(memUsed)} of ${gb(stats.memory.totalBytes)}`}
      />
      {stats.disk && diskUsedPercent !== null && (
        <Bar
          label={`Disk ${stats.disk.drive}`}
          percent={diskUsedPercent}
          detail={`${gb(stats.disk.freeBytes)} free`}
          // Disk fills up permanently rather than fluctuating, so a high
          // reading is only worth flagging when it is genuinely nearly full.
          warnAbove={90}
        />
      )}
    </View>
  );
}

function Bar({
  label,
  percent,
  detail,
  warnAbove = 85,
}: {
  label: string;
  percent: number | null;
  detail: string;
  warnAbove?: number;
}) {
  const { theme } = useTheme();
  const value = percent ?? 0;
  const colour = percent === null ? theme.ink3 : value >= warnAbove ? theme.dawnDeep : theme.moss;

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: theme.ink2 }]}>{label}</Text>
        <Text style={[styles.value, { color: percent === null ? theme.ink3 : theme.ink }]}>
          {percent === null ? '—' : `${percent}%`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.ground }]}>
        <View style={[styles.fill, { width: `${Math.max(2, value)}%`, backgroundColor: colour }]} />
      </View>
      <Text style={[styles.detail, { color: theme.ink3 }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.card,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 14,
    gap: 15,
  },
  row: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 12.5, fontWeight: '700' },
  value: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  detail: { fontSize: 11, fontWeight: '600' },
});

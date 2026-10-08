import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ActivityEntry, Device } from '../../types/device';
import { getActivity } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, sunken } from '../../theme/clay';
import type { Strings } from '../../i18n';
import Sheet from '../Sheet';

/**
 * What was done to the PC, newest first. Mostly reassurance; occasionally the
 * way someone finds out their pairing code is not as private as they thought.
 */
export default function ActivitySheet({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEntries(null);
    setError(null);
    getActivity(device, 60)
      .then(({ data }) => setEntries(data.entries))
      .catch((err) => {
        setEntries([]);
        setError(explain(err, t).message);
      });
  }, [visible, device, t]);

  return (
    <Sheet visible={visible} title={t.activityTitle} subtitle={t.activityHint} onClose={onClose}>
      {entries === null ? (
        <ActivityIndicator color={theme.dusk} style={styles.spinner} />
      ) : error ? (
        <Text style={[styles.empty, { color: theme.danger }]}>{error}</Text>
      ) : entries.length === 0 ? (
        <Text style={[styles.empty, { color: theme.ink2 }]}>{t.activityEmpty}</Text>
      ) : (
        <View style={[styles.list, sunken(theme, 0.6)]}>
          {entries.map((entry, i) => (
            <View
              key={`${entry.at}-${i}`}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ink3 }]}
            >
              <View style={styles.rowHead}>
                <Text style={[styles.what, { color: theme.ink }]} numberOfLines={1}>
                  {t.activityLabels[entry.action] ?? entry.action}
                </Text>
                <Text style={[styles.when, { color: theme.ink3 }]}>{when(entry.at, t)}</Text>
              </View>
              {entry.detail ? (
                <Text style={[styles.detail, { color: theme.ink2 }]} numberOfLines={2}>{entry.detail}</Text>
              ) : null}
              {entry.client || entry.from ? (
                <Text style={[styles.who, { color: theme.ink3 }]} numberOfLines={1}>
                  {[entry.client, entry.from].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

/** "14:05" today, "Tue 14:05" this week, "3 Oct 14:05" before that. */
function when(iso: string, t: Strings): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return time;
  if (d.getTime() >= startOfToday - 6 * 86400000) return `${t.dayNames[d.getDay()]} ${time}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${time}`;
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 24 },
  empty: { fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  list: { borderRadius: RADIUS.field, paddingHorizontal: 14 },
  row: { paddingVertical: 11, gap: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  what: { flex: 1, fontSize: 14, fontWeight: '800' },
  when: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12.5, fontWeight: '600' },
  who: { fontSize: 11.5, fontWeight: '600' },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppEntry, Device } from '../../types/device';
import { launchApp, listApps } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, raised, pressed as pressedStyle } from '../../theme/clay';
import { play } from '../../lib/sound';
import { successFeedback, failureFeedback, tapFeedback } from '../../lib/haptics';
import Sheet from '../Sheet';
import { AppsIcon } from '../icons';

/**
 * The games and programs this PC's owner put on its list. The phone sends
 * which one; it never names a program itself, so it can only ever start what
 * is shown here.
 */
export default function AppsSheet({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const [apps, setApps] = useState<AppEntry[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStatus(null);
    setApps(null);
    listApps(device)
      .then(({ data }) => setApps(data.apps))
      .catch((err) => {
        setApps([]);
        setStatus({ ok: false, text: explain(err, t).message });
      });
  }, [visible, device, t]);

  async function start(app: AppEntry) {
    setStarting(app.id);
    setStatus(null);
    try {
      await launchApp(device, app.id);
      setStatus({ ok: true, text: t.appStarting(app.name) });
      play('done');
      successFeedback();
    } catch (err) {
      setStatus({ ok: false, text: explain(err, t).message });
      play('fail');
      failureFeedback();
    } finally {
      setStarting(null);
    }
  }

  return (
    <Sheet visible={visible} title={t.appsTitle(device.name)} subtitle={t.appsHint} onClose={onClose}>
      {apps === null ? (
        <ActivityIndicator color={theme.dusk} style={styles.spinner} />
      ) : apps.length === 0 && !status ? (
        <Text style={[styles.empty, { color: theme.ink2 }]}>{t.appsEmpty}</Text>
      ) : (
        <View style={styles.list}>
          {apps.map((app) => (
            <AppRow key={app.id} app={app} busy={starting === app.id} onPress={() => start(app)} />
          ))}
        </View>
      )}
      {status && <Text style={[styles.status, { color: status.ok ? theme.moss : theme.danger }]}>{status.text}</Text>}
    </Sheet>
  );
}

function AppRow({ app, busy, onPress }: { app: AppEntry; busy: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); play('tap'); tapFeedback(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      disabled={busy}
      style={[styles.row, raised(theme, 0.55), down && pressedStyle(theme)]}
      accessibilityRole="button"
      accessibilityLabel={app.name}
    >
      <View style={[styles.icon, { backgroundColor: theme.ground }]}>
        <AppsIcon size={18} color={theme.dusk} strokeWidth={2} />
      </View>
      <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>{app.name}</Text>
      {busy && <ActivityIndicator color={theme.dusk} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 24 },
  empty: { fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '800' },
  status: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
});

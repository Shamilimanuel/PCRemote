import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Device, ScreenShot } from '../../types/device';
import { getScreen } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, sunken, filled } from '../../theme/clay';
import { tapFeedback } from '../../lib/haptics';

/**
 * What is on the PC's main screen, refreshed while this is open.
 *
 * One picture at a time: the next is asked for only once the last has
 * arrived, so a slow network shows a slower picture rather than a growing
 * queue. Closing it, or pausing, stops asking -- the PC only ever sends a
 * picture someone is looking at, and says on its own screen that someone is.
 *
 * Tap the picture to see it at full size and scroll around it.
 */

const GAP_MS = 600;

type Problem = { kind: 'off' | 'locked' | 'other'; text: string } | null;

export default function ScreenViewer({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [shot, setShot] = useState<ScreenShot | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [live, setLive] = useState(true);
  const [sharp, setSharp] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [, tick] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    if (!visible) {
      setShot(null);
      setProblem(null);
      setZoomed(false);
      return;
    }
    if (!live) return;

    running.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const next = async () => {
      if (!running.current) return;
      try {
        const { data } = await getScreen(device, sharp ? 1920 : 1280, sharp ? 75 : 60);
        if (!running.current) return;
        setShot(data);
        setProblem(null);
      } catch (err) {
        if (!running.current) return;
        const message = err instanceof Error ? err.message : String(err);
        if (/switched off/i.test(message)) setProblem({ kind: 'off', text: t.screenOffBody });
        else if (/locked/i.test(message)) setProblem({ kind: 'locked', text: t.screenLocked });
        else setProblem({ kind: 'other', text: explain(err, t).message });
      }
      if (running.current) timer = setTimeout(next, GAP_MS);
    };
    next();

    // Keeps "3s ago" honest while paused or between pictures.
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      running.current = false;
      if (timer) clearTimeout(timer);
      clearInterval(clock);
    };
  }, [visible, live, sharp, device, t]);

  const age = shot ? Math.max(0, Math.round((Date.now() - new Date(shot.at).getTime()) / 1000)) : 0;
  const fitWidth = window.width;
  const fitHeight = shot ? Math.min(window.height * 0.75, (fitWidth * shot.height) / shot.width) : fitWidth * 0.5625;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: '#05040A', paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.close, { color: theme.dusk }]}>{t.close}</Text>
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>{device.name}</Text>
          <View style={styles.toggles}>
            <Toggle label={t.screenSharp} on={sharp} onPress={() => setSharp((v) => !v)} />
            <Toggle label={live ? t.screenLive : t.screenPaused} on={live} onPress={() => setLive((v) => !v)} />
          </View>
        </View>

        <View style={styles.stage}>
          {problem && !shot ? (
            <View style={[styles.problem, sunken(theme, 0.6)]}>
              <Text style={[styles.problemTitle, { color: theme.ink }]}>
                {problem.kind === 'off' ? t.screenOffTitle : problem.kind === 'locked' ? t.lock : t.errGenericTitle}
              </Text>
              <Text style={[styles.problemText, { color: theme.ink2 }]}>{problem.text}</Text>
            </View>
          ) : !shot ? (
            <ActivityIndicator color={theme.dusk} size="large" />
          ) : zoomed ? (
            <ScrollView horizontal bounces={false} contentContainerStyle={styles.zoomOuter}>
              <ScrollView bounces={false}>
                <Pressable onPress={() => { tapFeedback(); setZoomed(false); }}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${shot.jpeg}` }}
                    style={{ width: shot.width, height: shot.height }}
                    fadeDuration={0}
                  />
                </Pressable>
              </ScrollView>
            </ScrollView>
          ) : (
            <Pressable onPress={() => { tapFeedback(); setZoomed(true); }} accessibilityRole="imagebutton" accessibilityLabel={device.name}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${shot.jpeg}` }}
                style={{ width: fitWidth, height: fitHeight }}
                resizeMode="contain"
                fadeDuration={0}
              />
            </Pressable>
          )}
        </View>

        <View style={styles.foot}>
          {shot && (
            <Text style={styles.footText}>
              {live ? t.screenLive : t.screenPaused} · {t.screenAgo(age)}
              {problem ? ` · ${problem.text}` : ''}
            </Text>
          )}
          <Text style={styles.notice}>{t.screenNotice}</Text>
        </View>
      </View>
    </Modal>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => { tapFeedback(); onPress(); }}
      style={[styles.toggle, on ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)') : { backgroundColor: 'rgba(255,255,255,0.08)' }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <Text style={[styles.toggleText, { color: on ? theme.onFill : '#C9C2DC' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  close: { fontSize: 15, fontWeight: '800' },
  name: { flex: 1, color: '#F2EEFA', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  toggles: { flexDirection: 'row', gap: 6 },
  toggle: { borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 11 },
  toggleText: { fontSize: 11.5, fontWeight: '800' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomOuter: { alignItems: 'center' },
  problem: { marginHorizontal: 24, borderRadius: RADIUS.card, padding: 20, gap: 8 },
  problemTitle: { fontSize: 17, fontWeight: '800' },
  problemText: { fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  foot: { paddingHorizontal: 18, gap: 4 },
  footText: { color: '#C9C2DC', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  notice: { color: '#8D85A6', fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});

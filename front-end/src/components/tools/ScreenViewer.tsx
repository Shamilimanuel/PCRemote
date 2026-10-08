import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Device } from '../../types/device';
import { getScreen } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, sunken, filled } from '../../theme/clay';
import { tapFeedback } from '../../lib/haptics';

/**
 * What is on the PC's main screen, refreshed while this is open.
 *
 * Three things keep it quick and steady:
 *
 *   - The next picture is asked for as soon as the last one is on screen,
 *     not after a fixed pause, so a fast network gets a fast picture and a
 *     slow one never builds up a queue.
 *   - The phone sends the fingerprint of the picture it has. If the screen has
 *     not changed, the PC says so in a few bytes instead of sending it again.
 *   - A new picture is decoded out of sight, behind the one showing, and only
 *     then swapped in. Showing it the moment it arrived is what made the
 *     larger "Sharp" pictures blink: there was a blank frame while each one
 *     decoded.
 *
 * Closing it, or pausing, stops asking. The PC shows a notice of its own
 * whenever someone starts watching, and never sends the lock screen.
 */

const PAUSE_MS = 120;
const LOAD_TIMEOUT_MS = 4000;

type Picture = { uri: string; width: number; height: number; at: string };
type Problem = { kind: 'off' | 'locked' | 'other'; text: string } | null;

export default function ScreenViewer({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [shown, setShown] = useState<Picture | null>(null);
  const [incoming, setIncoming] = useState<Picture | null>(null);
  const [checkedAt, setCheckedAt] = useState<number>(0);
  const [problem, setProblem] = useState<Problem>(null);
  const [live, setLive] = useState(true);
  const [sharp, setSharp] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [, tick] = useState(0);
  const hash = useRef<string>('');
  const loaded = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) {
      setShown(null);
      setIncoming(null);
      setProblem(null);
      setZoomed(false);
      hash.current = '';
      return;
    }
    if (!live) return;

    let running = true;
    // A change of size gets a fresh picture rather than "unchanged".
    hash.current = '';

    const loop = async () => {
      while (running) {
        try {
          const { data } = await getScreen(device, sharp ? 1920 : 1280, sharp ? 72 : 55, hash.current || undefined);
          if (!running) return;
          setProblem(null);
          setCheckedAt(Date.now());
          if (!data.same && data.jpeg) {
            hash.current = data.hash;
            // Decode behind the picture already showing, then swap.
            await new Promise<void>((resolve) => {
              loaded.current = resolve;
              setIncoming({ uri: `data:image/jpeg;base64,${data.jpeg}`, width: data.width, height: data.height, at: data.at });
              setTimeout(resolve, LOAD_TIMEOUT_MS);
            });
            loaded.current = null;
          }
        } catch (err) {
          if (!running) return;
          const message = err instanceof Error ? err.message : String(err);
          if (/switched off/i.test(message)) setProblem({ kind: 'off', text: t.screenOffBody });
          else if (/locked/i.test(message)) setProblem({ kind: 'locked', text: t.screenLocked });
          else setProblem({ kind: 'other', text: explain(err, t).message });
          // Something is wrong; ask again, but not as fast.
          await new Promise((r) => setTimeout(r, 1500));
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    };
    loop();

    // Keeps "3s ago" honest while paused or between pictures.
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      running = false;
      loaded.current?.();
      clearInterval(clock);
    };
  }, [visible, live, sharp, device, t]);

  const onIncomingLoaded = () => {
    if (incoming) setShown(incoming);
    setIncoming(null);
    loaded.current?.();
  };

  const age = checkedAt ? Math.max(0, Math.round((Date.now() - checkedAt) / 1000)) : 0;
  const ratio = shown ? shown.height / shown.width : incoming ? incoming.height / incoming.width : 0.5625;
  const fitWidth = window.width;
  const fitHeight = Math.min(window.height * 0.75, fitWidth * ratio);
  const frame = { width: fitWidth, height: fitHeight };

  // While locked or switched off, the last picture is not left up as if live.
  const blocked = problem && problem.kind !== 'other';

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
          {blocked ? (
            <View style={[styles.problem, sunken(theme, 0.6)]}>
              <Text style={[styles.problemTitle, { color: theme.ink }]}>
                {problem!.kind === 'off' ? t.screenOffTitle : t.lock}
              </Text>
              <Text style={[styles.problemText, { color: theme.ink2 }]}>{problem!.text}</Text>
            </View>
          ) : !shown && !incoming ? (
            problem ? (
              <View style={[styles.problem, sunken(theme, 0.6)]}>
                <Text style={[styles.problemTitle, { color: theme.ink }]}>{t.errGenericTitle}</Text>
                <Text style={[styles.problemText, { color: theme.ink2 }]}>{problem.text}</Text>
              </View>
            ) : (
              <ActivityIndicator color={theme.dusk} size="large" />
            )
          ) : zoomed && shown ? (
            <ScrollView horizontal bounces={false} contentContainerStyle={styles.zoomOuter}>
              <ScrollView bounces={false}>
                <Pressable onPress={() => { tapFeedback(); setZoomed(false); }}>
                  <Image source={{ uri: shown.uri }} style={{ width: shown.width, height: shown.height }} fadeDuration={0} />
                </Pressable>
              </ScrollView>
            </ScrollView>
          ) : (
            <Pressable onPress={() => { tapFeedback(); if (shown) setZoomed(true); }} accessibilityRole="imagebutton" accessibilityLabel={device.name}>
              <View style={frame}>
                {shown && (
                  <Image source={{ uri: shown.uri }} style={[StyleSheet.absoluteFill, frame]} resizeMode="contain" fadeDuration={0} />
                )}
                {incoming && (
                  // Decoded out of sight; shown only once it is ready.
                  <Image
                    source={{ uri: incoming.uri }}
                    style={[StyleSheet.absoluteFill, frame, styles.hidden]}
                    resizeMode="contain"
                    fadeDuration={0}
                    onLoad={onIncomingLoaded}
                    onError={onIncomingLoaded}
                  />
                )}
              </View>
            </Pressable>
          )}
        </View>

        <View style={styles.foot}>
          {(shown || incoming) && !blocked && (
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
  // Not quite 0: some Android versions skip loading a fully invisible image.
  hidden: { opacity: 0.01 },
  problem: { marginHorizontal: 24, borderRadius: RADIUS.card, padding: 20, gap: 8 },
  problemTitle: { fontSize: 17, fontWeight: '800' },
  problemText: { fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  foot: { paddingHorizontal: 18, gap: 4 },
  footText: { color: '#C9C2DC', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  notice: { color: '#8D85A6', fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});

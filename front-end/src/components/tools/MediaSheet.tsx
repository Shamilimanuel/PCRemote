import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Device, Volume } from '../../types/device';
import { getVolume, pressMediaKey, setVolume, MediaKey } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, filled, raised, sunken, pressed as pressedStyle } from '../../theme/clay';
import { play } from '../../lib/sound';
import { tapFeedback } from '../../lib/haptics';
import Sheet from '../Sheet';
import { IconProps, MuteIcon, NextIcon, PlayPauseIcon, PreviousIcon, SpeakerIcon } from '../icons';

/**
 * Volume, mute, and the media keys, for whatever is playing on the PC.
 *
 * The bar follows your finger at once and sends at most a few times a second
 * while you drag, then once more when you let go -- so the PC keeps up without
 * fifty requests for one swipe, and where you let go is where it ends up.
 */

const SEND_EVERY_MS = 180;

export default function MediaSheet({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const [volume, setVolumeState] = useState<Volume | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Refs, not state: the drag handler below is made once, and must always see
  // the latest of these rather than the values from the first render.
  const dragging = useRef(false);
  const width = useRef(1);
  const lastSent = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef<(change: Partial<Volume>) => void>(() => {});

  useEffect(() => {
    if (!visible) return;
    setError(null);
    getVolume(device)
      .then(({ data }) => setVolumeState(data))
      .catch((err) => setError(explain(err, t).message));
  }, [visible, device, t]);

  const send = useCallback(
    (change: Partial<Volume>) => {
      lastSent.current = Date.now();
      setVolume(device, change)
        .then(({ data }) => {
          setError(null);
          // While the finger is down, the bar belongs to the finger.
          setVolumeState((current) => (dragging.current && current ? { ...current, muted: data.muted } : data));
        })
        .catch((err) => setError(explain(err, t).message));
    },
    [device, t]
  );
  sendRef.current = send;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        dragging.current = true;
        tapFeedback();
        moveTo(e.nativeEvent.locationX, false);
      },
      onPanResponderMove: (e) => moveTo(e.nativeEvent.locationX, false),
      onPanResponderRelease: (e) => {
        dragging.current = false;
        moveTo(e.nativeEvent.locationX, true);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
      },
    })
  ).current;

  function moveTo(x: number, final: boolean) {
    const level = Math.max(0, Math.min(100, Math.round((x / width.current) * 100)));
    setVolumeState((current) => ({ level, muted: current?.muted ?? false }));
    if (trailing.current) clearTimeout(trailing.current);
    if (final || Date.now() - lastSent.current >= SEND_EVERY_MS) sendRef.current({ level });
    else trailing.current = setTimeout(() => sendRef.current({ level }), SEND_EVERY_MS);
  }

  const key = (which: MediaKey) => {
    pressMediaKey(device, which).then(() => setError(null)).catch((err) => setError(explain(err, t).message));
  };

  const level = volume?.level ?? 0;
  const muted = volume?.muted ?? false;

  return (
    <Sheet visible={visible} title={t.mediaTitle} subtitle={device.name} onClose={onClose} scroll={false}>
      <View style={styles.volumeHead}>
        <Text style={[styles.label, { color: theme.ink2 }]}>{t.volume}</Text>
        <Text style={[styles.level, { color: muted ? theme.ink3 : theme.ink }]}>
          {volume === null ? '—' : muted ? t.muted : `${level}%`}
        </Text>
      </View>

      <View
        style={[styles.track, sunken(theme, 0.7)]}
        onLayout={(e) => { width.current = Math.max(1, e.nativeEvent.layout.width); }}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={t.volume}
        accessibilityValue={{ min: 0, max: 100, now: level }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = Math.max(0, Math.min(100, level + (e.nativeEvent.actionName === 'increment' ? 5 : -5)));
          setVolumeState({ level: next, muted });
          send({ level: next });
        }}
      >
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            { width: `${Math.max(3, level)}%`, backgroundColor: muted ? theme.ink3 : theme.dusk },
          ]}
        />
      </View>

      <View style={styles.row}>
        <Round Icon={muted ? SpeakerIcon : MuteIcon} label={muted ? t.unmute : t.mute} onPress={() => {
          const next = !muted;
          setVolumeState({ level, muted: next });
          send({ muted: next });
        }} />
        <Round Icon={PreviousIcon} label={t.previous} onPress={() => key('previous')} />
        <Round Icon={PlayPauseIcon} label={t.playPause} onPress={() => key('playpause')} accent />
        <Round Icon={NextIcon} label={t.next} onPress={() => key('next')} />
      </View>

      <Text style={[styles.hint, { color: error ? theme.danger : theme.ink3 }]}>{error ?? t.mediaHint}</Text>
    </Sheet>
  );
}

function Round({
  Icon,
  label,
  onPress,
  accent,
}: {
  Icon: React.ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); play('tap'); tapFeedback(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.round,
        accent ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)') : raised(theme, 0.6),
        down && pressedStyle(theme),
      ]}
    >
      <Icon size={accent ? 26 : 22} color={accent ? theme.onFill : theme.ink} strokeWidth={1.9} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  volumeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 13, fontWeight: '700' },
  level: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 44, borderRadius: RADIUS.field, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: RADIUS.field },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  round: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 6 },
});

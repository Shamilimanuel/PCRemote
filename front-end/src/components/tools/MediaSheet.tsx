import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Device, MediaSession, Volume } from '../../types/device';
import { getNowPlaying, getVolume, pressMediaKey, setVolume, MediaKey } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, filled, raised, sunken, pressed as pressedStyle } from '../../theme/clay';
import { play } from '../../lib/sound';
import { tapFeedback } from '../../lib/haptics';
import Sheet from '../Sheet';
import { IconProps, MuteIcon, NextIcon, PlayPauseIcon, PreviousIcon, SpeakerIcon } from '../icons';

/**
 * Volume, mute, and play / pause / next / previous for a player on the PC.
 *
 * Every player Windows knows about is listed -- Spotify, a browser tab, Media
 * Player -- with what it is playing, and the buttons go to the chosen one.
 * That replaced pressing a media key, which reached whichever player Windows
 * happened to call current: with Spotify playing and a YouTube tab paused,
 * Next went to the tab, which had nothing to skip to.
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
  const [sessions, setSessions] = useState<MediaSession[] | null>(null);
  // The player picked by tapping it; until then, the one playing.
  const [chosen, setChosen] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    getNowPlaying(device)
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => setSessions([]));
  }, [device]);

  useEffect(() => {
    if (!visible) {
      setChosen(null);
      return;
    }
    loadSessions();
    // Songs end and tabs close; keep up while the panel is open.
    const timer = setInterval(loadSessions, 3000);
    return () => clearInterval(timer);
  }, [visible, loadSessions]);

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

  const target =
    sessions?.find((s) => s.id === chosen) ??
    sessions?.find((s) => s.playing) ??
    sessions?.find((s) => s.current) ??
    sessions?.[0] ??
    null;

  const key = (which: MediaKey) => {
    pressMediaKey(device, which, target?.id)
      .then(() => {
        setError(null);
        // What is playing changes a moment after the press, not with it.
        setTimeout(loadSessions, 450);
      })
      .catch((err) => setError(explain(err, t).message));
  };

  const level = volume?.level ?? 0;
  const muted = volume?.muted ?? false;

  return (
    <Sheet visible={visible} title={t.mediaTitle} subtitle={device.name} onClose={onClose} scroll={false}>
      <Text style={[styles.section, { color: theme.ink3 }]}>{t.nowPlaying}</Text>
      {sessions && sessions.length === 0 && (
        <Text style={[styles.hint, { color: theme.ink2 }]}>{t.nothingPlaying}</Text>
      )}
      {sessions?.slice(0, 3).map((s) => {
        const on = target?.id === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => { tapFeedback(); setChosen(s.id); }}
            style={[styles.player, on ? raised(theme, 0.5) : sunken(theme, 0.4), on && { borderColor: theme.dusk }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.dot, { backgroundColor: s.playing ? theme.moss : theme.ink3 }]} />
            <View style={styles.playerText}>
              <Text style={[styles.playerTitle, { color: theme.ink }]} numberOfLines={1}>
                {s.title || s.app}
              </Text>
              <Text style={[styles.playerMeta, { color: theme.ink3 }]} numberOfLines={1}>
                {[s.app, s.artist, s.playing ? t.playingWord : t.pausedWord, !s.canNext && !s.canPrevious ? t.cantSkip : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {target && sessions && sessions.length > 1 && (
        <Text style={[styles.hint, { color: theme.ink3 }]}>{t.controlling(target.app)}</Text>
      )}

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
        <Round Icon={PreviousIcon} label={t.previous} onPress={() => key('previous')} disabled={target ? !target.canPrevious : false} />
        <Round Icon={PlayPauseIcon} label={t.playPause} onPress={() => key('playpause')} accent />
        <Round Icon={NextIcon} label={t.next} onPress={() => key('next')} disabled={target ? !target.canNext : false} />
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
  disabled,
}: {
  Icon: React.ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); play('tap'); tapFeedback(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.round,
        accent ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)') : raised(theme, 0.6),
        down && pressedStyle(theme),
        disabled && styles.disabled,
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
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: -4 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: RADIUS.field,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  playerText: { flex: 1, minWidth: 0 },
  playerTitle: { fontSize: 14, fontWeight: '800' },
  playerMeta: { fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  disabled: { opacity: 0.32 },
});

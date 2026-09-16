import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { sendAction, cancelShutdown } from '../lib/api';
import { useDeviceStatus, formatUptime } from '../hooks/useDeviceStatus';
import { useWakeWatch } from '../hooks/useWakeWatch';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';
import { Blob, ClayButton, Surface } from '../components/Clay';
import NetworkInfo from '../components/NetworkInfo';
import Vitals from '../components/Vitals';
import TimerSheet from '../components/TimerSheet';
import WakeProgress from '../components/WakeProgress';
import { useDialog } from '../components/Dialog';
import { explain } from '../lib/errors';
import { play, Voice } from '../lib/sound';
import { successFeedback, failureFeedback } from '../lib/haptics';
import {
  AbortIcon,
  ChipIcon,
  GearIcon,
  LockIcon,
  MoonIcon,
  PowerIcon,
  PowerOffIcon,
  RestartIcon,
} from '../components/icons';

type Props = {
  device: Device;
  onBack: () => void;
  onEdit: () => void;
  onSettings: () => void;
};

type ActionKey = 'start' | 'shutdown' | 'restart' | 'sleep' | 'lock' | 'cancel' | 'firmware';

const DESTRUCTIVE: ActionKey[] = ['shutdown', 'restart', 'firmware'];

const VOICE: Record<ActionKey, Voice> = {
  start: 'wake',
  shutdown: 'shutdown',
  restart: 'restart',
  sleep: 'sleep',
  lock: 'lock',
  cancel: 'cancel',
  firmware: 'bios',
};

type LabelKey = 'wake' | 'shutDown' | 'restart' | 'sleep' | 'lock' | 'cancel' | 'rebootToBios';

const LABEL: Record<ActionKey, LabelKey> = {
  start: 'wake',
  shutdown: 'shutDown',
  restart: 'restart',
  sleep: 'sleep',
  lock: 'lock',
  cancel: 'cancel',
  firmware: 'rebootToBios',
};

export default function ControlScreen({ device, onBack, onEdit, onSettings }: Props) {
  const { theme, settings, t } = useTheme();
  const { show } = useDialog();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [result, setResult] = useState<{ key: ActionKey; ok: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Which action is waiting on a delay to be chosen.
  const [timerFor, setTimerFor] = useState<ActionKey | null>(null);

  const { status, health, latencyMs, route, refresh } = useDeviceStatus(
    device,
    settings.pollSeconds > 0 ? settings.pollSeconds * 1000 : 0
  );

  // Wake gets its own, more insistent watcher: the ordinary poll is every ten
  // seconds, which is far too slow to feel like an answer.
  const wake = useWakeWatch(device, refresh);

  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The answer appears on the button that was pressed, because that is where
  // your eye already is.
  const report = useCallback((key: ActionKey, ok: boolean, text: string) => {
    setResult({ key, ok });
    setMessage(text);
    play(ok ? 'done' : 'fail');
    if (ok) successFeedback();
    else failureFeedback();

    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), 1600);
  }, []);

  async function run(key: ActionKey, delaySeconds?: number) {
    setBusy(key);
    setResult(null);
    setMessage(null);
    try {
      if (key === 'start') {
        await wake.start();
        // No report() here: the progress card is the feedback, and it keeps
        // talking for the next minute rather than flashing once.
        play('done');
        successFeedback();
      } else if (key === 'cancel') {
        await cancelShutdown(device);
        report(key, true, t.nothingPending);
      } else {
        await sendAction(device, key, delaySeconds);
        report(
          key,
          true,
          delaySeconds && delaySeconds > 60
            ? `${t[LABEL[key]]} ${t.inMinutes(Math.round(delaySeconds / 60))}`
            : `${t[LABEL[key]]} ${t.sentSuffix}`
        );
      }
    } catch (err) {
      const { title, message } = explain(err, t);
      report(key, false, title);
      show({ tone: 'bad', title, message });
    } finally {
      setBusy(null);
      // The PC takes a moment to go down or come up; re-check once it has.
      setTimeout(refresh, 8000);
    }
  }

  function press(key: ActionKey) {
    // 'hold' is handled by the button itself, which only calls through once
    // the press has been sustained -- so by the time we get here it is confirmed.
    if (settings.confirmStyle === 'dialog' && DESTRUCTIVE.includes(key)) {
      show({
        tone: 'warn',
        title: t.confirmTitle(t[LABEL[key]], device.name),
        message: describe(key),
        cancelLabel: t.notNow,
        confirmLabel: t[LABEL[key]],
        destructive: true,
        onConfirm: () => run(key),
      });
      return;
    }
    run(key);
  }

  function describe(key: ActionKey) {
    return key === 'shutdown'
      ? t.confirmShutdown
      : key === 'firmware'
      ? t.confirmBios
      : t.confirmRestart;
  }

  /** Long-press offers a delay, on agents new enough to accept one. */
  function pressAndHoldForTimer(key: ActionKey) {
    if (!health?.capabilities?.timedShutdown) return;
    if (key !== 'shutdown' && key !== 'restart') return;
    setTimerFor(key);
  }

  const offline = status === 'offline';
  const resultFor = (key: ActionKey) =>
    result && result.key === key ? (result.ok ? 'ok' : 'bad') : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.ground }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.navText, { color: theme.dusk }]}>{t.backToPcs}</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={onEdit} hitSlop={12}>
            <Text style={[styles.navText, { color: theme.ink3 }]}>{t.edit}</Text>
          </Pressable>
          <Pressable onPress={onSettings} hitSlop={12} accessibilityLabel={t.settings}>
            <GearIcon size={21} color={theme.ink3} strokeWidth={1.9} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={styles.card}>
          <View style={styles.cardText}>
            <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>
              {device.name}
            </Text>
            <Text style={[styles.address, { color: theme.ink3 }]}>
              {device.ip}
            </Text>
          </View>
          <Pressable onPress={refresh} hitSlop={10} accessibilityLabel={t.checkNow}>
            <View style={[styles.pill, sunken(theme, 0.6)]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: status === 'online' ? theme.moss : theme.ink3 },
                ]}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: status === 'online' ? theme.moss : theme.ink3 },
                ]}
              >
                {status === 'online' ? t.awake : status === 'offline' ? t.asleep : t.checking}
              </Text>
            </View>
          </Pressable>
        </Surface>

        {health && (
          <Text style={[styles.uptime, { color: theme.ink3 }]}>
            {t.up} {formatUptime(health.uptimeSeconds)}
            {latencyMs !== null ? `  ·  ${latencyMs} ms` : ''}
            {route === 'remote' ? `  ·  ${t.awayFromHome}` : ''}
          </Text>
        )}

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Blob
              Icon={PowerIcon}
              label={t.wake}
              accent
              voice={VOICE.start}
              busy={busy === 'start'}
              dimmed={status === 'online'}
              result={resultFor('start')}
              onPress={() => press('start')}
            />
            <Blob
              Icon={RestartIcon}
              label={t.restart}
              voice={VOICE.restart}
              busy={busy === 'restart'}
              dimmed={offline}
              result={resultFor('restart')}
              hold={settings.confirmStyle === 'hold'}
              onPress={() => press('restart')}
              onLongPress={() => pressAndHoldForTimer('restart')}
            />
          </View>
          <View style={styles.gridRow}>
            <Blob
              Icon={MoonIcon}
              label={t.sleep}
              voice={VOICE.sleep}
              busy={busy === 'sleep'}
              dimmed={offline}
              result={resultFor('sleep')}
              onPress={() => press('sleep')}
            />
            <Blob
              Icon={LockIcon}
              label={t.lock}
              voice={VOICE.lock}
              busy={busy === 'lock'}
              dimmed={offline}
              result={resultFor('lock')}
              onPress={() => press('lock')}
            />
          </View>
          <View style={styles.gridRow}>
            <Blob
              Icon={PowerOffIcon}
              label={t.shutDown}
              danger
              voice={VOICE.shutdown}
              busy={busy === 'shutdown'}
              dimmed={offline}
              result={resultFor('shutdown')}
              hold={settings.confirmStyle === 'hold'}
              onPress={() => press('shutdown')}
              onLongPress={() => pressAndHoldForTimer('shutdown')}
            />
            <Blob
              Icon={AbortIcon}
              label={t.cancel}
              voice={VOICE.cancel}
              busy={busy === 'cancel'}
              dimmed={offline}
              result={resultFor('cancel')}
              onPress={() => press('cancel')}
            />
          </View>
        </View>

        {health?.capabilities?.firmwareReboot && (
          <ClayButton
            label={t.rebootToBios}
            tone="quiet"
            icon={ChipIcon}
            voice={VOICE.firmware}
            busy={busy === 'firmware'}
            dimmed={offline}
            onPress={() => press('firmware')}
            style={styles.bios}
          />
        )}

        <WakeProgress watch={wake} name={device.name} />

        {health?.pending && (
          <View style={[styles.pending, { backgroundColor: theme.ground }]}>
            <Text style={[styles.pendingText, { color: theme.dawnDeep }]}>
              {health.pending.action === 'restart' ? t.countdownRestart : t.countdownShutdown}{' '}
              {formatCountdown(health.pending.secondsRemaining)} {t.tapCancelToStop}
            </Text>
          </View>
        )}

        {message && (
          <Text
            style={[
              styles.message,
              { color: result && !result.ok ? theme.danger : theme.moss },
            ]}
          >
            {message}
          </Text>
        )}

        <Vitals stats={health?.stats} />

        <NetworkInfo device={device} health={health} latencyMs={latencyMs} status={status} route={route} />

        <Text style={[styles.footnote, { color: theme.ink3 }]}>
          {offline ? t.offlineFootnote : t.onlineFootnote}
        </Text>
      </ScrollView>

      <TimerSheet
        visible={timerFor !== null}
        verb={timerFor === 'restart' ? t.restart : t.shutDown}
        onPick={(seconds) => {
          const key = timerFor;
          setTimerFor(null);
          if (key) run(key, seconds);
        }}
        onClose={() => setTimerFor(null)}
      />
    </SafeAreaView>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navText: { fontSize: 15.5, fontWeight: '700' },
  scroll: { paddingBottom: 30 },

  card: {
    borderRadius: RADIUS.card,
    paddingVertical: 17,
    paddingHorizontal: 19,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardText: { flex: 1, minWidth: 0 },
  name: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  address: { fontSize: 12.5, fontWeight: '700', marginTop: 2 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: RADIUS.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 11.5, fontWeight: '800' },

  uptime: { fontSize: 11.5, fontWeight: '700', textAlign: 'center', marginTop: 10 },

  grid: { marginTop: 16, gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },

  bios: { marginTop: 12 },
  message: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  pending: { borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 15, marginTop: 14 },
  pendingText: { fontSize: 12.5, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  footnote: { fontSize: 11.5, lineHeight: 17, fontWeight: '600', marginTop: 18 },
});

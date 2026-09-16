import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { sendAction, cancelShutdown } from '../lib/api';
import { sendMagicPacket } from '../lib/wol';
import { useDeviceStatus, formatUptime } from '../hooks/useDeviceStatus';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';
import { Blob, ClayButton, Surface } from '../components/Clay';
import NetworkInfo from '../components/NetworkInfo';
import { play, Voice } from '../lib/sound';
import { successFeedback, failureFeedback, warningFeedback } from '../lib/haptics';
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

const LABEL: Record<ActionKey, string> = {
  start: 'Wake',
  shutdown: 'Shut down',
  restart: 'Restart',
  sleep: 'Sleep',
  lock: 'Lock',
  cancel: 'Cancel',
  firmware: 'Reboot to BIOS',
};

export default function ControlScreen({ device, onBack, onEdit, onSettings }: Props) {
  const { theme, settings } = useTheme();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [result, setResult] = useState<{ key: ActionKey; ok: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { status, health, latencyMs, route, refresh } = useDeviceStatus(
    device,
    settings.pollSeconds > 0 ? settings.pollSeconds * 1000 : 0
  );

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

  async function run(key: ActionKey) {
    setBusy(key);
    setResult(null);
    setMessage(null);
    try {
      if (key === 'start') {
        await sendMagicPacket(device.mac, device.ip);
        report(key, true, 'Wake-up signal sent');
      } else if (key === 'cancel') {
        await cancelShutdown(device);
        report(key, true, 'Nothing left pending');
      } else {
        await sendAction(device, key);
        report(key, true, `${LABEL[key]} sent`);
      }
    } catch (err) {
      const text = (err as Error).message;
      report(key, false, text.includes('Abort') ? 'No answer from the PC' : text);
    } finally {
      setBusy(null);
      // The PC takes a moment to go down or come up; re-check once it has.
      setTimeout(refresh, 8000);
    }
  }

  function press(key: ActionKey) {
    if (settings.confirmDestructive && DESTRUCTIVE.includes(key)) {
      warningFeedback();
      Alert.alert(
        `${LABEL[key]} ${device.name}?`,
        key === 'shutdown'
          ? 'The PC will power off in a few seconds.'
          : key === 'firmware'
          ? 'The PC will restart into its BIOS settings screen. You’ll need to be at the keyboard — the phone can’t drive it from there.'
          : 'The PC will restart in a few seconds.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: LABEL[key], style: 'destructive', onPress: () => run(key) },
        ]
      );
      return;
    }
    run(key);
  }

  const offline = status === 'offline';
  const resultFor = (key: ActionKey) =>
    result && result.key === key ? (result.ok ? 'ok' : 'bad') : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.ground }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.navText, { color: theme.dusk }]}>{'‹ PCs'}</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={onEdit} hitSlop={12}>
            <Text style={[styles.navText, { color: theme.ink3 }]}>Edit</Text>
          </Pressable>
          <Pressable onPress={onSettings} hitSlop={12} accessibilityLabel="Settings">
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
          <Pressable onPress={refresh} hitSlop={10} accessibilityLabel="Check now">
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
                {status === 'online' ? 'Awake' : status === 'offline' ? 'Asleep' : '…'}
              </Text>
            </View>
          </Pressable>
        </Surface>

        {health && (
          <Text style={[styles.uptime, { color: theme.ink3 }]}>
            up {formatUptime(health.uptimeSeconds)}
            {latencyMs !== null ? `  ·  ${latencyMs} ms` : ''}
            {route === 'remote' ? '  ·  away from home' : ''}
          </Text>
        )}

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Blob
              Icon={PowerIcon}
              label="Wake"
              accent
              voice={VOICE.start}
              busy={busy === 'start'}
              dimmed={status === 'online'}
              result={resultFor('start')}
              onPress={() => press('start')}
            />
            <Blob
              Icon={RestartIcon}
              label="Restart"
              voice={VOICE.restart}
              busy={busy === 'restart'}
              dimmed={offline}
              result={resultFor('restart')}
              onPress={() => press('restart')}
            />
          </View>
          <View style={styles.gridRow}>
            <Blob
              Icon={MoonIcon}
              label="Sleep"
              voice={VOICE.sleep}
              busy={busy === 'sleep'}
              dimmed={offline}
              result={resultFor('sleep')}
              onPress={() => press('sleep')}
            />
            <Blob
              Icon={LockIcon}
              label="Lock"
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
              label="Shut down"
              danger
              voice={VOICE.shutdown}
              busy={busy === 'shutdown'}
              dimmed={offline}
              result={resultFor('shutdown')}
              onPress={() => press('shutdown')}
            />
            <Blob
              Icon={AbortIcon}
              label="Cancel"
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
            label="Reboot to BIOS"
            tone="quiet"
            icon={ChipIcon}
            voice={VOICE.firmware}
            busy={busy === 'firmware'}
            dimmed={offline}
            onPress={() => press('firmware')}
            style={styles.bios}
          />
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

        <NetworkInfo device={device} health={health} latencyMs={latencyMs} status={status} route={route} />

        <Text style={[styles.footnote, { color: theme.ink3 }]}>
          {offline
            ? 'The PC isn’t answering — it’s off, asleep, or not running the agent. Only Wake will do anything until it’s back.'
            : 'Wake works over your own Wi-Fi only. A powered-off PC has nothing listening for anything else.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
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
  footnote: { fontSize: 11.5, lineHeight: 17, fontWeight: '600', marginTop: 18 },
});

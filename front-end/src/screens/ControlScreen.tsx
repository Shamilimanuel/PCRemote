import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { sendAction, cancelShutdown } from '../lib/api';
import { sendMagicPacket } from '../lib/wol';
import { useDeviceStatus, formatUptime } from '../hooks/useDeviceStatus';
import StatusPill from '../components/StatusPill';
import NetworkInfo from '../components/NetworkInfo';
import {
  AbortIcon,
  ChipIcon,
  IconProps,
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
};

type ActionKey = 'start' | 'shutdown' | 'restart' | 'sleep' | 'lock' | 'cancel' | 'firmware';

const DESTRUCTIVE: ActionKey[] = ['shutdown', 'restart', 'firmware'];

export default function ControlScreen({ device, onBack, onEdit }: Props) {
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const { status, health, latencyMs, route, refresh } = useDeviceStatus(device);

  async function run(actionKey: ActionKey) {
    setBusy(actionKey);
    setStatusText(null);
    try {
      if (actionKey === 'start') {
        await sendMagicPacket(device.mac, device.ip);
        setStatusText('Wake-on-LAN packet sent.');
      } else if (actionKey === 'cancel') {
        await cancelShutdown(device);
        setStatusText('Pending shutdown/restart cancelled.');
      } else {
        await sendAction(device, actionKey);
        setStatusText(`${labelFor(actionKey)} command sent.`);
      }
    } catch (err) {
      Alert.alert('Failed', (err as Error).message);
    } finally {
      setBusy(null);
      // The PC takes a moment to go down or come up; re-check once it has.
      setTimeout(refresh, 8000);
    }
  }

  function handlePress(actionKey: ActionKey) {
    if (DESTRUCTIVE.includes(actionKey)) {
      Alert.alert(
        `${labelFor(actionKey)} ${device.name}?`,
        actionKey === 'shutdown'
          ? 'The PC will power off in a few seconds.'
          : actionKey === 'firmware'
          ? 'The PC will restart into its BIOS/UEFI settings screen. You’ll need to be at the keyboard — the phone can’t control it from there.'
          : 'The PC will restart in a few seconds.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: labelFor(actionKey), style: 'destructive', onPress: () => run(actionKey) },
        ]
      );
      return;
    }
    run(actionKey);
  }

  // Dimmed, not disabled: a poll can be stale, and the user may well know
  // better than the last health check did.
  const agentUnreachable = status === 'offline';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>{'< Back'}</Text>
        </Pressable>
        <Pressable onPress={onEdit} hitSlop={10}>
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{device.name}</Text>
        <Text style={styles.subtitle}>
          {device.ip}:{device.port}
        </Text>
        <Pressable style={styles.statusRow} onPress={refresh} hitSlop={8}>
          <StatusPill status={status} detail={health ? `up ${formatUptime(health.uptimeSeconds)}` : undefined} />
        </Pressable>

        <View style={styles.grid}>
          <ActionButton
            Icon={PowerIcon}
            label="Start"
            busy={busy === 'start'}
            dimmed={status === 'online'}
            onPress={() => handlePress('start')}
          />
          <ActionButton
            Icon={RestartIcon}
            label="Restart"
            busy={busy === 'restart'}
            dimmed={agentUnreachable}
            onPress={() => handlePress('restart')}
          />
          <ActionButton
            Icon={MoonIcon}
            label="Sleep"
            busy={busy === 'sleep'}
            dimmed={agentUnreachable}
            onPress={() => handlePress('sleep')}
          />
          <ActionButton
            Icon={LockIcon}
            label="Lock"
            busy={busy === 'lock'}
            dimmed={agentUnreachable}
            onPress={() => handlePress('lock')}
          />
          <ActionButton
            Icon={PowerOffIcon}
            label="Shutdown"
            danger
            busy={busy === 'shutdown'}
            dimmed={agentUnreachable}
            onPress={() => handlePress('shutdown')}
          />
          <ActionButton
            Icon={AbortIcon}
            label="Cancel pending"
            busy={busy === 'cancel'}
            dimmed={agentUnreachable}
            onPress={() => handlePress('cancel')}
          />
        </View>

        {health?.capabilities?.firmwareReboot ? (
          <Pressable
            style={({ pressed }) => [
              styles.firmwareButton,
              agentUnreachable && styles.actionButtonDimmed,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handlePress('firmware')}
            disabled={busy === 'firmware'}
            accessibilityRole="button"
            accessibilityLabel="Reboot to BIOS"
          >
            {busy === 'firmware' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <ChipIcon size={19} color="#8A8F9C" strokeWidth={1.7} />
                <Text style={styles.firmwareLabel}>Reboot to BIOS</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {statusText && <Text style={styles.status}>{statusText}</Text>}

        <NetworkInfo device={device} health={health} latencyMs={latencyMs} status={status} route={route} />

        <Text style={styles.footnote}>
          {agentUnreachable
            ? 'The agent isn’t answering, so this PC is off, asleep, or not running it. Only Start will work until it’s back.'
            : 'Start uses Wake-on-LAN and only works while your phone is on the same Wi-Fi network as this PC (and Wake-on-LAN is enabled in its BIOS/network adapter settings).'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function labelFor(action: ActionKey) {
  switch (action) {
    case 'start':
      return 'Start';
    case 'shutdown':
      return 'Shutdown';
    case 'restart':
      return 'Restart';
    case 'sleep':
      return 'Sleep';
    case 'lock':
      return 'Lock';
    case 'cancel':
      return 'Cancel';
    case 'firmware':
      return 'Reboot to BIOS';
  }
}

function ActionButton({
  Icon,
  label,
  onPress,
  busy,
  danger,
  dimmed,
}: {
  Icon: React.ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        danger && styles.actionButtonDanger,
        dimmed && styles.actionButtonDimmed,
        pressed && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
      ) : (
        <>
          <Icon size={26} color={danger ? '#F2A9A0' : '#FFFFFF'} />
          <Text style={styles.actionLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115', paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
  back: { color: '#3D7EFF', fontSize: 16 },
  edit: { color: '#8A8F9C', fontSize: 16 },
  scroll: { paddingBottom: 28 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: 16 },
  subtitle: { color: '#8A8F9C', marginTop: 4 },
  statusRow: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionButton: {
    width: '47%',
    backgroundColor: '#1B1E27',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonDanger: { backgroundColor: '#3A1E22' },
  actionButtonDimmed: { opacity: 0.4 },
  actionButtonPressed: { opacity: 0.7 },
  firmwareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2E3A',
  },
  firmwareLabel: { color: '#8A8F9C', fontWeight: '600', fontSize: 14 },
  spinner: { height: 26 },
  actionLabel: { color: '#FFFFFF', fontWeight: '600' },
  status: { color: '#5FD68C', marginTop: 18, textAlign: 'center' },
  footnote: { color: '#5A5F6B', fontSize: 12, marginTop: 18, lineHeight: 18 },
});

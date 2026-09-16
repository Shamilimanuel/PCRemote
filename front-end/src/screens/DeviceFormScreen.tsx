import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { checkHealth } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';
import { ClayButton } from '../components/Clay';
import { HelpIcon } from '../components/icons';
import HelpSheet from '../components/HelpSheet';
import { play } from '../lib/sound';
import { successFeedback, failureFeedback, tapFeedback } from '../lib/haptics';

type Props = {
  initial?: Device;
  /** Adding rather than editing — only then is scanning offered. */
  isNew?: boolean;
  onScan?: () => void;
  onSave: (device: Device) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DeviceFormScreen({
  initial,
  isNew,
  onScan,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [ip, setIp] = useState(initial?.ip ?? '');
  const [port, setPort] = useState(initial ? String(initial.port) : '5533');
  const [token, setToken] = useState(initial?.token ?? '');
  const [mac, setMac] = useState(initial?.mac ?? '');
  const [remoteHost, setRemoteHost] = useState(initial?.remoteHost ?? '');
  const [testing, setTesting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // A scan returns to this screen with fresh `initial` values; without this the
  // fields would keep whatever was typed before the camera opened.
  const seeded = useRef(initial?.token);
  useEffect(() => {
    if (!initial || seeded.current === initial.token) return;
    seeded.current = initial.token;
    setName(initial.name);
    setIp(initial.ip);
    setPort(String(initial.port));
    setToken(initial.token);
    setMac(initial.mac);
    setRemoteHost(initial.remoteHost ?? '');
  }, [initial]);

  const canSave = Boolean(name.trim() && ip.trim() && port.trim() && token.trim() && mac.trim());

  function buildDevice(): Device {
    return {
      id: initial?.id || makeId(),
      name: name.trim(),
      ip: ip.trim(),
      port: Number(port.trim()) || 5533,
      token: token.trim(),
      mac: mac.trim(),
      remoteHost: remoteHost.trim() || undefined,
    };
  }

  async function handleTest() {
    setTesting(true);
    try {
      await checkHealth(buildDevice());
      play('done');
      successFeedback();
      Alert.alert('Connected', 'Your PC answered. Tap Save to keep it.');
    } catch (err) {
      play('fail');
      failureFeedback();
      Alert.alert('No answer', (err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.ground }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.ink }]}>{initial?.id ? 'Edit PC' : 'Add PC'}</Text>
          <Pressable
            onPress={() => {
              play('tap');
              tapFeedback();
              setHelpOpen(true);
            }}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="How to add your PC"
          >
            <HelpIcon size={24} color={theme.ink3} strokeWidth={1.9} />
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.ink3 }]}>
          {isNew
            ? 'Scan the code your PC shows, or type the values in by hand. Tap ? above if you haven’t set the PC up yet.'
            : 'These came from the pairing code your PC showed. Change them only if its address moved.'}
        </Text>

        {isNew && onScan && (
          <ClayButton label="Scan code" tone="accent" onPress={onScan} style={styles.scan} />
        )}

        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Office PC" />
        <Field
          label="IP address"
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.42"
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label="Port"
          value={port}
          onChangeText={setPort}
          placeholder="5533"
          keyboardType="number-pad"
        />
        <Field
          label="Token"
          value={token}
          onChangeText={setToken}
          placeholder="the long code from your PC"
        />
        <Field
          label="MAC address"
          value={mac}
          onChangeText={setMac}
          placeholder="AA:BB:CC:DD:EE:FF"
          autoCapitalize="characters"
        />
        <Field
          label="Remote address (optional)"
          value={remoteHost}
          onChangeText={setRemoteHost}
          placeholder="e.g. desktop.tail1234.ts.net"
        />
        <Text style={[styles.fieldHint, { color: theme.ink3 }]}>
          Only used when the address above can’t be reached — lets shut down, sleep and lock work
          away from home. Leave it empty if you only use this on your own Wi-Fi.
        </Text>

        <ClayButton
          label="Test connection"
          onPress={handleTest}
          busy={testing}
          dimmed={!canSave}
          style={styles.action}
        />
        <ClayButton
          label="Save"
          tone="accent"
          onPress={() => canSave && onSave(buildDevice())}
          dimmed={!canSave}
          style={styles.action}
        />
        <ClayButton label="Cancel" tone="quiet" onPress={onCancel} style={styles.action} />

        {onDelete && (
          <ClayButton
            label="Remove this PC"
            tone="danger"
            voice="fail"
            onPress={onDelete}
            style={styles.remove}
          />
        )}
      </ScrollView>

      <HelpSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        onScan={isNew ? onScan : undefined}
      />
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation' | 'number-pad';
  autoCapitalize?: 'none' | 'characters';
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.ink3 }]}>{props.label}</Text>
      <TextInput
        style={[styles.input, sunken(theme, 0.7), { color: theme.ink }]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={theme.ink3}
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  scroll: { paddingTop: 12, paddingBottom: 36 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  hint: { fontSize: 13.5, lineHeight: 20, fontWeight: '600', marginBottom: 18 },
  scan: { marginBottom: 22 },

  field: { marginBottom: 14 },
  label: { fontSize: 11.5, fontWeight: '800', marginBottom: 7, letterSpacing: 0.2 },
  input: {
    borderRadius: RADIUS.field,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldHint: { fontSize: 11.5, lineHeight: 17, fontWeight: '600', marginTop: -4, marginBottom: 10 },

  action: { marginTop: 11 },
  remove: { marginTop: 26 },
});

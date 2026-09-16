import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { checkHealth } from '../lib/api';

type Props = {
  initial?: Device;
  onSave: (device: Device) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DeviceFormScreen({ initial, onSave, onCancel, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ip, setIp] = useState(initial?.ip ?? '');
  const [port, setPort] = useState(initial ? String(initial.port) : '5533');
  const [token, setToken] = useState(initial?.token ?? '');
  const [mac, setMac] = useState(initial?.mac ?? '');
  const [testing, setTesting] = useState(false);

  const canSave = name.trim() && ip.trim() && port.trim() && token.trim() && mac.trim();

  function buildDevice(): Device {
    return {
      id: initial?.id ?? makeId(),
      name: name.trim(),
      ip: ip.trim(),
      port: Number(port.trim()) || 5533,
      token: token.trim(),
      mac: mac.trim(),
    };
  }

  async function handleTest() {
    setTesting(true);
    try {
      await checkHealth(buildDevice());
      Alert.alert('Success', 'Connected to the agent on your PC.');
    } catch (err) {
      Alert.alert('Connection failed', (err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    if (!canSave) return;
    onSave(buildDevice());
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{initial ? 'Edit PC' : 'Add PC'}</Text>
        <Text style={styles.hint}>
          Run the agent on the PC (npm start in the agent folder). It prints the IP, port, token,
          and MAC address to enter below.
        </Text>

        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Office PC" />
        <Field
          label="IP address"
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.42"
          keyboardType="numbers-and-punctuation"
        />
        <Field label="Port" value={port} onChangeText={setPort} placeholder="5533" keyboardType="number-pad" />
        <Field label="Token" value={token} onChangeText={setToken} placeholder="agent token" autoCapitalize="none" />
        <Field
          label="MAC address"
          value={mac}
          onChangeText={setMac}
          placeholder="AA:BB:CC:DD:EE:FF"
          autoCapitalize="characters"
        />

        <Pressable
          style={[styles.button, styles.testButton, (!canSave || testing) && styles.buttonDisabled]}
          disabled={!canSave || testing}
          onPress={handleTest}
        >
          {testing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Test connection</Text>}
        </Pressable>

        <Pressable
          style={[styles.button, styles.saveButton, !canSave && styles.buttonDisabled]}
          disabled={!canSave}
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>

        {onDelete && (
          <Pressable style={[styles.button, styles.deleteButton]} onPress={onDelete}>
            <Text style={styles.buttonText}>Delete this PC</Text>
          </Pressable>
        )}
      </ScrollView>
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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#5A5F6B"
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  scroll: { padding: 20, gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  hint: { color: '#8A8F9C', marginBottom: 20, lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { color: '#8A8F9C', marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: '#1B1E27',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.4 },
  testButton: { backgroundColor: '#2A2E3A' },
  saveButton: { backgroundColor: '#3D7EFF' },
  cancelButton: { backgroundColor: 'transparent' },
  deleteButton: { backgroundColor: '#D64545', marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  cancelButtonText: { color: '#8A8F9C', fontSize: 16 },
});

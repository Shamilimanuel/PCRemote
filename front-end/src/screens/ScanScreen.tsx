import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Device } from '../types/device';
import { parsePairingPayload } from '../lib/pairing';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  onScanned: (device: Omit<Device, 'id'>) => void;
  onCancel: () => void;
};

export default function ScanScreen({ onScanned, onCancel }: Props) {
  const { t } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<string | null>(null);
  // The camera fires continuously while a code is in frame, so latch after the
  // first good read or the form gets filled a dozen times.
  const handled = useRef(false);

  function handleScan(result: BarcodeScanningResult) {
    if (handled.current) return;

    const parsed = parsePairingPayload(result.data);
    if (!parsed.ok) {
      setProblem(parsed.reason);
      return;
    }

    handled.current = true;
    onScanned(parsed.device);
  }

  if (!permission) {
    return <Shell onCancel={onCancel} title={t.scanTitle} body={t.scanStarting} />;
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Shell
        onCancel={onCancel}
        title={t.scanTitle}
        body={
          blocked ? t.scanPermissionBlocked : t.scanPermission
        }
        action={{
          label: blocked ? t.openSettings : t.allowCamera,
          onPress: blocked ? () => Linking.openSettings() : requestPermission,
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.back}>{t.back}</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{t.scanTitle}</Text>
      <Text style={styles.hint}>
        On your PC, run <Text style={styles.mono}>npm run pair</Text> in the agent folder. Point the
        camera at the code it opens.
      </Text>

      <View style={styles.viewfinder}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScan}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>

      {problem ? (
        <Text style={styles.problem}>{problem}</Text>
      ) : (
        <Text style={styles.waiting}>{t.scanLooking}</Text>
      )}

      <Pressable style={styles.manual} onPress={onCancel}>
        <Text style={styles.manualText}>{t.scanTypeInstead}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Shell({
  title,
  body,
  action,
  onCancel,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  onCancel: () => void;
}) {
  const { t } = useTheme();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.back}>{t.back}</Text>
        </Pressable>
      </View>
      <View style={styles.centre}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.hint, styles.centreText]}>{body}</Text>
        {action && (
          <Pressable style={styles.allow} onPress={action.onPress}>
            <Text style={styles.allowText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115', paddingHorizontal: 20 },
  header: { flexDirection: 'row', paddingTop: 16 },
  back: { color: '#3D7EFF', fontSize: 16 },
  centre: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
  centreText: { textAlign: 'center' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: 16 },
  hint: { color: '#8A8F9C', marginTop: 8, lineHeight: 20 },
  mono: { color: '#FFFFFF', fontFamily: 'monospace' },
  viewfinder: {
    marginTop: 22,
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  reticle: {
    position: 'absolute',
    top: '12%',
    left: '12%',
    right: '12%',
    bottom: '12%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 18,
  },
  waiting: { color: '#8A8F9C', textAlign: 'center', marginTop: 18, fontSize: 14 },
  problem: { color: '#E0A33E', textAlign: 'center', marginTop: 18, fontSize: 14, lineHeight: 20 },
  manual: {
    marginTop: 'auto',
    marginBottom: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  manualText: { color: '#8A8F9C', fontSize: 15 },
  allow: {
    backgroundColor: '#3D7EFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  allowText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});

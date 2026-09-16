import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { checkForUpdate, UpdateInfo } from '../lib/updates';

/**
 * Checks GitHub once on mount. The repo is public, so this needs no token and
 * no sign-in -- which is the whole point, since the friction it removes is
 * having to go and look.
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((found) => {
      if (!cancelled) setUpdate(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.text}>
        <Text style={styles.title}>Reveille {update.version} is available</Text>
        <Text style={styles.subtitle}>Installs over this one — your PCs stay saved.</Text>
      </View>
      <Pressable
        style={styles.action}
        onPress={() => Linking.openURL(update.downloadUrl)}
        accessibilityRole="button"
      >
        <Text style={styles.actionText}>Get it</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={12} accessibilityLabel="Dismiss">
        <Text style={styles.dismiss}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#152744',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  subtitle: { color: '#93A7CC', fontSize: 12, marginTop: 2 },
  action: {
    backgroundColor: '#3D7EFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  dismiss: { color: '#6E7F9E', fontSize: 15, paddingHorizontal: 2 },
});

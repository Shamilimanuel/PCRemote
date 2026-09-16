import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { checkForUpdate, UpdateInfo } from '../lib/updates';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised, filled } from '../theme/clay';

/**
 * Checks GitHub once on mount. The repo is public, so this needs no token and
 * no sign-in -- which is the whole point, since the friction it removes is
 * having to go and look.
 */
export default function UpdateBanner() {
  const { theme, t } = useTheme();
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
    <View style={[styles.banner, raised(theme, 0.7)]}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.ink }]}>{t.updateBannerTitle(update.version)}</Text>
        <Text style={[styles.subtitle, { color: theme.ink3 }]}>{t.updateBannerSub}</Text>
      </View>
      <Pressable
        style={[styles.action, filled(theme, theme.dusk, 'rgba(0,0,0,0.22)')]}
        onPress={() => Linking.openURL(update.downloadUrl)}
        accessibilityRole="button"
      >
        <Text style={styles.actionText}>{t.getIt}</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={12} accessibilityLabel="Dismiss">
        <Text style={[styles.dismiss, { color: theme.ink3 }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontWeight: '800', fontSize: 14 },
  subtitle: { fontSize: 11.5, marginTop: 2, fontWeight: '600' },
  action: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  dismiss: { fontSize: 15, paddingHorizontal: 2 },
});

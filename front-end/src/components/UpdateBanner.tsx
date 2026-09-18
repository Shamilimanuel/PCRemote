import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { checkForUpdate, UpdateInfo } from '../lib/updates';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised, filled } from '../theme/clay';
import { play } from '../lib/sound';
import { tapFeedback } from '../lib/haptics';

/**
 * Checks GitHub once on mount. The repo is public, so this needs no token and
 * no sign-in -- which is the whole point, since the friction it removes is
 * having to go and look.
 *
 * It also says what changed. It used to offer a version number and a button,
 * which asks someone to install something on the strength of a number going
 * up; the release notes were sitting in the same reply the whole time, being
 * thrown away. Releases from before changelogs existed have nothing to show,
 * and those fall back to the old one-line reassurance.
 */

/** Longer than this and the notes are worth collapsing behind a toggle. */
const LONG_NOTES = 150;

export default function UpdateBanner() {
  const { theme, t } = useTheme();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  const notes = update.notes?.trim() ?? '';
  const longNotes = notes.length > LONG_NOTES || notes.split('\n').length > 3;

  return (
    <View style={[styles.banner, raised(theme, 0.7)]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
          {t.updateBannerTitle(update.version)}
        </Text>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t.dismiss}
        >
          <Text style={[styles.dismiss, { color: theme.ink3 }]}>✕</Text>
        </Pressable>
      </View>

      <Text
        style={[styles.body, { color: notes ? theme.ink2 : theme.ink3 }]}
        numberOfLines={notes && !expanded ? 3 : undefined}
      >
        {notes || t.updateBannerSub}
      </Text>

      <View style={styles.foot}>
        {notes && longNotes ? (
          <Pressable
            onPress={() => {
              play('tap');
              tapFeedback();
              setExpanded((open) => !open);
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.more, { color: theme.ink3 }]}>
              {expanded ? t.showLess : t.showMore}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}

        <Pressable
          style={[styles.action, filled(theme, theme.dusk, 'rgba(0,0,0,0.22)')]}
          onPress={() => {
            play('tap');
            tapFeedback();
            Linking.openURL(update.downloadUrl);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{t.getIt}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: RADIUS.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 10,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontWeight: '800', fontSize: 14 },
  dismiss: { fontSize: 15, paddingHorizontal: 2 },
  body: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
  },
  more: { fontSize: 12, fontWeight: '800' },
  action: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AutomationSummary } from '../../types/device';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, sunken } from '../../theme/clay';
import { ClockIcon } from '../icons';
import { actionWord, whenLabel } from './TimersSheet';

/**
 * What the PC is going to do by itself, so it never surprises anyone: "Shut
 * down once quiet for 10 min" and "Shut down tonight at 23:30". Tapping it
 * opens the Timers panel to change or stop either.
 */
export default function AutomationStatus({
  automations,
  onPress,
}: {
  automations: AutomationSummary | undefined;
  onPress: () => void;
}) {
  const { theme, t } = useTheme();
  const finished = automations?.whenFinished;
  const next = automations?.nextSchedule;
  if (!finished && !next) return null;

  return (
    <Pressable onPress={onPress} style={[styles.card, sunken(theme, 0.6)]} accessibilityRole="button">
      <ClockIcon size={20} color={theme.dawnDeep} strokeWidth={2} />
      <View style={styles.lines}>
        {finished && (
          <Text style={[styles.line, { color: theme.ink }]}>
            {t.willAfterQuiet(actionWord(finished.action, t), Math.floor(finished.quietForSeconds / 60), finished.quietMinutes)}
          </Text>
        )}
        {next && (
          <Text style={[styles.line, { color: finished ? theme.ink2 : theme.ink }]}>
            {t.nextScheduled(actionWord(next.action, t), whenLabel(next.at, t))}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 15, marginTop: 14 },
  lines: { flex: 1, gap: 3 },
  line: { fontSize: 12.5, fontWeight: '700', lineHeight: 18 },
});

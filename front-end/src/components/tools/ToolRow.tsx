import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HealthResponse } from '../../types/device';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, raised, pressed as pressedStyle } from '../../theme/clay';
import { play } from '../../lib/sound';
import { tapFeedback } from '../../lib/haptics';
import { AppsIcon, ClockIcon, IconProps, ListIcon, MessageIcon, ScreenIcon, SpeakerIcon } from '../icons';

export type Tool = 'media' | 'message' | 'apps' | 'screen' | 'timers' | 'activity';

/**
 * The smaller things the app can do, under the big buttons: each opens its
 * own panel. Only what this PC's agent says it can do is shown, so an older
 * agent shows none of them rather than six buttons that would all fail.
 */
export default function ToolRow({
  health,
  offline,
  onOpen,
}: {
  health: HealthResponse | null;
  offline: boolean;
  onOpen: (tool: Tool) => void;
}) {
  const { theme, t } = useTheme();
  const caps = health?.capabilities;
  if (!caps || caps.message === undefined) return null;

  const tools: { id: Tool; label: string; Icon: React.ComponentType<IconProps> }[] = [];
  if (caps.media) tools.push({ id: 'media', label: t.toolMedia, Icon: SpeakerIcon });
  if (caps.message) tools.push({ id: 'message', label: t.toolMessage, Icon: MessageIcon });
  tools.push({ id: 'apps', label: t.toolApps, Icon: AppsIcon });
  if (caps.screenSupported) tools.push({ id: 'screen', label: t.toolScreen, Icon: ScreenIcon });
  if (caps.whenFinished || caps.schedules) tools.push({ id: 'timers', label: t.toolTimers, Icon: ClockIcon });
  if (caps.activity) tools.push({ id: 'activity', label: t.toolActivity, Icon: ListIcon });

  // Rows of three, so six make two even rows and nothing sits alone.
  const rows: typeof tools[] = [];
  for (let i = 0; i < tools.length; i += 3) rows.push(tools.slice(i, i + 3));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: theme.ink3 }]}>{t.tools}</Text>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((tool) => (
            <Tile key={tool.id} label={tool.label} Icon={tool.Icon} dimmed={offline} onPress={() => onOpen(tool.id)} />
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, k) => <View key={`gap${k}`} style={styles.gap} />)}
        </View>
      ))}
    </View>
  );
}

function Tile({
  label,
  Icon,
  dimmed,
  onPress,
}: {
  label: string;
  Icon: React.ComponentType<IconProps>;
  dimmed: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);
  return (
    <Pressable
      disabled={dimmed}
      onPressIn={() => { setDown(true); play('tap'); tapFeedback(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      style={[styles.tile, raised(theme, 0.6), down && pressedStyle(theme), dimmed && styles.dimmed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={22} color={theme.dusk} strokeWidth={1.9} />
      <Text style={[styles.label, { color: theme.ink }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, gap: 10 },
  heading: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginLeft: 4 },
  row: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: RADIUS.field, paddingVertical: 14, alignItems: 'center', gap: 7 },
  gap: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800' },
  dimmed: { opacity: 0.42 },
});

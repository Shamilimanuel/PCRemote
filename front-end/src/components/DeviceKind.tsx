import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DeviceKind, DEVICE_KINDS } from '../types/device';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised, sunken } from '../theme/clay';
import { play } from '../lib/sound';
import { tapFeedback } from '../lib/haptics';
import {
  IconProps,
  DesktopIcon,
  LaptopIcon,
  ServerIcon,
  MiniPcIcon,
} from './icons';

/**
 * Picking what a saved machine *is*, so a list of four of them is readable at
 * a glance instead of four identical rows.
 *
 * Deliberately a label and nothing more. Every kind here speaks to the same
 * agent and accepts the same commands, so choosing "Server" does not change
 * what the app will let you do -- that still comes from the agent, which knows.
 */

const ICONS: Record<DeviceKind, (props: IconProps) => React.JSX.Element> = {
  desktop: DesktopIcon,
  laptop: LaptopIcon,
  server: ServerIcon,
  mini: MiniPcIcon,
};

const LABEL_KEY: Record<DeviceKind, 'kindDesktop' | 'kindLaptop' | 'kindServer' | 'kindMini'> = {
  desktop: 'kindDesktop',
  laptop: 'kindLaptop',
  server: 'kindServer',
  mini: 'kindMini',
};

/** Devices saved before kinds existed have none; they are desktops. */
export function kindOf(kind: DeviceKind | undefined): DeviceKind {
  return kind && ICONS[kind] ? kind : 'desktop';
}

export function DeviceKindIcon({
  kind,
  ...props
}: IconProps & { kind: DeviceKind | undefined }) {
  const Glyph = ICONS[kindOf(kind)];
  return <Glyph {...props} />;
}

export function DeviceKindPicker({
  value,
  onChange,
}: {
  value: DeviceKind;
  onChange: (kind: DeviceKind) => void;
}) {
  const { theme, t } = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.ink3 }]}>{t.deviceKind}</Text>
      <View style={styles.row}>
        {DEVICE_KINDS.map((kind) => {
          const selected = kind === value;
          const Glyph = ICONS[kind];
          return (
            <Pressable
              key={kind}
              onPress={() => {
                if (selected) return;
                play('tap');
                tapFeedback();
                onChange(kind);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t[LABEL_KEY[kind]]}
              style={[
                styles.option,
                // Sunken for the chosen one: it reads as pushed in, which is how
                // every other selected control in the app looks. Both helpers
                // set their own background.
                selected ? sunken(theme, 0.7) : raised(theme, 0.6),
              ]}
            >
              <Glyph size={21} color={selected ? theme.dusk : theme.ink3} strokeWidth={1.9} />
              <Text
                style={[
                  styles.optionLabel,
                  { color: selected ? theme.ink : theme.ink3 },
                ]}
                numberOfLines={1}
              >
                {t[LABEL_KEY[kind]]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 11.5, fontWeight: '800', marginBottom: 7, letterSpacing: 0.2 },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: RADIUS.field,
  },
  optionLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.1 },
});

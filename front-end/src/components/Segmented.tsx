import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken, filled } from '../theme/clay';
import { play } from '../lib/sound';
import { tapFeedback } from '../lib/haptics';

/** A row of choices where exactly one is picked: Shut down | Sleep. */
export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, sunken(theme, 0.55)]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            disabled={option.disabled}
            onPress={() => {
              play('tap');
              tapFeedback();
              onChange(option.value);
            }}
            style={[
              styles.option,
              on && filled(theme, theme.dusk, 'rgba(0,0,0,0.2)'),
              option.disabled && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: option.disabled }}
          >
            <Text style={[styles.label, { color: on ? theme.onFill : theme.ink2 }]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: RADIUS.field, padding: 4, gap: 4 },
  option: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  label: { fontSize: 12.5, fontWeight: '800' },
  disabled: { opacity: 0.35 },
});

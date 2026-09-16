import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { filled, pressed, raised, sunken, RADIUS } from '../theme/clay';
import { play, Voice } from '../lib/sound';
import { tapFeedback } from '../lib/haptics';
import { IconProps } from './icons';

/**
 * The clay primitives. Everything visible in the app is one of these, which is
 * what keeps the material consistent -- the moment surfaces start inventing
 * their own shadows, the illusion goes.
 */

export function Surface({
  style,
  children,
  inset,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  inset?: boolean;
}) {
  const { theme } = useTheme();
  return <View style={[inset ? sunken(theme) : raised(theme), style]}>{children}</View>;
}

type BlobProps = {
  Icon: React.ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  /** Which sound the press makes. */
  voice?: Voice;
  busy?: boolean;
  dimmed?: boolean;
  /** The one filled control: Wake. */
  accent?: boolean;
  danger?: boolean;
  /** Shows a tick or a cross in the corner once the action reports back. */
  result?: 'ok' | 'bad' | null;
  style?: StyleProp<ViewStyle>;
};

export function Blob({
  Icon,
  label,
  onPress,
  voice = 'tap',
  busy,
  dimmed,
  accent,
  danger,
  result,
  style,
}: BlobProps) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);

  const base = accent
    ? filled(theme, theme.dawn, 'rgba(0,0,0,0.18)')
    : raised(theme);

  const iconColour = accent ? theme.onFill : danger ? theme.danger : theme.ink;

  return (
    <Pressable
      style={[
        styles.blob,
        base,
        down && pressed(theme),
        dimmed && styles.dimmed,
        style,
      ]}
      onPressIn={() => {
        setDown(true);
        play(voice);
        tapFeedback();
      }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color={iconColour} style={styles.spinner} />
      ) : (
        <>
          <Icon size={28} color={iconColour} strokeWidth={2} />
          <Text style={[styles.blobLabel, { color: accent ? theme.onFill : theme.ink }]}>
            {label}
          </Text>
        </>
      )}

      {result && (
        <View
          style={[
            styles.badge,
            { backgroundColor: result === 'ok' ? theme.moss : theme.danger },
          ]}
        >
          <Text style={styles.badgeMark}>{result === 'ok' ? '✓' : '✕'}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A full-width button — Save, Test connection, the BIOS row. */
export function ClayButton({
  label,
  onPress,
  tone = 'plain',
  busy,
  dimmed,
  voice = 'tap',
  icon: Icon,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'accent' | 'danger' | 'quiet';
  busy?: boolean;
  dimmed?: boolean;
  voice?: Voice;
  icon?: React.ComponentType<IconProps>;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);

  const base =
    tone === 'accent'
      ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)')
      : tone === 'danger'
      ? filled(theme, theme.danger, 'rgba(0,0,0,0.2)')
      : tone === 'quiet'
      ? sunken(theme)
      : raised(theme);

  const colour =
    tone === 'accent' || tone === 'danger' ? '#FFFFFF' : tone === 'quiet' ? theme.ink2 : theme.ink;

  return (
    <Pressable
      style={[styles.button, base, down && pressed(theme), dimmed && styles.dimmed, style]}
      onPressIn={() => {
        setDown(true);
        play(voice);
        tapFeedback();
      }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color={colour} />
      ) : (
        <>
          {Icon && <Icon size={19} color={colour} strokeWidth={1.9} />}
          <Text style={[styles.buttonLabel, { color: colour }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The on/off switches in Settings. */
export function ClaySwitch({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[
        styles.switch,
        value
          ? filled(theme, theme.dusk, 'rgba(0,0,0,0.25)')
          : sunken(theme, 0.6),
      ]}
      onPress={() => {
        onChange(!value);
        // After the flag flips, so switching sound back on is audible.
        play('tap');
        tapFeedback();
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.knob,
          { backgroundColor: value ? '#FFFFFF' : theme.clayHi, boxShadow: [{ offsetX: 2, offsetY: 2, blurRadius: 5, color: theme.shadow }] },
          value && styles.knobOn,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blob: {
    flex: 1,
    borderRadius: RADIUS.blob,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 104,
  },
  blobLabel: { fontWeight: '800', fontSize: 12.5 },
  dimmed: { opacity: 0.42 },
  spinner: { height: 28 },

  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', lineHeight: 14 },

  button: {
    borderRadius: RADIUS.field,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonLabel: { fontWeight: '800', fontSize: 14.5 },

  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  knob: { width: 22, height: 22, borderRadius: 11 },
  knobOn: { transform: [{ translateX: 20 }] },
});

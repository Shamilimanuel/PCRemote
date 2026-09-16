import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { filled, pressed, raised, sunken, RADIUS } from '../theme/clay';
import { play, Voice } from '../lib/sound';
import { tapFeedback, warningFeedback, successFeedback } from '../lib/haptics';
import { HOLD_MS } from '../lib/settings';
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
  /**
   * Require a sustained press instead of a tap. The button fills as it charges
   * and only fires when full -- a confirmation you feel rather than dismiss.
   */
  hold?: boolean;
  /** Fired when a hold is abandoned before it completes. */
  onHoldCancel?: () => void;
  /** A separate long-press gesture, used to offer a delay. */
  onLongPress?: () => void;
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
  hold,
  onHoldCancel,
  onLongPress,
  style,
}: BlobProps) {
  const { theme } = useTheme();
  const [down, setDown] = useState(false);

  // Driven natively so the fill stays smooth while JS is busy talking to the PC.
  const charge = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function startHold() {
    fired.current = false;
    charge.setValue(0);
    Animated.timing(charge, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    timer.current = setTimeout(() => {
      fired.current = true;
      successFeedback();
      play('done');
      onPress();
    }, HOLD_MS);
  }

  function endHold() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    Animated.timing(charge, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // Let go early and nothing happens, which is the point.
    if (!fired.current) onHoldCancel?.();
  }

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
        if (hold) {
          warningFeedback();
          startHold();
        } else {
          tapFeedback();
        }
      }}
      onPressOut={() => {
        setDown(false);
        if (hold) endHold();
      }}
      onPress={hold ? undefined : onPress}
      onLongPress={onLongPress}
      delayLongPress={600}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={hold ? `${label}. Press and hold.` : label}
      accessibilityHint={hold ? 'Hold until the button fills' : undefined}
    >
      {hold && (
        <>
          {/*
            Rises from the bottom rather than sweeping across, and deepens as it
            goes, so the button reads as filling up with the consequence. Red
            whatever the button's own colour, because everything that holds is
            something you cannot undo.
          */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.charge,
              {
                backgroundColor: theme.danger,
                opacity: charge.interpolate({
                  inputRange: [0, 0.08, 0.75, 1],
                  outputRange: [0, 0.22, 0.62, 0.92],
                }),
                transform: [
                  { translateY: CHARGE_HEIGHT / 2 },
                  { scaleY: charge },
                  { translateY: -CHARGE_HEIGHT / 2 },
                ],
              },
            ]}
          />
          {/* A brighter lip on the rising edge, so the level itself is visible. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.chargeEdge,
              {
                backgroundColor: theme.danger,
                opacity: charge.interpolate({
                  inputRange: [0, 0.06, 1],
                  outputRange: [0, 0.9, 0.35],
                }),
                transform: [
                  {
                    translateY: charge.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -CHARGE_HEIGHT],
                    }),
                  },
                ],
              },
            ]}
          />
        </>
      )}

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

// Taller than any button, so the rise never runs out before the hold does.
const CHARGE_HEIGHT = 240;

const styles = StyleSheet.create({
  charge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CHARGE_HEIGHT,
  },
  chargeEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
  },
  blob: {
    flex: 1,
    borderRadius: RADIUS.blob,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 104,
    overflow: 'hidden',
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

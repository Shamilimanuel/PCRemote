import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, sunken } from '../theme/clay';
import { ClayButton } from './Clay';
import { WakeWatch } from '../hooks/useWakeWatch';

const SIZE = 84;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * Fills the minute after Wake, which used to be dead air.
 *
 * A spinner says "something is happening". A number says "this is normal, keep
 * waiting" — and that is the actual question in the user's head.
 */
export default function WakeProgress({ watch, name }: { watch: WakeWatch; name: string }) {
  const { theme, t } = useTheme();
  if (watch.state === 'idle') return null;

  const fraction = Math.min(1, watch.elapsed / watch.giveUpSeconds);
  const done = watch.state === 'awake';
  const failed = watch.state === 'gaveup';

  const arc = done ? theme.moss : failed ? theme.danger : theme.dusk;
  const mark = done ? '✓' : failed ? '✕' : `${watch.elapsed}s`;

  return (
    <View style={[styles.card, sunken(theme, 0.8)]}>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={theme.ground}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={arc}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - (done || failed ? 1 : fraction))}
            // Start the sweep at twelve o'clock rather than three.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.markWrap} pointerEvents="none">
          <Text
            style={[
              styles.mark,
              { color: done || failed ? arc : theme.ink },
              (done || failed) && styles.markBig,
            ]}
          >
            {mark}
          </Text>
        </View>
      </View>

      <Text style={[styles.line, { color: done ? theme.moss : failed ? theme.danger : theme.ink }]}>
        {watch.state === 'sending'
          ? t.sendingSignal
          : watch.state === 'waiting'
          ? t.wakingEllipsis
          : done
          ? t.awake
          : t.noAnswerMinute}
      </Text>

      <Text style={[styles.sub, { color: theme.ink3 }]}>
        {watch.state === 'sending'
          ? t.sendingSignalSub
          : watch.state === 'waiting'
          ? t.wakingSub
          : done
          ? t.cameUpIn(name, watch.tookSeconds ?? 0)
          : t.noAnswerSub}
      </Text>

      {failed && (
        <View style={[styles.causes, { backgroundColor: theme.ground }]}>
          <Text style={[styles.causesTitle, { color: theme.ink2 }]}>{t.mostLikely}</Text>
          <Cause n="1" text={t.cause1} />
          <Cause n="2" text={t.cause2} />
          <Cause n="3" text={t.cause3} />
        </View>
      )}

      {(done || failed) && (
        <ClayButton
          label={t.dismiss}
          tone="quiet"
          voice="tap"
          onPress={watch.dismiss}
          style={styles.dismiss}
        />
      )}
    </View>
  );
}

function Cause({ n, text }: { n: string; text: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.cause}>
      <Text style={[styles.causeNum, { color: theme.ink3 }]}>{n}</Text>
      <Text style={[styles.causeText, { color: theme.ink2 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.card,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginTop: 14,
    alignItems: 'center',
  },
  ring: { width: SIZE, height: SIZE, marginBottom: 12 },
  markWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  markBig: { fontSize: 32 },
  line: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  causes: { alignSelf: 'stretch', borderRadius: RADIUS.field, padding: 14, marginTop: 14, gap: 9 },
  causesTitle: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  cause: { flexDirection: 'row', gap: 9 },
  causeNum: { fontSize: 12, fontWeight: '800', width: 12 },
  causeText: { fontSize: 12.5, fontWeight: '600', lineHeight: 18, flex: 1 },

  dismiss: { alignSelf: 'stretch', marginTop: 14 },
});

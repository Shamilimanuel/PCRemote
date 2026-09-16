import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised } from '../theme/clay';
import { ClayButton } from './Clay';

/**
 * "Shut down when this download finishes."
 *
 * The agent already shuts down on a timer -- it was just hardcoded to five
 * seconds so the reply could get back to the phone first. Handing it a longer
 * delay costs nothing, and Cancel already aborts whatever is counting down.
 */

export const DELAY_CHOICES: { key: 'now' | 'in15' | 'in30' | 'in60' | 'in120'; seconds: number }[] = [
  { key: 'now', seconds: 5 },
  { key: 'in15', seconds: 15 * 60 },
  { key: 'in30', seconds: 30 * 60 },
  { key: 'in60', seconds: 60 * 60 },
  { key: 'in120', seconds: 120 * 60 },
];

type Props = {
  visible: boolean;
  /** "Shut down" or "Restart". */
  verb: string;
  onPick: (seconds: number) => void;
  onClose: () => void;
};

export default function TimerSheet({ visible, verb, onPick, onClose }: Props) {
  const { theme, t } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, raised(theme), { backgroundColor: theme.clayHi }]}>
          <Text style={[styles.title, { color: theme.ink }]}>{t.shutDownWhen(verb)}</Text>
          <Text style={[styles.hint, { color: theme.ink2 }]}>
            {t.timerHint}
          </Text>

          <View style={styles.choices}>
            {DELAY_CHOICES.map((choice) => (
              <ClayButton
                key={choice.seconds}
                label={t[choice.key]}
                tone={choice.seconds <= 5 ? 'danger' : 'plain'}
                voice={choice.seconds <= 5 ? 'shutdown' : 'tap'}
                onPress={() => {
                  onClose();
                  onPick(choice.seconds);
                }}
                style={styles.choice}
              />
            ))}
          </View>

          <ClayButton label={t.neverMind} tone="quiet" voice="cancel" onPress={onClose} style={styles.choice} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,8,24,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: RADIUS.sheet,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 7, fontWeight: '600', lineHeight: 19 },
  choices: { marginTop: 20, gap: 9 },
  choice: { alignSelf: 'stretch', marginTop: 0 },
});

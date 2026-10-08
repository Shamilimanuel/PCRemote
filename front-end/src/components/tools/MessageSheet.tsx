import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Device } from '../../types/device';
import { sendMessage } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, sunken, raised } from '../../theme/clay';
import { successFeedback, failureFeedback, tapFeedback } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { ClayButton } from '../Clay';
import Sheet from '../Sheet';

const MAX = 300;

/** "Dinner's ready!" in the corner of the PC's screen. */
export default function MessageSheet({ device, visible, onClose }: { device: Device; visible: boolean; onClose: () => void }) {
  const { theme, t } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (visible) setStatus(null);
  }, [visible]);

  async function send() {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    setStatus(null);
    try {
      await sendMessage(device, message);
      setText('');
      setStatus({ ok: true, text: t.messageShown });
      play('done');
      successFeedback();
    } catch (err) {
      setStatus({ ok: false, text: explain(err, t).message });
      play('fail');
      failureFeedback();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title={t.messageTitle(device.name)} subtitle={t.messageHint} onClose={onClose}>
      <View style={styles.phrases}>
        {t.quickPhrases.map((phrase) => (
          <Pressable
            key={phrase}
            onPress={() => { setText(phrase); tapFeedback(); }}
            style={[styles.phrase, raised(theme, 0.5)]}
            accessibilityRole="button"
          >
            <Text style={[styles.phraseText, { color: theme.ink }]}>{phrase}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.field, sunken(theme, 0.7)]}>
        <TextInput
          value={text}
          onChangeText={(value) => setText(value.slice(0, MAX))}
          placeholder={t.messagePlaceholder}
          placeholderTextColor={theme.ink3}
          multiline
          maxLength={MAX}
          style={[styles.input, { color: theme.ink }]}
          accessibilityLabel={t.messagePlaceholder}
        />
        <Text style={[styles.count, { color: theme.ink3 }]}>{text.length}/{MAX}</Text>
      </View>

      <ClayButton label={t.send} tone="accent" busy={busy} dimmed={!text.trim()} onPress={send} />

      {status && (
        <Text style={[styles.status, { color: status.ok ? theme.moss : theme.danger }]}>{status.text}</Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  phrases: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phrase: { borderRadius: RADIUS.pill, paddingVertical: 9, paddingHorizontal: 14 },
  phraseText: { fontSize: 13, fontWeight: '700' },
  field: { borderRadius: RADIUS.field, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  input: { fontSize: 15, fontWeight: '600', minHeight: 70, maxHeight: 140, textAlignVertical: 'top', padding: 0 },
  count: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 4, fontVariant: ['tabular-nums'] },
  status: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
});

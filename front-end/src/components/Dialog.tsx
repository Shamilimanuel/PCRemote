import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised } from '../theme/clay';
import { ClayButton } from './Clay';
import { play } from '../lib/sound';
import { warningFeedback } from '../lib/haptics';

/**
 * Replaces Alert.alert, which draws the operating system's own dialog and
 * cannot be styled — so the one moment the app most needs to explain itself
 * was also the one moment it stopped looking like itself.
 */

export type Tone = 'good' | 'bad' | 'warn' | 'plain';

export type DialogRequest = {
  tone?: Tone;
  title: string;
  message?: string;
  /** Label for the action button. Defaults to OK. */
  confirmLabel?: string;
  /** Supply this to get a second, dismissing button. */
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
};

type Ctx = { show: (request: DialogRequest) => void };

const DialogContext = createContext<Ctx>({ show: () => {} });

const MARK: Record<Tone, string> = {
  good: '✓',
  bad: '✕',
  warn: '!',
  plain: '',
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const show = useCallback((next: DialogRequest) => {
    setRequest(next);
    if (next.cancelLabel) warningFeedback();
  }, []);

  const close = () => setRequest(null);

  const tone = request?.tone ?? 'plain';
  const accent =
    tone === 'good' ? theme.moss : tone === 'bad' ? theme.danger : tone === 'warn' ? theme.dawnDeep : theme.dusk;

  return (
    <DialogContext.Provider value={{ show }}>
      {children}

      <Modal visible={request !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.card, raised(theme), { backgroundColor: theme.clayHi }]}>
            {tone !== 'plain' && (
              <View style={[styles.mark, { backgroundColor: accent }]}>
                <Text style={styles.markText}>{MARK[tone]}</Text>
              </View>
            )}

            <Text style={[styles.title, { color: theme.ink }]}>{request?.title}</Text>
            {request?.message ? (
              <Text style={[styles.message, { color: theme.ink2 }]}>{request.message}</Text>
            ) : null}

            <View style={styles.actions}>
              {request?.cancelLabel && (
                <ClayButton
                  label={request.cancelLabel}
                  tone="quiet"
                  voice="cancel"
                  onPress={close}
                  style={styles.action}
                />
              )}
              <ClayButton
                label={request?.confirmLabel ?? 'OK'}
                tone={request?.destructive ? 'danger' : 'accent'}
                voice={request?.destructive ? 'shutdown' : 'tap'}
                onPress={() => {
                  const run = request?.onConfirm;
                  close();
                  run?.();
                }}
                style={styles.action}
              />
            </View>
          </View>
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}

/** Convenience for the common "tell them what went wrong" case. */
export function useReport() {
  const { show } = useDialog();
  return useCallback(
    (title: string, message: string, tone: Tone = 'bad') => {
      play(tone === 'good' ? 'done' : 'fail');
      show({ tone, title, message });
    },
    [show]
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
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'center',
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  markText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', lineHeight: 26 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    fontWeight: '600',
  },
  actions: { alignSelf: 'stretch', marginTop: 22, gap: 10 },
  action: { alignSelf: 'stretch' },
});

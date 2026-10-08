import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised } from '../theme/clay';

/**
 * The panel every tool opens in: rises from the bottom, a title, and the
 * tool underneath. One shape for all of them, so the six feel like parts of
 * the same app rather than six apps.
 *
 * Tapping outside closes it, and so does the back button. The keyboard pushes
 * it up rather than covering the box being typed in.
 */
export default function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** False for content that scrolls itself, or must not move. */
  scroll?: boolean;
}) {
  const { theme, t } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.close} />
        <View
          style={[
            styles.sheet,
            raised(theme),
            { backgroundColor: theme.clayHi, paddingBottom: 18 + insets.bottom },
          ]}
        >
          <View style={[styles.grip, { backgroundColor: theme.ink3 }]} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? <Text style={[styles.subtitle, { color: theme.ink2 }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.close, { color: theme.dusk }]}>{t.close}</Text>
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, styles.bodyContent]}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,8,24,0.55)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grip: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, opacity: 0.35, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginTop: 4 },
  close: { fontSize: 15, fontWeight: '800', paddingTop: 3 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12, paddingBottom: 4 },
});

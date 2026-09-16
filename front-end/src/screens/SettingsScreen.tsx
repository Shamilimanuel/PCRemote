import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  checkForUpdateDetailed,
  installedVersionLabel,
  UpdateCheck,
} from '../lib/updates';
import { useTheme } from '../theme/ThemeContext';
import { THEMES, ThemeName, RADIUS, raised, sunken, filled } from '../theme/clay';
import { POLL_CHOICES, ConfirmStyle } from '../lib/settings';
import { LANGUAGE_NAMES, LanguageChoice, deviceLanguage } from '../i18n';
import { Surface, ClaySwitch, ClayButton } from '../components/Clay';
import { play } from '../lib/sound';
import { successFeedback, failureFeedback, tapFeedback } from '../lib/haptics';

const ORDER: ThemeName[] = ['dawn', 'dusk', 'midnight'];

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { theme, settings, update, t } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.ground }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.back, { color: theme.dusk }]}>{t.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.ink }]}>{t.settings}</Text>

        <Label>{t.theme}</Label>
        <View style={styles.themeRow}>
          {ORDER.map((name) => {
            const t = THEMES[name];
            const selected = settings.theme === name;
            return (
              <Pressable
                key={name}
                style={[styles.themeChip, raised(theme, 0.7)]}
                onPress={() => {
                  update({ theme: name });
                  play('tap');
                  tapFeedback();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t.label}
              >
                <View
                  style={[
                    styles.dab,
                    { backgroundColor: t.clayHi },
                    selected && { borderWidth: 2.5, borderColor: theme.dusk },
                  ]}
                >
                  <View style={[styles.dabDot, { backgroundColor: t.dawn }]} />
                </View>
                <Text style={[styles.themeName, { color: selected ? theme.ink : theme.ink2 }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Label>{t.feedback}</Label>
        <Row
          title={t.sound}
          hint={t.soundHint}
          right={<ClaySwitch value={settings.sound} onChange={(v) => update({ sound: v })} label={t.sound} />}
        />
        <Row
          title={t.vibration}
          hint={t.vibrationHint}
          right={
            <ClaySwitch value={settings.haptics} onChange={(v) => update({ haptics: v })} label={t.vibration} />
          }
        />

        <Label>{t.safety}</Label>
        <Row
          title={t.beforeShutdown}
          hint={t.beforeShutdownHint}
          right={
            <View style={styles.segment}>
              {([
                ['hold', t.hold],
                ['dialog', t.ask],
                ['off', t.off],
              ] as [ConfirmStyle, string][]).map(([value, label]) => {
                const selected = settings.confirmStyle === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.segItem, selected && filled(theme, theme.dusk, 'rgba(0,0,0,0.25)')]}
                    onPress={() => {
                      update({ confirmStyle: value });
                      play('tap');
                      tapFeedback();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.segText, { color: selected ? '#FFFFFF' : theme.ink3 }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />
        <Text style={[styles.rowNote, { color: theme.ink3 }]}>
          {settings.confirmStyle === 'hold'
            ? t.holdNote
            : settings.confirmStyle === 'dialog'
            ? t.askNote
            : t.offNote}
        </Text>

        <Label>{t.checkThePc}</Label>
        <Row
          title={t.every}
          hint={t.everyHint}
          right={
            <View style={styles.segment}>
              {POLL_CHOICES.map((seconds) => {
                const selected = settings.pollSeconds === seconds;
                return (
                  <Pressable
                    key={seconds}
                    style={[styles.segItem, selected && filled(theme, theme.dusk, 'rgba(0,0,0,0.25)')]}
                    onPress={() => {
                      update({ pollSeconds: seconds });
                      play('tap');
                      tapFeedback();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.segText, { color: selected ? '#FFFFFF' : theme.ink3 }]}
                    >
                      {seconds === 0 ? t.off : `${seconds}s`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />

        <Label>{t.language}</Label>
        <Row
          title={t.language}
          hint={t.languageHint}
          right={
            <View style={styles.segment}>
              {([
                ['system', t.systemLanguage],
                ['en', LANGUAGE_NAMES.en],
                ['nl', LANGUAGE_NAMES.nl],
              ] as [LanguageChoice, string][]).map(([value, label]) => {
                const selected = settings.language === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.segItem, selected && filled(theme, theme.dusk, 'rgba(0,0,0,0.25)')]}
                    onPress={() => {
                      update({ language: value });
                      play('tap');
                      tapFeedback();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.segText, { color: selected ? '#FFFFFF' : theme.ink3 }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />
        <Text style={[styles.rowNote, { color: theme.ink3 }]}>
          {settings.language === 'system'
            ? `${t.systemLanguage}: ${LANGUAGE_NAMES[deviceLanguage()]}`
            : ' '}
        </Text>

        <Label>{t.version}</Label>
        <UpdateSection />

        <ClayButton label={t.done} tone="accent" onPress={onBack} style={styles.done} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Says what happened, every time. The banner on the device list is passive and
 * stays quiet when a check fails, which is indistinguishable from "no update" --
 * this is where you come to find out which it was.
 */
function UpdateSection() {
  const { theme, t } = useTheme();
  const [state, setState] = useState<'idle' | 'checking'>('idle');
  const [result, setResult] = useState<UpdateCheck | null>(null);

  async function check() {
    setState('checking');
    setResult(null);
    const outcome = await checkForUpdateDetailed();
    setResult(outcome);
    setState('idle');
    if (outcome.state === 'error') {
      play('fail');
      failureFeedback();
    } else {
      play('done');
      successFeedback();
    }
  }

  const tone =
    result?.state === 'available' ? theme.dusk : result?.state === 'error' ? theme.danger : theme.moss;

  return (
    <Surface inset style={styles.aboutCard}>
      <Text style={[styles.aboutLine, { color: theme.ink }]}>
        Reveille {installedVersionLabel()}
      </Text>

      {result && (
        <Text style={[styles.aboutStatus, { color: tone }]}>
          {result.state === 'current'
            ? t.upToDate
            : result.state === 'available'
            ? t.updateAvailable(result.info.version)
            : result.reason}
        </Text>
      )}

      {!result && (
        <Text style={[styles.aboutHint, { color: theme.ink3 }]}>
          {t.alsoChecksOnOpen}
        </Text>
      )}

      <ClayButton
        label={state === 'checking' ? t.checkingEllipsis : t.checkForUpdates}
        busy={state === 'checking'}
        onPress={check}
        style={styles.aboutAction}
      />

      {result?.state === 'available' && (
        <ClayButton
          label={t.download(result.info.version)}
          tone="accent"
          onPress={() => Linking.openURL(result.info.downloadUrl)}
          style={styles.aboutAction}
        />
      )}
    </Surface>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.groupLabel, { color: theme.ink3 }]}>{children}</Text>;
}

function Row({ title, hint, right }: { title: string; hint: string; right: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, sunken(theme, 0.8)]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.ink }]}>{title}</Text>
        <Text style={[styles.rowHint, { color: theme.ink3 }]}>{hint}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', paddingTop: 14 },
  back: { fontSize: 16, fontWeight: '700' },
  scroll: { paddingBottom: 34 },
  title: { fontSize: 30, fontWeight: '800', marginTop: 10, marginBottom: 4, letterSpacing: -0.4 },

  groupLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 10,
  },

  themeRow: { flexDirection: 'row', gap: 10 },
  themeChip: { flex: 1, borderRadius: RADIUS.field, paddingVertical: 11, alignItems: 'center', gap: 8 },
  dab: {
    width: '76%',
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dabDot: { width: 12, height: 12, borderRadius: 6 },
  themeName: { fontSize: 11.5, fontWeight: '800' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: RADIUS.field,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginBottom: 9,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowHint: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  segment: { flexDirection: 'row', gap: 5 },
  segItem: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 12 },
  segText: { fontSize: 11.5, fontWeight: '800' },
  rowNote: { fontSize: 11.5, fontWeight: '600', lineHeight: 17, marginTop: -2, marginBottom: 4, paddingHorizontal: 4 },

  aboutCard: { borderRadius: RADIUS.field, padding: 15 },
  aboutLine: { fontSize: 13, fontWeight: '700' },
  aboutHint: { fontSize: 11.5, fontWeight: '600', marginTop: 4, lineHeight: 16 },
  aboutStatus: { fontSize: 12.5, fontWeight: '800', marginTop: 5, lineHeight: 18 },
  aboutAction: { marginTop: 12 },

  done: { marginTop: 28 },
});

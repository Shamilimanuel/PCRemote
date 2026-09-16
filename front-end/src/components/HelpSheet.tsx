import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SETUP_COMMAND =
  'irm https://raw.githubusercontent.com/Shamilimanuel/PCRemote/main/setup.ps1 | iex';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Sends the reader straight to the camera from step 3. */
  onScan?: () => void;
};

/**
 * The instructions someone needs the first time, kept behind a "?" rather than
 * crowding the form. Everything here is the short version -- the full detail
 * lives in the README, which nobody reads on a phone.
 */
export default function HelpSheet({ visible, onClose, onScan }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Adding your PC</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Step
              number="1"
              title="Set up the PC"
              body="On the PC you want to control, open PowerShell from the Start menu and paste this in:"
            />
            <View style={styles.command}>
              <Text style={styles.commandText} selectable>
                {SETUP_COMMAND}
              </Text>
            </View>
            <Text style={styles.aside}>
              It installs everything, sets itself to start with Windows, and finishes by opening a
              page with a code on it. You only ever do this once per PC.
            </Text>

            <Step
              number="2"
              title="Scan the code"
              body="Tap Scan code and point your phone at the page on your screen. Every box below fills itself in."
            />
            {onScan && (
              <Pressable
                style={styles.scanNow}
                onPress={() => {
                  onClose();
                  onScan();
                }}
              >
                <Text style={styles.scanNowText}>Scan code</Text>
              </Pressable>
            )}

            <Step
              number="3"
              title="Or type it in"
              body="The same page lists everything in plain text underneath the code. If the camera won't cooperate, copy those five values into the boxes by hand."
            />

            <View style={styles.divider} />

            <Text style={styles.footTitle}>Two things that catch people out</Text>
            <Text style={styles.foot}>
              <Text style={styles.footLead}>Both devices need the same Wi-Fi.</Text> This works on
              your home network, not over mobile data. That's deliberate — nothing is exposed to the
              internet.
            </Text>
            <Text style={styles.foot}>
              <Text style={styles.footLead}>The token is a password.</Text> Anyone on your network
              who has it can switch the PC off. Don't share the page it's printed on.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.bullet}>
        <Text style={styles.bulletText}>{number}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#161A23',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    paddingHorizontal: 22,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A4050',
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 6,
  },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  close: { color: '#3D7EFF', fontSize: 16, fontWeight: '600' },
  body: { paddingBottom: 28 },

  step: { flexDirection: 'row', gap: 13, marginTop: 20 },
  bullet: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#22293A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: { color: '#7FA8FF', fontWeight: '700', fontSize: 13 },
  stepBody: { flex: 1 },
  stepTitle: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600', marginBottom: 3 },
  stepText: { color: '#8A8F9C', fontSize: 14, lineHeight: 20 },

  command: {
    backgroundColor: '#0B0D12',
    borderRadius: 12,
    padding: 13,
    marginTop: 12,
    marginLeft: 38,
  },
  commandText: { color: '#8FE3B0', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 17 },
  aside: { color: '#5A5F6B', fontSize: 12.5, lineHeight: 18, marginTop: 9, marginLeft: 38 },

  scanNow: {
    backgroundColor: '#1E2C4A',
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
    marginLeft: 38,
  },
  scanNowText: { color: '#7FA8FF', fontWeight: '700', fontSize: 14.5 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#2A2E3A', marginTop: 26 },
  footTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  foot: { color: '#8A8F9C', fontSize: 13.5, lineHeight: 20, marginBottom: 12 },
  footLead: { color: '#C8CDD8', fontWeight: '600' },
});

import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from '../types/device';
import { useDeviceStatus } from '../hooks/useDeviceStatus';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS, raised, sunken, filled } from '../theme/clay';
import UpdateBanner from '../components/UpdateBanner';
import { GearIcon } from '../components/icons';
import { play } from '../lib/sound';
import { tapFeedback } from '../lib/haptics';

type Props = {
  devices: Device[];
  onSelect: (device: Device) => void;
  onAdd: () => void;
  onSettings: () => void;
};

export default function DeviceListScreen({ devices, onSelect, onAdd, onSettings }: Props) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.ground }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]}>Reveille</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={onSettings} hitSlop={12} accessibilityLabel="Settings">
            <GearIcon size={22} color={theme.ink3} strokeWidth={1.9} />
          </Pressable>
          <Pressable
            style={[styles.add, filled(theme, theme.dusk, 'rgba(0,0,0,0.22)')]}
            onPress={() => {
              play('tap');
              tapFeedback();
              onAdd();
            }}
          >
            <Text style={styles.addText}>+ Add PC</Text>
          </Pressable>
        </View>
      </View>

      <UpdateBanner />

      {devices.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>No PCs yet</Text>
          <Text style={[styles.emptyText, { color: theme.ink3 }]}>
            Tap “+ Add PC” to get started. There’s a ? there if you haven’t set the PC up yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <DeviceCard device={item} onPress={() => onSelect(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function DeviceCard({ device, onPress }: { device: Device; onPress: () => void }) {
  const { theme, settings } = useTheme();
  const { status } = useDeviceStatus(
    device,
    settings.pollSeconds > 0 ? settings.pollSeconds * 1000 : 0
  );
  const [down, setDown] = React.useState(false);

  return (
    <Pressable
      style={[styles.card, raised(theme), down && styles.cardDown]}
      onPressIn={() => {
        setDown(true);
        play('tap');
        tapFeedback();
      }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
    >
      <View style={styles.cardText}>
        <Text style={[styles.cardName, { color: theme.ink }]} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={[styles.cardAddress, { color: theme.ink3 }]}>{device.ip}</Text>
      </View>
      <View style={[styles.pill, sunken(theme, 0.6)]}>
        <View
          style={[styles.dot, { backgroundColor: status === 'online' ? theme.moss : theme.ink3 }]}
        />
        <Text
          style={[styles.pillText, { color: status === 'online' ? theme.moss : theme.ink3 }]}
        >
          {status === 'online' ? 'Awake' : status === 'offline' ? 'Asleep' : '…'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  add: { borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 9 },
  addText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  list: { paddingHorizontal: 20, paddingTop: 10, gap: 14, paddingBottom: 24 },
  card: {
    borderRadius: RADIUS.card,
    paddingVertical: 18,
    paddingHorizontal: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardDown: { transform: [{ scale: 0.98 }] },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  cardAddress: { fontSize: 12.5, fontWeight: '700', marginTop: 3 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: RADIUS.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 11.5, fontWeight: '800' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21, fontWeight: '600' },
});

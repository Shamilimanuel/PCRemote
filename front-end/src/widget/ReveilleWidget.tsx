import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { DeviceStatus } from '../types/device';

/**
 * The home screen widget. Android renders this through RemoteViews rather than
 * React Native's own view system, so only the widget primitives are available
 * here -- no StyleSheet, no SVG, no touch handlers. Interaction happens through
 * `clickAction` strings that come back to the task handler.
 */

export type WidgetState = {
  deviceName: string | null;
  status: DeviceStatus;
  /** Shown under the name: uptime, a result message, or an error. */
  detail?: string;
  /** Which button is mid-flight, so it can show as busy. */
  busy?: string | null;
};

const BG = '#151922';
const SURFACE = '#232836';
const TEXT = '#FFFFFF';
const MUTED = '#8A8F9C';
const GREEN = '#5FD68C';
const FAINT = '#5A5F6B';

const STATUS_COLOUR: Record<DeviceStatus, `#${string}`> = {
  online: GREEN,
  offline: FAINT,
  unknown: MUTED,
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Checking',
};

function Button({ label, action, busy }: { label: string; action: string; busy: boolean }) {
  return (
    <FlexWidget
      clickAction={busy ? 'NOOP' : action}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 'match_parent',
        backgroundColor: SURFACE,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
      }}
    >
      <TextWidget
        text={busy ? '…' : label}
        style={{ color: busy ? MUTED : TEXT, fontSize: 13, fontWeight: '600' }}
      />
    </FlexWidget>
  );
}

export function ReveilleWidget({ deviceName, status, detail, busy }: WidgetState) {
  if (!deviceName) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: BG,
          borderRadius: 20,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <TextWidget text="Reveille" style={{ color: TEXT, fontSize: 15, fontWeight: '700' }} />
        <TextWidget
          text="Tap to add your PC"
          style={{ color: MUTED, fontSize: 12, marginTop: 4 }}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 20,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      {/* Tapping the name opens the app, where the full set of actions lives. */}
      <FlexWidget
        clickAction="OPEN_APP"
        accessibilityLabel={`Open Reveille for ${deviceName}`}
        style={{ width: 'match_parent', flexDirection: 'column', paddingHorizontal: 4, paddingBottom: 8 }}
      >
        <TextWidget
          text={deviceName}
          maxLines={1}
          style={{ color: TEXT, fontSize: 15, fontWeight: '700' }}
        />
        <TextWidget
          text={detail ? `${STATUS_LABEL[status]} · ${detail}` : STATUS_LABEL[status]}
          maxLines={1}
          style={{ color: STATUS_COLOUR[status], fontSize: 11, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{
          width: 'match_parent',
          flex: 1,
          flexDirection: 'row',
          flexGap: 8,
        }}
      >
        <Button label="Wake" action="WAKE" busy={busy === 'WAKE'} />
        <Button label="Sleep" action="SLEEP" busy={busy === 'SLEEP'} />
        <Button label="Lock" action="LOCK" busy={busy === 'LOCK'} />
      </FlexWidget>
    </FlexWidget>
  );
}

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getDevices } from '../lib/storage';
import { pingHealth, sendAction } from '../lib/api';
import { sendMagicPacket } from '../lib/wol';
import { formatUptime } from '../hooks/useDeviceStatus';
import { Device, DeviceStatus } from '../types/device';
import { ReveilleWidget, WidgetState } from './ReveilleWidget';

/**
 * Runs in a headless JS context when Android adds, refreshes or taps the
 * widget. There is no UI here and no React state that survives between calls,
 * so every render rebuilds itself from storage and a fresh health poll.
 */

const ACTIONS: Record<string, 'sleep' | 'lock'> = {
  SLEEP: 'sleep',
  LOCK: 'lock',
};

/** The widget always controls the first saved PC — it has no room for a picker. */
async function firstDevice(): Promise<Device | null> {
  const devices = await getDevices();
  return devices[0] ?? null;
}

async function currentState(device: Device | null, detail?: string): Promise<WidgetState> {
  if (!device) return { deviceName: null, status: 'unknown' };

  let status: DeviceStatus = 'offline';
  let uptime: string | undefined;
  try {
    const { data } = await pingHealth(device);
    status = 'online';
    uptime = `up ${formatUptime(data.uptimeSeconds)}`;
  } catch {
    status = 'offline';
  }

  return { deviceName: device.name, status, detail: detail ?? uptime };
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, clickAction, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') return;

  const device = await firstDevice();

  if (widgetAction === 'WIDGET_CLICK' && clickAction && clickAction !== 'NOOP') {
    if (!device) {
      renderWidget(<ReveilleWidget deviceName={null} status="unknown" />);
      return;
    }

    // Repaint immediately so the tap registers, then do the work.
    renderWidget(
      <ReveilleWidget deviceName={device.name} status="unknown" detail="working" busy={clickAction} />
    );

    let detail: string;
    try {
      if (clickAction === 'WAKE') {
        await sendMagicPacket(device.mac, device.ip);
        detail = 'wake sent';
      } else if (ACTIONS[clickAction]) {
        await sendAction(device, ACTIONS[clickAction]);
        detail = `${ACTIONS[clickAction]} sent`;
      } else {
        detail = '';
      }
    } catch (err) {
      detail = (err as Error).message.includes('Abort') ? 'no answer' : 'failed';
    }

    // Wake takes a while to show up as online, so report the action rather than
    // a status that is about to be wrong either way.
    renderWidget(<ReveilleWidget {...(await currentState(device, detail)) } />);
    return;
  }

  renderWidget(<ReveilleWidget {...(await currentState(device))} />);
}

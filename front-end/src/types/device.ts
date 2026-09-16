export type Device = {
  id: string;
  name: string;
  ip: string;
  port: number;
  token: string;
  mac: string;
  /**
   * Optional second address for reaching the agent from outside the house —
   * a Tailscale address, say. Tried only after the LAN address fails.
   */
  remoteHost?: string;
};

export type PendingAction = 'shutdown' | 'restart' | 'sleep' | 'lock' | null;

export type NetworkInterface = {
  interface: string;
  ip: string;
  mac: string;
  netmask: string | null;
  /** Where a Wake-on-LAN packet for this adapter should be directed. */
  broadcast: string | null;
};

export type HealthResponse = {
  status: string;
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  /** Absent when talking to an agent older than the network-info change. */
  interfaces?: NetworkInterface[];
};

/**
 * 'unknown' is the state before the first poll comes back; the agent only
 * answers while the PC is awake, so 'offline' covers off, asleep and
 * unreachable alike.
 */
export type DeviceStatus = 'unknown' | 'online' | 'offline';

/** Which address answered — shown so you can tell home from away. */
export type Route = 'local' | 'remote';

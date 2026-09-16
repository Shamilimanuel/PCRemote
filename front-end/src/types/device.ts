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

export type PendingAction = 'shutdown' | 'restart' | 'sleep' | 'lock' | 'firmware' | null;

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
  /**
   * What this particular PC is set up to do. Absent on older agents, which is
   * treated the same as "not available".
   */
  capabilities?: {
    /** True once install-firmware-task.ps1 has been run on the PC. */
    firmwareReboot?: boolean;
    /** Agent accepts a delaySeconds on shutdown and restart. */
    timedShutdown?: boolean;
    /** Agent reports CPU, memory and disk. */
    stats?: boolean;
  };
  /** What the machine is doing. Absent on agents older than this. */
  stats?: MachineStats;
  /** Present only while a timed shutdown or restart is counting down. */
  pending?: { action: string; secondsRemaining: number } | null;
};

export type MachineStats = {
  /** Null on the very first poll, which has nothing to compare against. */
  cpuPercent: number | null;
  cores: number;
  memory: { totalBytes: number; freeBytes: number; usedPercent: number };
  disk: { drive: string; totalBytes: number; freeBytes: number } | null;
};

/**
 * 'unknown' is the state before the first poll comes back; the agent only
 * answers while the PC is awake, so 'offline' covers off, asleep and
 * unreachable alike.
 */
export type DeviceStatus = 'unknown' | 'online' | 'offline';

/** Which address answered — shown so you can tell home from away. */
export type Route = 'local' | 'remote';

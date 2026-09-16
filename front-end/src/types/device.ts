/**
 * What sort of machine this is -- shape only, never an operating system.
 *
 * It changes the icon and nothing else. Every kind here runs the same agent and
 * answers the same commands, so this is a label you pick for yourself, not a
 * capability. What a given machine can actually do still comes from the agent,
 * in `capabilities` below.
 */
export type DeviceKind = 'desktop' | 'laptop' | 'server' | 'mini';

export const DEVICE_KINDS: DeviceKind[] = ['desktop', 'laptop', 'server', 'mini'];

export type Device = {
  id: string;
  name: string;
  ip: string;
  port: number;
  token: string;
  mac: string;
  /** Absent on devices saved before this existed; those are shown as desktops. */
  kind?: DeviceKind;
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

/**
 * Which OS the agent is running on, in the app's own words. Absent when talking
 * to an agent older than the platform change -- read as 'windows', because that
 * is all there was.
 */
export type AgentOs = 'windows' | 'macos' | 'linux';

export type HealthResponse = {
  status: string;
  hostname: string;
  platform: string;
  os?: AgentOs;
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
 * 'unknown' is the state before the first poll comes back. 'offline' covers
 * off, asleep and unreachable alike -- from here they look the same.
 *
 * 'locked' is the gap in between: the PC is powered on and answering, but
 * nobody has logged in yet, so the agent is not running and none of the
 * controls will work. Only PCs set up with install-presence-task.ps1 can
 * report it; on every other PC that stretch still reads as 'offline'.
 */
export type DeviceStatus = 'unknown' | 'online' | 'locked' | 'offline';

/** Which address answered — shown so you can tell home from away. */
export type Route = 'local' | 'remote';

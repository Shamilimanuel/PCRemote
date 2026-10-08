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
    /** Volume, mute and the media keys (Windows). */
    media?: boolean;
    /** Shut down or sleep once the PC goes quiet. */
    whenFinished?: boolean;
    /** ...and can tell a finished download by the network going quiet (Windows). */
    whenFinishedNetwork?: boolean;
    schedules?: boolean;
    /** Messages that pop up on the PC. */
    message?: boolean;
    activity?: boolean;
    /** True when the PC's owner has put at least one app on the list. */
    apps?: boolean;
    /** Screen viewing is switched on, in the setup window on the PC. */
    screen?: boolean;
    /** The PC could show its screen, if its owner switched it on. */
    screenSupported?: boolean;
  };
  /** What the PC will do by itself. Absent on agents older than this. */
  automations?: AutomationSummary;
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
  /** Windows only; null until the first reading, absent on older agents. */
  gpu?: GpuStats | null;
};

export type GpuStats = {
  name: string;
  percent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  /** Only where the card's maker offers a way to read it (NVIDIA). */
  temperatureC: number | null;
};

export type WhenFinished = {
  action: 'shutdown' | 'sleep';
  watch: 'cpu' | 'network' | 'both';
  quietMinutes: number;
  /** How long it has been quiet so far; 0 while it is still busy. */
  quietForSeconds: number;
  cpu: number | null;
  networkBytesPerSecond: number | null;
};

export type ScheduleAction = 'shutdown' | 'restart' | 'sleep';

export type Schedule = {
  id: string;
  /** "HH:MM", the PC's own clock. */
  time: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  action: ScheduleAction;
  enabled: boolean;
  /** A date (YYYY-MM-DD) to skip once, or null. */
  skip: string | null;
  /** When it next happens, worked out by the PC. Not sent back. */
  next?: string | null;
};

export type NextSchedule = { id: string; action: ScheduleAction; time: string; at: string; inSeconds: number };

export type AutomationSummary = {
  whenFinished: WhenFinished | null;
  nextSchedule: NextSchedule | null;
};

export type Automations = AutomationSummary & {
  schedules: Schedule[];
  supports: { network: boolean; maxSchedules: number };
};

export type ActivityEntry = {
  at: string;
  /** A key the app translates: shutdown, message, launch, started ... */
  action: string;
  detail: string | null;
  /** How the phone that did it described itself. Anyone can claim any name. */
  client: string | null;
  from: string | null;
};

/** icon: a small PNG in base64, when the PC found one. */
export type AppEntry = { id: string; name: string; icon?: string | null };

export type Volume = { level: number; muted: boolean };

/**
 * One picture of the PC's screen -- or, with `same`, word that it has not
 * changed since the picture whose `hash` the phone sent, so nothing is resent.
 */
export type ScreenShot = { width: number; height: number; hash: string; jpeg?: string; same?: boolean; at: string };

/** A player Windows knows about: Spotify, a browser tab, Media Player. */
export type MediaSession = {
  id: string;
  app: string;
  title: string;
  artist: string;
  playing: boolean;
  canPlayPause: boolean;
  canNext: boolean;
  canPrevious: boolean;
  /** The one Windows itself treats as current. */
  current: boolean;
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

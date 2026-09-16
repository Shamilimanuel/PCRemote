const os = require('os');
const { exec } = require('child_process');

/**
 * What the PC is currently doing, so the app can answer "is that render
 * finished" without anyone walking over to look.
 *
 * Everything here has to be cheap: /health is polled every ten seconds, and a
 * status check that makes the machine work is self-defeating.
 */

/** Total and idle CPU ticks across all cores. */
function cpuTicks() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const kind of Object.keys(cpu.times)) total += cpu.times[kind];
    idle += cpu.times.idle;
  }
  return { idle, total };
}

// CPU usage is only meaningful as a change over time, so keep the previous
// sample and report the average since then. The first call has nothing to
// compare against and honestly says so.
let previous = cpuTicks();

function cpuPercent() {
  const now = cpuTicks();
  const idleDelta = now.idle - previous.idle;
  const totalDelta = now.total - previous.total;
  previous = now;

  if (totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - idleDelta / totalDelta))));
}

// Disk needs a subprocess, which is far too expensive to do on every poll.
const DISK_TTL_MS = 60000;
let diskCache = { at: 0, value: null };

function systemDrive() {
  // SystemDrive is "C:" on essentially every install, but read it rather than
  // assume -- some corporate images do move it.
  return (process.env.SystemDrive || 'C:').replace(/\\$/, '');
}

function readDisk() {
  return new Promise((resolve) => {
    const drive = systemDrive();
    const command =
      'powershell -NoProfile -NonInteractive -Command ' +
      `"(Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID='${drive}'\\" | ` +
      'Select-Object Size,FreeSpace | ConvertTo-Json -Compress)"';

    exec(command, { timeout: 4000, windowsHide: true }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const total = Number(parsed.Size);
        const free = Number(parsed.FreeSpace);
        if (!Number.isFinite(total) || !Number.isFinite(free)) {
          resolve(null);
          return;
        }
        resolve({ drive, totalBytes: total, freeBytes: free });
      } catch {
        resolve(null);
      }
    });
  });
}

async function disk() {
  const now = Date.now();
  if (diskCache.value && now - diskCache.at < DISK_TTL_MS) return diskCache.value;

  const value = await readDisk();
  // Cache failures too, briefly, so a broken PowerShell doesn't get retried on
  // every single poll.
  diskCache = { at: now, value };
  return value;
}

async function collect() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();

  return {
    cpuPercent: cpuPercent(),
    cores: os.cpus().length,
    memory: {
      totalBytes,
      freeBytes,
      usedPercent: Math.round(100 * (1 - freeBytes / totalBytes)),
    },
    disk: await disk(),
  };
}

module.exports = { collect };

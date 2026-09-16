import * as Application from 'expo-application';

const RELEASES_API = 'https://api.github.com/repos/Shamilimanuel/PCRemote/releases/latest';

// The build workflow sets versionCode = VERSION_CODE_BASE + the run number, and
// tags the matching release v1.0.<run number>. So the two stay in lockstep and
// comparing them needs no extra bookkeeping.
const VERSION_CODE_BASE = 100;

export type UpdateInfo = {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
};

function installedRun(): number | null {
  // nativeBuildVersion is the Android versionCode, as a string.
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const code = Number(raw);
  return Number.isFinite(code) ? code - VERSION_CODE_BASE : null;
}

function releasedRun(tag: string): number | null {
  const m = /^v\d+\.\d+\.(\d+)$/.exec(tag.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Returns the newer release if there is one, otherwise null. Never throws --
 * a failed check should be silent, not a popup about GitHub being down.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const release = await response.json();
    const here = installedRun();
    const there = releasedRun(release.tag_name ?? '');
    if (here === null || there === null || there <= here) return null;

    const apk = (release.assets ?? []).find((a: any) => String(a.name).endsWith('.apk'));
    if (!apk) return null;

    return {
      version: release.tag_name,
      downloadUrl: apk.browser_download_url,
      releaseUrl: release.html_url,
    };
  } catch {
    return null;
  }
}

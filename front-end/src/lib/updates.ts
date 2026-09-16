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

/**
 * Deliberately distinguishes "up to date" from "could not tell", because
 * silently doing nothing on failure is indistinguishable from working, and
 * that is how you end up not knowing whether updates work at all.
 */
export type UpdateCheck =
  | { state: 'current'; installed: string }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'error'; reason: string };

export function installedVersionLabel(): string {
  const name = Application.nativeApplicationVersion ?? '1.0.0';
  const build = Application.nativeBuildVersion;
  if (!build) return name;
  const run = Number(build) - VERSION_CODE_BASE;
  // Builds from this workflow can show the tag they came from; anything else
  // (an old EAS build, a local one) just shows its raw build number.
  return run > 0 ? `v1.0.${run}` : `${name} (build ${build})`;
}

function installedRun(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const code = Number(raw);
  return Number.isFinite(code) ? code - VERSION_CODE_BASE : null;
}

function releasedRun(tag: string): number | null {
  const m = /^v\d+\.\d+\.(\d+)$/.exec(tag.trim());
  return m ? Number(m[1]) : null;
}

export async function checkForUpdateDetailed(): Promise<UpdateCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      return {
        state: 'error',
        reason:
          response.status === 403
            ? 'GitHub is rate-limiting this network. Try again in a few minutes.'
            : `GitHub replied ${response.status}.`,
      };
    }

    const release = await response.json();
    const here = installedRun();
    const there = releasedRun(release.tag_name ?? '');

    if (here === null) return { state: 'error', reason: 'Could not read this app’s version.' };
    if (there === null) return { state: 'error', reason: 'The latest release has an odd name.' };
    if (there <= here) return { state: 'current', installed: installedVersionLabel() };

    const apk = (release.assets ?? []).find((a: any) => String(a.name).endsWith('.apk'));
    if (!apk) return { state: 'error', reason: 'That release has no app file attached.' };

    return {
      state: 'available',
      info: {
        version: release.tag_name,
        downloadUrl: apk.browser_download_url,
        releaseUrl: release.html_url,
      },
    };
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    return {
      state: 'error',
      reason: aborted ? 'GitHub did not answer in time.' : 'No internet connection.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the newer release if there is one, otherwise null. Never throws --
 * the banner should stay quiet when the check fails, since Settings is where
 * you go to find out why.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const result = await checkForUpdateDetailed();
  return result.state === 'available' ? result.info : null;
}

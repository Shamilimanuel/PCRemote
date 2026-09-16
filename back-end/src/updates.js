const fs = require('fs');
const path = require('path');
const { toast } = require('./notify');

/**
 * Tells you when the PC half is out of date.
 *
 * The phone app checks GitHub's releases, because an APK is a release. The
 * agent cannot: it is fetched from `main` by the installer, not from a release,
 * so its "version" is the commit it was installed from. `installed.json` is
 * written by setup.ps1 at install time and holds that commit.
 *
 * Comparing it to whatever `main` points at now is exact, and needs no version
 * number kept in step by hand.
 */

const REPO = 'Shamilimanuel/PCRemote';
const INSTALLED_PATH = path.join(__dirname, '..', 'installed.json');
const STATE_PATH = path.join(__dirname, '..', 'update-state.json');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;   // six hours
const FIRST_CHECK_DELAY_MS = 60 * 1000;      // let the network settle after a boot

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  } catch {
    // A read-only install directory should not stop the agent running.
  }
}

/** The commit this copy was installed from, if the installer recorded one. */
function installedSha() {
  const installed = readJson(INSTALLED_PATH);
  return installed && typeof installed.sha === 'string' ? installed.sha : null;
}

async function latestSha() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'reveille-agent' },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Held in memory so /health can answer without making a request of its own.
let state = {
  installed: installedSha(),
  latest: null,
  updateAvailable: false,
  checkedAt: null,
};

function status() {
  return { ...state };
}

async function check({ notify = false } = {}) {
  const installed = installedSha();
  const latest = await latestSha();

  state = {
    installed,
    latest,
    // Unknown either way means "no", not "yes" -- nagging about an update that
    // may not exist is worse than staying quiet.
    updateAvailable: Boolean(installed && latest && installed !== latest),
    checkedAt: new Date().toISOString(),
  };

  if (!notify || !state.updateAvailable) return state;

  // Tell you once per new commit, not once every six hours forever.
  const seen = readJson(STATE_PATH);
  if (seen && seen.notifiedSha === latest) return state;

  const shown = await toast({
    title: 'Reveille — update available',
    body: 'The PC side is behind. Run the setup command again to update it.',
    url: `https://github.com/${REPO}`,
  });
  if (shown) writeJson(STATE_PATH, { notifiedSha: latest, notifiedAt: state.checkedAt });

  return state;
}

/** Called once at startup; keeps checking quietly thereafter. */
function startWatching() {
  if (!installedSha()) return;   // installed by hand, nothing to compare against

  const first = setTimeout(() => check({ notify: true }), FIRST_CHECK_DELAY_MS);
  const repeat = setInterval(() => check({ notify: true }), CHECK_EVERY_MS);
  // Neither should keep the process alive on its own.
  first.unref?.();
  repeat.unref?.();
}

module.exports = { startWatching, check, status, installedSha };

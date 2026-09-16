const { spawn } = require('child_process');
const { PLATFORM } = require('./platform');

/**
 * Raises a desktop notification from the agent.
 *
 * The agent runs hidden with no window, so a console message reaches nobody.
 * A notification is the only way it can tell you something on its own.
 *
 * Each platform has its own way in -- WinRT toasts, AppleScript, freedesktop --
 * and they share almost nothing, so this file holds three small implementations
 * rather than one awkward abstraction.
 */

// Toasts need an AppID belonging to something actually installed. PowerShell's
// own is present on every Windows machine, so the notification shows up
// attributed to it rather than not showing up at all.
const APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe';

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

/**
 * The script is handed over as -EncodedCommand (UTF-16LE base64) rather than a
 * quoted string: toast XML contains quotes, angle brackets and newlines, and
 * escaping all of that through cmd, PowerShell and back is a reliable way to
 * produce something that silently does nothing.
 */
function windowsToast({ title, body, url }) {
  const launch = url ? ` activationType="protocol" launch="${escapeXml(url)}"` : '';
  const xml =
    `<toast${launch}>` +
    '<visual><binding template="ToastGeneric">' +
    `<text>${escapeXml(title)}</text>` +
    `<text>${escapeXml(body)}</text>` +
    '</binding></visual>' +
    '</toast>';

  const script = `
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml(@'
${xml}
'@)
$toast = New-Object Windows.UI.Notifications.ToastNotification $doc
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${APP_ID}').Show($toast)
`;

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { windowsHide: true }
  );
}

/**
 * AppleScript takes the text as a double-quoted literal, and escapes the same
 * characters inside one that JSON does -- backslash, double quote, and the
 * control characters as \n and friends. So quoting it as JSON and dropping the
 * outer quotes is exact, and avoids hand-rolling an escape table that would
 * only be tested the day someone puts a quotation mark in a hostname.
 */
function appleScriptString(value) {
  return JSON.stringify(String(value)).slice(1, -1);
}

function macNotification({ title, body }) {
  const script =
    `display notification "${appleScriptString(body)}" ` +
    `with title "${appleScriptString(title)}"`;
  return run('osascript', ['-e', script]);
}

function linuxNotification({ title, body }) {
  // Arguments go straight to the binary rather than through a shell, so there
  // is no quoting to get wrong and nothing to escape.
  return run('notify-send', ['--app-name=Reveille', String(title), String(body)]);
}

/** Spawns something that takes its text as arguments and reports whether it worked. */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options });
    child.on('error', () => resolve(false));   // not installed, most likely
    child.on('exit', (code) => resolve(code === 0));
    // Never let a notification hold the agent up.
    setTimeout(() => resolve(false), 10000).unref?.();
  });
}

/**
 * @param {{ title: string, body: string, url?: string }} options
 * @returns {Promise<boolean>} whether the desktop accepted it
 */
function toast(options) {
  if (PLATFORM === 'windows') return windowsToast(options);
  if (PLATFORM === 'macos') return macNotification(options);
  if (PLATFORM === 'linux') return linuxNotification(options);
  return Promise.resolve(false);
}

module.exports = { toast };

const { spawn } = require('child_process');

/**
 * Raises a Windows toast from the agent.
 *
 * The agent runs hidden with no window, so a console message reaches nobody.
 * A toast is the only way it can tell you something on its own.
 *
 * The script is handed over as -EncodedCommand (UTF-16LE base64) rather than a
 * quoted string: toast XML contains quotes, angle brackets and newlines, and
 * escaping all of that through cmd, PowerShell and back is a reliable way to
 * produce something that silently does nothing.
 */

// Toasts need an AppID belonging to something actually installed. PowerShell's
// own is present on every Windows machine, so the notification shows up
// attributed to it rather than not showing up at all.
const APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

/**
 * @param {{ title: string, body: string, url?: string }} options
 * @returns {Promise<boolean>} whether Windows accepted it
 */
function toast({ title, body, url }) {
  if (process.platform !== 'win32') return Promise.resolve(false);

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

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: 'ignore' }
    );
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
    // Never let a notification hold the agent up.
    setTimeout(() => resolve(false), 10000).unref?.();
  });
}

module.exports = { toast };

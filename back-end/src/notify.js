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

/**
 * Reveille's own pop-up: a small card in the corner of the PC's screen.
 *
 * For the things someone at the PC must actually see -- a message from the
 * phone, "your screen is being viewed", "shutting down in five minutes".
 * Windows notifications are not enough for those: Focus, Do Not Disturb, a
 * game, or a switch in Settings can each hide them silently, and on the PC
 * this was built on they never appeared at all. This is an ordinary window, so
 * none of that applies. It stays on top, never takes the keyboard away from
 * whatever is being typed, closes itself after a few seconds, and closes when
 * clicked.
 *
 * Its own short-lived PowerShell, so a pop-up can never hold up the agent.
 * The text goes in as base64 JSON, so nothing in a message can be read as
 * PowerShell.
 */
function windowsPopupScript({ title, body, seconds = 12, tone = 'plain' }) {
  const data = Buffer.from(JSON.stringify({ title: String(title), body: String(body), seconds, tone }), 'utf8').toString('base64');
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$m = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
$accent = if ($m.tone -eq 'warn') { '#FFA061' } else { '#A48BFF' }
$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        WindowStyle='None' AllowsTransparency='True' Background='Transparent' Topmost='True'
        ShowInTaskbar='False' ShowActivated='False' SizeToContent='WidthAndHeight' ResizeMode='NoResize'
        FontFamily='Segoe UI' Opacity='0'>
  <Border Margin='16' CornerRadius='16' Background='#F2201A2B' BorderBrush='#33FFFFFF' BorderThickness='1' Padding='18,14,20,16' MaxWidth='420'>
    <Border.Effect><DropShadowEffect BlurRadius='24' ShadowDepth='4' Opacity='0.45'/></Border.Effect>
    <StackPanel>
      <StackPanel Orientation='Horizontal' Margin='0,0,0,6'>
        <Ellipse Width='9' Height='9' Fill='$accent' VerticalAlignment='Center' Margin='0,1,8,0'/>
        <TextBlock Text='Reveille' Foreground='#9A8AB0' FontSize='12' FontWeight='SemiBold'/>
      </StackPanel>
      <TextBlock x:Name='Title' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' Foreground='#F6EDFF' FontSize='15' FontWeight='Bold' TextWrapping='Wrap'/>
      <TextBlock x:Name='Body' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' Foreground='#E2D8F2' FontSize='14' TextWrapping='Wrap' Margin='0,4,0,0'/>
    </StackPanel>
  </Border>
</Window>
"@
$w = [Windows.Markup.XamlReader]::Parse($xaml)
$w.FindName('Title').Text = $m.title
$w.FindName('Body').Text = $m.body
$w.Add_MouseLeftButtonUp({ $this.Close() })
$w.Add_Loaded({
  $area = [Windows.SystemParameters]::WorkArea
  $this.Left = $area.Right - $this.ActualWidth - 8
  $this.Top = $area.Bottom - $this.ActualHeight - 8
  $fade = New-Object Windows.Media.Animation.DoubleAnimation(0, 1, [TimeSpan]::FromMilliseconds(220))
  $this.BeginAnimation([Windows.Window]::OpacityProperty, $fade)
})
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds([double]$m.seconds)
$timer.Add_Tick({ $timer.Stop(); $w.Close() })
$timer.Start()
[void]$w.ShowDialog()
`;
}

function windowsPopup(options) {
  const encoded = Buffer.from(windowsPopupScript(options), 'utf16le').toString('base64');
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, detached: true, stdio: 'ignore' }
    );
    child.on('error', () => {});
    child.unref();
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Something someone at the PC must see. A window of Reveille's own on
 * Windows; elsewhere the desktop's notification, which on macOS and Linux is
 * not hidden the same way.
 *
 * @param {{ title: string, body: string, seconds?: number, tone?: 'plain'|'warn' }} options
 */
function popup(options) {
  if (PLATFORM === 'windows') return windowsPopup(options);
  return toast(options);
}

module.exports = { toast, popup, windowsPopupScript };

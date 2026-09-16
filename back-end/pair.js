/**
 * Shows the pairing code so the phone can scan it.
 *
 *   npm run pair
 *   npm run pair -- --open     also opens a larger code in the browser
 *
 * The agent normally runs hidden -- started by a Scheduled Task through a
 * windowless launcher -- so anything it prints goes nowhere. This is how you
 * actually see the code.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const QRCode = require('qrcode');

const { loadOrCreateConfig, getPrimaryNetworkInfo } = require('./src/config');
const { buildPairingPayload } = require('./src/pairing');

const APP_URL = 'https://github.com/Shamilimanuel/PCRemote/releases/latest';

// The QR is drawn with block characters, so a legacy code page turns it into
// unscannable rubbish. Harmless where it is already UTF-8, or not Windows.
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // Not fatal: the values below are still readable, and --open still works.
  }
}

// ---------------------------------------------------------------- styling --

// Windows consoles have understood these since Windows 10; if a terminal
// doesn't, it prints the codes harmlessly rather than breaking the layout.
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColour ? `[${code}m${s}[0m` : s);

const cyan = paint('38;5;81');
const dim = paint('38;5;244');
const white = paint('97');
const bold = paint('1');
const green = paint('38;5;114');
const amber = paint('38;5;215');

const W = 46;
const pad = '  ';

function rule(left, right, fill) {
  return dim(pad + left + fill.repeat(W) + right);
}

function boxLine(text, colour) {
  const visible = text.replace(/\[[0-9;]*m/g, '');
  const gap = Math.max(0, W - visible.length - 1);
  return dim(pad + '│') + ' ' + (colour ? colour(text) : text) + ' '.repeat(gap) + dim('│');
}

function header() {
  console.log('');
  console.log(rule('╭', '╮', '─'));
  console.log(boxLine('REVEILLE  ·  pair a phone', bold));
  console.log(rule('╰', '╯', '─'));
  console.log('');
}

function field(label, value, colour) {
  const l = dim(label.padEnd(14));
  console.log(pad + '  ' + l + (colour || white)(value));
}

function escape(value) {
  return String(value).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

// ------------------------------------------------------------------- page --

function buildPage(payload, adapters, svg) {
  const row = (label, value) =>
    `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`;

  const others = adapters.slice(1).map((a) =>
    `<li><b>${escape(a.interface)}</b> — ${escape(a.ip)} · ${escape(a.mac.toUpperCase())}</li>`
  ).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair Reveille with ${escape(payload.name)}</title>
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0F1115; color: #FFFFFF; padding: 32px 20px;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { width: 100%; max-width: 560px; text-align: center; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  .sub { color: #8A8F9C; margin: 0 0 28px; }
  .qr { background: #FFFFFF; border-radius: 20px; padding: 20px; display: inline-block; line-height: 0; }
  .qr svg { width: 300px; height: 300px; display: block; }
  table { width: 100%; margin: 30px 0 0; border-collapse: collapse; font-size: 14px; text-align: left; }
  th, td { padding: 10px 0; border-bottom: 1px solid #242938; vertical-align: top; }
  th { color: #8A8F9C; font-weight: 500; width: 130px; }
  td { font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
  .note { color: #5A5F6B; font-size: 13px; margin-top: 24px; }
  .warn { margin-top: 26px; padding: 14px 16px; border-radius: 12px;
          background: #2A2317; color: #E0A33E; font-size: 13.5px; text-align: left; }
  ul { text-align: left; color: #8A8F9C; font-size: 13.5px; padding-left: 20px; }
</style></head>
<body><main>
  <h1>Scan this with Reveille</h1>
  <p class="sub">Open the app, tap <b>+ Add PC</b>, then <b>Scan code</b>.</p>
  <div class="qr">${svg}</div>
  <table>
    ${row('Name', payload.name)}
    ${row('IP address', payload.ip)}
    ${row('Port', payload.port)}
    ${row('Token', payload.token)}
    ${row('MAC address', payload.mac)}
  </table>
  ${others ? `<p class="note" style="text-align:left;margin-bottom:6px">Other adapters on this PC:</p><ul>${others}</ul>` : ''}
  <p class="sub" style="margin-top:22px">
    No Android phone? Open <b>http://${escape(payload.ip)}:${escape(payload.port)}</b> in any
    browser instead — same buttons, nothing to install.
  </p>
  <div class="warn">
    That token is the password to this PC. Anyone on your network who has it can
    shut the machine down. Don't photograph this page for someone else, and close
    the tab when you're done.
  </div>
  <p class="note">
    Your phone must be on the same Wi-Fi as this PC. Generated ${escape(new Date().toLocaleString())}.
  </p>
</main></body></html>`;
}

// ------------------------------------------------------------------- main --

async function main() {
  const config = loadOrCreateConfig();
  const payload = buildPairingPayload(config);
  const adapters = getPrimaryNetworkInfo();

  header();

  if (!payload.ip) {
    console.log(pad + amber('No network address found.'));
    console.log(pad + dim('Connect Wi-Fi or Ethernet and run this again.'));
    console.log('');
    process.exit(1);
  }

  const data = JSON.stringify(payload);

  // Half-block characters pack two rows into one line, which keeps the code
  // square-ish in a terminal where characters are taller than they are wide.
  const terminalQr = await QRCode.toString(data, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
  });
  console.log(terminalQr.replace(/^/gm, pad));

  console.log(pad + white('Scan that with Reveille:') + dim('  + Add PC  ›  Scan code'));
  console.log('');
  console.log(rule('├', '┤', '─'));
  console.log('');
  console.log(pad + dim('Or type these in by hand — they match the app’s boxes:'));
  console.log('');

  field('Name', payload.name);
  field('IP address', payload.ip);
  field('Port', String(payload.port));
  field('Token', payload.token);
  field('MAC address', payload.mac);

  if (adapters.length > 1) {
    console.log('');
    console.log(pad + dim('  This PC has other adapters. Use the one above unless it fails:'));
    for (const a of adapters.slice(1)) {
      console.log(pad + dim('    ' + a.interface.padEnd(14) + a.ip.padEnd(16) + a.mac.toUpperCase()));
    }
  }

  console.log('');
  console.log(pad + amber('  ⚠  That token is the password to this PC. Don’t share it.'));
  console.log('');
  console.log(rule('├', '┤', '─'));
  console.log('');
  field('Get the app', APP_URL, green);
  field('Or a browser', `http://${payload.ip}:${payload.port}`, green);

  const svg = await QRCode.toString(data, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const file = path.join(os.tmpdir(), 'reveille-pairing.html');
  fs.writeFileSync(file, buildPage(payload, adapters, svg), 'utf8');

  const wantsBrowser = process.argv.includes('--open');
  if (wantsBrowser) {
    field('Bigger code', 'opening in your browser…', dim);
    // The empty title argument is required, or `start` treats the path as one.
    exec(`start "" "${file}"`, (err) => {
      if (err) console.log(pad + '  ' + dim(file));
    });
  } else {
    field('Bigger code', 'npm run pair -- --open', dim);
  }

  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error(pad + amber('Could not build the pairing code:'));
  console.error(pad + '  ' + err.message);
  console.error('');
  process.exit(1);
});

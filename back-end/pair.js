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
const { buildPairingPayload, buildCompactPayload } = require('./src/pairing');
const qrterm = require('./src/qrterm');

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

/*
    Dusk, from THEMES in front-end/src/theme/clay.ts, so the screen you pair
    from and the app you pair with are the same object.

    Everything is 24-bit colour. Windows consoles have understood that since
    Windows 10, and where a terminal does not, useColour is false and the whole
    screen falls back to plain text -- which still has every value on it.
*/
const DUSK      = [0x5d, 0x8b, 0xff];
const DUSK_PALE = [0xb9, 0xcc, 0xff];
const INK       = [0xe8, 0xec, 0xf7];
const INK2      = [0x98, 0xa2, 0xba];
const INK3      = [0x64, 0x6e, 0x88];
const MOSS      = [0x4f, 0xd6, 0x9a];
const AMBER     = [0xe8, 0xb1, 0x5c];

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;

const ESC = '';
const RESET = `${ESC}[0m`;

function rgb([r, g, b]) {
  return `${ESC}[38;2;${r};${g};${b}m`;
}

const tint = (colour) => (text) => (useColour ? rgb(colour) + text + RESET : text);

const dusk = tint(DUSK);
const ink = tint(INK);
const dim = tint(INK2);
const faint = tint(INK3);
const moss = tint(MOSS);
const amber = tint(AMBER);
const bold = (text) => (useColour ? `${ESC}[1m${text}${RESET}` : text);

/** Visible width, ignoring anything the terminal will not print. */
function visible(text) {
  return text.replace(new RegExp(`${ESC}\[[0-9;]*m`, 'g'), '').length;
}

/**
 * Fades one colour into another across a string.
 *
 * The wordmark is the one place worth spending a flourish: it is the first
 * thing on screen, it takes the same blues as the code below it, and it costs
 * a few bytes of escape codes rather than a line of height.
 */
function gradient(text, from, to) {
  if (!useColour) return text;
  const letters = [...text];
  const last = Math.max(1, letters.length - 1);
  return letters
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const t = i / last;
      const mix = from.map((v, k) => Math.round(v + (to[k] - v) * t));
      return rgb(mix) + ch;
    })
    .join('') + RESET;
}

// Wide enough for the QR, which is 45 columns, with a margin either side.
const W = 49;
const pad = '  ';

/** A rule with its label sitting in it, so a divider says what it divides. */
function rule(label) {
  // W is the card's inner width; a rule spans the card's full extent, which is
  // two columns wider because of the borders either side.
  const span = W + 2;
  if (!label) return faint(pad + '─'.repeat(span));
  const text = ` ${label} `;
  return faint(pad + '──' + text + '─'.repeat(Math.max(0, span - text.length - 2)));
}

function header(name) {
  const mark = gradient('R E V E I L L E', DUSK, DUSK_PALE);
  const right = 'pair a phone';

  console.log('');
  console.log(faint(pad + '╭' + '─'.repeat(W) + '╮'));

  const gap = Math.max(1, W - visible(mark) - right.length - 2);
  console.log(
    faint(pad + '│') + ' ' + bold(mark) + ' '.repeat(gap) + faint(right) + ' ' + faint('│')
  );

  const sub = name ? `pairing ${name}` : 'pairing this computer';
  console.log(faint(pad + '│') + ' ' + dim(sub) + ' '.repeat(Math.max(1, W - sub.length - 1)) + faint('│'));
  console.log(faint(pad + '╰' + '─'.repeat(W) + '╯'));
  console.log('');
}

function field(label, value, colour) {
  console.log(pad + '  ' + faint(label.padEnd(14)) + (colour || ink)(value));
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

  header(payload.name);

  if (!payload.ip) {
    console.log(pad + amber('  No network address found.'));
    console.log(pad + faint('  Connect Wi-Fi or Ethernet and run this again.'));
    console.log('');
    process.exit(1);
  }

  // The compact form rather than JSON: a third fewer modules for exactly the
  // same five values. See buildCompactPayload in src/pairing.js.
  const data = buildCompactPayload(config);
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });

  // Centred under the card above it. The code's own pale field is the only
  // frame it gets -- a box drawn around it would be one more line and one more
  // thing to align.
  const inset = pad + ' '.repeat(Math.max(0, Math.floor((W - qrterm.widthOf(qr)) / 2)) + 1);
  console.log(qrterm.render(qr, { colour: useColour, indent: inset }));
  console.log('');

  console.log(pad + '  ' + bold(ink('Scan it')) + faint('   Reveille  ›  + Add PC  ›  Scan code'));
  console.log('');

  console.log(rule('or type it in'));
  console.log('');

  field('Name', payload.name);
  field('Address', payload.ip);
  field('Port', String(payload.port));
  field('Token', payload.token);
  field('MAC', payload.mac);

  if (adapters.length > 1) {
    console.log('');
    console.log(pad + '  ' + faint('This PC has other adapters. Use the one above unless it fails:'));
    for (const a of adapters.slice(1)) {
      console.log(pad + '    ' + faint(a.interface.padEnd(14) + a.ip.padEnd(16) + a.mac.toUpperCase()));
    }
  }

  console.log('');
  console.log(pad + '  ' + amber('⚠  That token is the password to this PC. Don’t share it.'));
  console.log('');

  console.log(rule('also'));
  console.log('');

  field('Get the app', APP_URL, moss);
  field('In a browser', `http://${payload.ip}:${payload.port}`, moss);

  const svg = await QRCode.toString(data, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const file = path.join(os.tmpdir(), 'reveille-pairing.html');
  fs.writeFileSync(file, buildPage(payload, adapters, svg), 'utf8');

  const wantsBrowser = process.argv.includes('--open');
  if (wantsBrowser) {
    field('Bigger code', 'opening in your browser…', faint);
    // The empty title argument is required, or `start` treats the path as one.
    exec(`start "" "${file}"`, (err) => {
      if (err) console.log(pad + '  ' + dim(file));
    });
  } else {
    field('Bigger code', 'node pair.js --open', faint);
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

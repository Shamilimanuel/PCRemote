/**
 * Shows the pairing code so the phone can scan it.
 *
 *   npm run pair
 *
 * The agent itself normally runs hidden -- it is started by a Scheduled Task
 * through a windowless launcher -- so anything it prints goes nowhere. This
 * script exists to put the code somewhere you can actually point a camera at:
 * a page in your browser, large and high-contrast, which scans far more
 * reliably than a QR drawn in a console window.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const QRCode = require('qrcode');

const { loadOrCreateConfig, getPrimaryNetworkInfo } = require('./src/config');
const { buildPairingPayload } = require('./src/pairing');

const config = loadOrCreateConfig();
const payload = buildPairingPayload(config);
const adapters = getPrimaryNetworkInfo();

function escape(value) {
  return String(value).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function row(label, value) {
  return `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`;
}

async function main() {
  if (!payload.ip) {
    console.error('No network address found. Connect Wi-Fi or Ethernet and try again.');
    process.exit(1);
  }

  // Medium correction: enough to survive a bit of glare, without the density
  // that makes a phone struggle.
  const svg = await QRCode.toString(JSON.stringify(payload), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });

  const others = adapters.slice(1).map((a) =>
    `<li><b>${escape(a.interface)}</b> — ${escape(a.ip)} · ${escape(a.mac.toUpperCase())}</li>`
  ).join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair Reveille with ${escape(payload.name)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: grid; place-items: center;
    background: #0F1115; color: #FFFFFF;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 32px 20px;
  }
  main { width: 100%; max-width: 560px; text-align: center; }
  h1 { font-size: 26px; margin: 0 0 6px; font-weight: 700; }
  .sub { color: #8A8F9C; margin: 0 0 28px; }
  .qr {
    background: #FFFFFF; border-radius: 20px; padding: 20px;
    display: inline-block; line-height: 0;
  }
  .qr svg { width: 300px; height: 300px; display: block; }
  table {
    width: 100%; margin: 30px 0 0; border-collapse: collapse;
    font-size: 14px; text-align: left;
  }
  th, td { padding: 10px 0; border-bottom: 1px solid #242938; vertical-align: top; }
  th { color: #8A8F9C; font-weight: 500; width: 130px; }
  td { font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
  .note { color: #5A5F6B; font-size: 13px; margin-top: 24px; }
  .warn {
    margin-top: 26px; padding: 14px 16px; border-radius: 12px;
    background: #2A2317; color: #E0A33E; font-size: 13.5px; text-align: left;
  }
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

  <div class="warn">
    That token is the password to this PC. Anyone on your network who has it can
    shut the machine down. Don't photograph this page for someone else, and close
    the tab when you're done.
  </div>

  <p class="note">
    Your phone must be on the same Wi-Fi as this PC. Generated ${escape(new Date().toLocaleString())}.
  </p>
</main></body></html>`;

  const file = path.join(os.tmpdir(), `reveille-pair-${Date.now()}.html`);
  fs.writeFileSync(file, html, 'utf8');

  console.log('');
  console.log('  Pairing page opened in your browser.');
  console.log('  Open Reveille on your phone, tap "+ Add PC", then "Scan code".');
  console.log('');
  console.log(`  Name  : ${payload.name}`);
  console.log(`  IP    : ${payload.ip}:${payload.port}`);
  console.log(`  Token : ${payload.token}`);
  console.log(`  MAC   : ${payload.mac}`);
  console.log('');

  // `start` needs an empty title argument first, or it eats the path.
  exec(`start "" "${file}"`, (err) => {
    if (err) console.log(`  Couldn't open the browser. Open this file yourself:\n  ${file}`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

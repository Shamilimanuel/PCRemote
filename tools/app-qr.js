/**
 * The "Get the app" QR code that setup.ps1 draws in its window.
 *
 *   node tools/app-qr.js           prints the rows to paste into setup.ps1
 *   node tools/app-qr.js --check   fails if setup.ps1's copy is not the code
 *                                  for APP_URL
 *
 * The window has no QR encoder of its own, and on a first install there is no
 * agent yet to ask for one -- the app has to be on the phone before anything
 * is installed. The download link never changes, so its code is worked out
 * here once and kept in setup.ps1 as plain rows of 0 and 1. --check is what
 * stops that copy and the link quietly drifting apart.
 */

const fs = require('fs');
const path = require('path');
const QRCode = require(path.join(__dirname, '..', 'back-end', 'node_modules', 'qrcode'));

const APP_URL = 'https://github.com/Shamilimanuel/PCRemote/releases/latest/download/reveille.apk';
const SETUP = path.join(__dirname, '..', 'setup.ps1');

function rows() {
  const qr = QRCode.create(APP_URL, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const out = [];
  for (let r = 0; r < n; r++) {
    let row = '';
    for (let c = 0; c < n; c++) row += qr.modules.data[r * n + c] ? '1' : '0';
    out.push(row);
  }
  return out;
}

function block(list) {
  return '$script:RvAppQr = @(\r\n' + list.map((r) => `    '${r}'`).join('\r\n') + '\r\n)';
}

if (process.argv.includes('--check')) {
  const text = fs.readFileSync(SETUP, 'utf8');
  const match = text.match(/\$script:RvAppQr = @\(\r?\n([\s\S]*?)\r?\n\)/);
  if (!match) {
    console.error('setup.ps1 has no $script:RvAppQr block.');
    process.exit(1);
  }
  const have = [...match[1].matchAll(/'([01]+)'/g)].map((m) => m[1]);
  const want = rows();
  if (have.join('\n') !== want.join('\n')) {
    console.error(`setup.ps1's app code does not match ${APP_URL}.`);
    console.error('Run: node tools/app-qr.js, and paste the result over the old block.');
    process.exit(1);
  }
  console.log(`ok: setup.ps1's app code is ${APP_URL} (${want.length}x${want.length})`);
} else {
  console.log(block(rows()));
}

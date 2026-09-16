const os = require('os');
const qrcode = require('qrcode-terminal');
const { loadOrCreateConfig, getPrimaryNetworkInfo } = require('./config');
const { createServer } = require('./server');

const config = loadOrCreateConfig();
const netInfo = getPrimaryNetworkInfo();
const app = createServer(config);

app.listen(config.port, '0.0.0.0', () => {
  const hostname = os.hostname();

  console.log('');
  console.log('=========================================');
  console.log(' Reveille agent is running');
  console.log('=========================================');
  console.log(`  Device name : ${hostname}`);
  console.log(`  Port        : ${config.port}`);
  console.log(`  Token       : ${config.token}`);
  console.log('');

  if (netInfo.length === 0) {
    console.log('  Could not detect a LAN IPv4 address. Make sure Wi-Fi/Ethernet is connected.');
  } else {
    console.log('  Enter these details in the mobile app (pick the interface you use for Wi-Fi):');
    for (const info of netInfo) {
      console.log(`   - [${info.interface}] IP: ${info.ip}   MAC: ${info.mac}`);
    }
  }

  console.log('');
  console.log('  Pairing QR (encodes name/ip/port/token/mac as JSON):');
  const primary = netInfo[0];
  const pairingPayload = JSON.stringify({
    name: hostname,
    ip: primary ? primary.ip : null,
    port: config.port,
    token: config.token,
    mac: primary ? primary.mac : null,
  });
  qrcode.generate(pairingPayload, { small: true });
  console.log('  (QR scanning is not wired up in the app yet -- for now, type the values in by hand.)');
  console.log('=========================================');
  console.log('');
});

const os = require('os');
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
    console.log('  Best guess first:');
    for (const info of netInfo) {
      console.log(`   - [${info.interface}] IP: ${info.ip}   MAC: ${info.mac.toUpperCase()}`);
    }
  }

  console.log('');
  console.log('  To pair a phone, run:  npm run pair');
  console.log('  (that opens a code you can scan. This window is hidden when the');
  console.log('   agent starts automatically, so its output never reaches you.)');
  console.log('=========================================');
  console.log('');
});

// A crash inside the listen callback used to take the agent down silently,
// because nothing is watching its output once it runs as a Scheduled Task.
process.on('uncaughtException', (err) => {
  console.error('Reveille agent crashed:', err);
  process.exit(1);
});

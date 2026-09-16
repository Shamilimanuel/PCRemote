const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DEFAULT_PORT = 5533;

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function loadOrCreateConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    if (!config.token) {
      config.token = generateToken();
      saveConfig(config);
    }
    return config;
  }

  const config = {
    port: DEFAULT_PORT,
    token: generateToken(),
  };
  saveConfig(config);
  return config;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/** The address a Wake-on-LAN packet should be directed at for this interface. */
function broadcastAddress(ip, netmask) {
  const ipParts = ip.split('.').map(Number);
  const maskParts = (netmask || '').split('.').map(Number);
  if (ipParts.length !== 4 || maskParts.length !== 4 || maskParts.some(Number.isNaN)) {
    return null;
  }
  return ipParts.map((part, i) => part | (~maskParts[i] & 255)).join('.');
}

function getPrimaryNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push({
          interface: name,
          ip: addr.address,
          mac: addr.mac,
          netmask: addr.netmask,
          broadcast: broadcastAddress(addr.address, addr.netmask),
        });
      }
    }
  }

  return candidates;
}

module.exports = {
  CONFIG_PATH,
  broadcastAddress,
  loadOrCreateConfig,
  saveConfig,
  generateToken,
  getPrimaryNetworkInfo,
};

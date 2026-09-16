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
    // Strip a byte-order mark: Notepad and PowerShell's Set-Content both add
    // one, and JSON.parse treats it as a syntax error rather than ignoring it.
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
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

// Adapters that exist but aren't the one the phone will reach us on. Virtual
// machine bridges in particular hand out addresses that look perfectly valid
// and go nowhere, and they often sort first.
const VIRTUAL_ADAPTER = /virtual|vmware|vbox|hyper-?v|loopback|bluetooth|docker|wsl|tailscale|zerotier|tap-|tun\d/i;

function rank(entry) {
  let score = 0;
  if (VIRTUAL_ADAPTER.test(entry.interface)) score -= 100;
  if (entry.ip.startsWith('192.168.56.')) score -= 50;   // VirtualBox host-only default
  if (entry.ip.startsWith('169.254.')) score -= 80;      // link-local: DHCP never answered
  if (/^(ethernet|eth)/i.test(entry.interface)) score += 10;
  if (/wi-?fi|wlan/i.test(entry.interface)) score += 8;
  return score;
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

  // Best guess first, so callers that just take [0] get the right adapter.
  return candidates
    .map((entry, index) => ({ entry, index, score: rank(entry) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.entry);
}

module.exports = {
  CONFIG_PATH,
  broadcastAddress,
  VIRTUAL_ADAPTER,
  loadOrCreateConfig,
  saveConfig,
  generateToken,
  getPrimaryNetworkInfo,
};

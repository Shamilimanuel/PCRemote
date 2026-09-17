/**
 * Refusing requests from off the local network.
 *
 * The agent binds 0.0.0.0, which is right -- it has to answer your phone on
 * whatever interface that arrives by, and it cannot know in advance which. But
 * it means the one mistake that turns this from a LAN tool into a remote
 * shutdown service for the entire internet is a single port-forward rule in a
 * router, added by someone who wanted to reach their PC from work.
 *
 * So the address is checked as well as the signature. Someone who does that
 * now gets a refusal instead of a working exploit.
 *
 * Tailscale's range is allowed on purpose: the app's "remote address" option
 * exists precisely so shutdown and lock work away from home over a private
 * network, and that traffic arrives from 100.64.0.0/10. Leaving it out would
 * have silently broken a feature that already exists.
 */

const PRIVATE_V4 = [
  // [first octet match, test]
  { label: 'loopback', test: (o) => o[0] === 127 },
  { label: 'private 10/8', test: (o) => o[0] === 10 },
  { label: 'private 172.16/12', test: (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31 },
  { label: 'private 192.168/16', test: (o) => o[0] === 192 && o[1] === 168 },
  { label: 'link-local 169.254/16', test: (o) => o[0] === 169 && o[1] === 254 },
  // Tailscale and other CGNAT-range overlays.
  { label: 'CGNAT 100.64/10', test: (o) => o[0] === 100 && o[1] >= 64 && o[1] <= 127 },
];

/**
 * Node reports IPv4 peers on a dual-stack socket as "::ffff:192.168.1.5", and
 * Express may hand over a comma-separated list if anything set X-Forwarded-For.
 * Only the socket's own view is trustworthy, so take the first entry and strip
 * the mapping prefix.
 */
function normalize(address) {
  if (typeof address !== 'string' || !address) return null;
  let value = address.split(',')[0].trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  // Strip a zone index, as in fe80::1%eth0.
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  return value || null;
}

function v4Octets(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (octets.some((n) => Number.isNaN(n) || n > 255)) return null;
  return octets;
}

/** Whether this peer is somewhere on a local or private network. */
function isLocalAddress(address) {
  const value = normalize(address);
  if (!value) return false;

  const octets = v4Octets(value);
  if (octets) return PRIVATE_V4.some((range) => range.test(octets));

  // IPv6
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fe80:')) return true;                  // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;           // unique local, fc00::/7
  return false;
}

/** The human-readable reason, for the log line the refusal writes. */
function describe(address) {
  const value = normalize(address);
  if (!value) return 'an unknown address';
  return value;
}

module.exports = { isLocalAddress, normalize, describe };

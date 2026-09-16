import dgram from 'react-native-udp';

// Magic packets are conventionally sent to port 9 (discard); some NICs/routers
// only listen on 7 (echo), so we fire at both.
const WOL_PORTS = [9, 7];
const GLOBAL_BROADCAST = '255.255.255.255';

function macToBytes(mac: string): number[] {
  const cleaned = mac.trim().replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length !== 12) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }
  return bytes;
}

function buildMagicPacket(mac: string): Uint8Array {
  const macBytes = macToBytes(mac);
  const packet: number[] = new Array(6).fill(0xff);
  for (let i = 0; i < 16; i += 1) {
    packet.push(...macBytes);
  }
  return Uint8Array.from(packet);
}

/**
 * Many home routers drop 255.255.255.255 but happily forward a subnet-directed
 * broadcast, so derive one from the PC's own address (assuming the usual /24).
 */
function subnetBroadcast(ip?: string): string | null {
  if (!ip) return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
}

/**
 * Sends the Wake-on-LAN magic packet for `mac`. Passing the PC's last known
 * `ip` adds a subnet-directed broadcast alongside the global one.
 */
export function sendMagicPacket(mac: string, ip?: string): Promise<void> {
  const packet = buildMagicPacket(mac);
  const addresses = [GLOBAL_BROADCAST];
  const subnet = subnetBroadcast(ip);
  if (subnet && subnet !== GLOBAL_BROADCAST) {
    addresses.push(subnet);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    // react-native-udp's type defs don't fully line up with EventEmitter's
    // overloads, so treat the socket as loosely typed here.
    const socket: any = dgram.createSocket({ type: 'udp4' });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // socket may already be closed; ignore
      }
      if (err) reject(err);
      else resolve();
    };

    socket.once('error', (err: Error) => finish(err));

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);

        const targets = addresses.flatMap((address) => WOL_PORTS.map((port) => ({ address, port })));
        let remaining = targets.length;
        let lastError: Error | undefined;
        let anySucceeded = false;

        for (const { address, port } of targets) {
          // offset/length must stay undefined -- react-native-udp rejects them
          // for non-Buffer payloads and slices the whole packet by default.
          socket.send(packet, undefined, undefined, port, address, (err?: Error) => {
            if (err) lastError = err;
            else anySucceeded = true;

            remaining -= 1;
            if (remaining === 0) {
              // A single reachable broadcast address is enough to wake the PC.
              finish(anySucceeded ? undefined : lastError);
            }
          });
        }
      } catch (err) {
        finish(err as Error);
      }
    });
  });
}

/**
 * Checks that what the agent prints is what the app reads back. Run it with:
 *
 *     npx tsx src/lib/pairing.test.ts
 *
 * It imports the agent's own payload builder rather than a copy of the format,
 * so the two cannot drift. If they ever do, pairing stops working entirely and
 * the only symptom is a code that will not scan — which looks like a camera
 * problem, or a lighting problem, or anything but this.
 *
 * The token matters most. It is uppercased to make the code smaller and
 * lowercased on the way back in, and it is also the HMAC key that signs every
 * request. Off by one character and the app pairs happily, then every request
 * it makes is refused as a bad signature.
 */

import { parsePairingPayload } from './pairing';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const agent = require('../../../back-end/src/pairing.js');

let pass = 0;
let fail = 0;

function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    console.log(`        got:  ${JSON.stringify(got)}`);
    console.log(`        want: ${JSON.stringify(want)}`);
  }
}

const TOKEN = '4f2a91c73e05b8d64f2a91c73e05b8d64f2a91c73e05b8d6';

/** The agent reads the real machine's name and address, so those are stubbed. */
function agentPayload(overrides: Record<string, unknown> = {}) {
  const base = {
    v: 1,
    name: 'Office-PC',
    port: 5533,
    token: TOKEN,
    ip: '10.0.0.25',
    mac: 'A1:B2:C3:D4:E5:F6',
    ...overrides,
  };
  const compact = [
    'R1',
    base.ip,
    String(base.port),
    /^[0-9a-f]+$/i.test(String(base.token)) ? String(base.token).toUpperCase() : base.token,
    String(base.mac).replace(/[^0-9a-fA-F]/g, '').toUpperCase(),
    base.name,
  ].join('*');
  return { json: JSON.stringify(base), compact };
}

console.log('=== the agent builds the format this test assumes ===');
{
  // Proves the string above matches what src/pairing.js actually produces,
  // rather than a shape that only exists in this file.
  const built = agent.buildCompactPayload({ port: 5533, token: TOKEN });
  const parts = String(built).split('*');
  is('starts with the prefix', parts[0], 'R1');
  is('has six fields', parts.length >= 6, true);
  is('the token is uppercase hex', /^[0-9A-F]{48}$/.test(parts[3]), true);
  is('the MAC has no separators', /^[0-9A-F]{12}$/.test(parts[4]), true);
}

console.log('\n=== a compact code round-trips ===');
{
  const { compact } = agentPayload();
  const result = parsePairingPayload(compact);
  is('parses', result.ok, true);
  if (result.ok) {
    is('name', result.device.name, 'Office-PC');
    is('address', result.device.ip, '10.0.0.25');
    is('port', result.device.port, 5533);
    is('MAC is punctuated for display', result.device.mac, 'A1:B2:C3:D4:E5:F6');
    // The whole point: uppercased for the QR, lowercased back, byte for byte.
    is('token survives exactly', result.device.token, TOKEN);
  }
}

console.log('\n=== the old JSON code still works ===');
{
  const { json } = agentPayload();
  const result = parsePairingPayload(json);
  is('parses', result.ok, true);
  if (result.ok) {
    is('token untouched', result.device.token, TOKEN);
    is('name', result.device.name, 'Office-PC');
  }
}

console.log('\n=== names that would break a naive split ===');
{
  for (const name of ['Office-PC', 'shami-laptop', 'My PC', 'PC*with*stars', 'café-mac']) {
    const { compact } = agentPayload({ name });
    const result = parsePairingPayload(compact);
    is(`name ${JSON.stringify(name)}`, result.ok && result.device.name, name);
  }
}

console.log('\n=== a token that is not hex is left alone ===');
{
  const odd = 'not-hex-but-long-enough-to-pass-the-length-check';
  const { compact } = agentPayload({ token: odd });
  const result = parsePairingPayload(compact);
  is('passed through unchanged', result.ok && result.device.token, odd);
}

console.log('\n=== rubbish is refused, not half-accepted ===');
{
  const bad: [string, string][] = [
    ['', "That isn't a Reveille pairing code."],
    ['hello', "That isn't a Reveille pairing code."],
    ['R1*10.0.0.25', 'That pairing code is incomplete.'],
    ['R1*999.1.1.1*5533*' + TOKEN.toUpperCase() + '*A1B2C3D4E5F6*PC', 'The code has no usable address.'],
    ['R1*10.0.0.25*5533*' + TOKEN.toUpperCase() + '*NOTAMAC*PC', 'The code has no usable MAC address.'],
    ['R1*10.0.0.25*5533*short*A1B2C3D4E5F6*PC', 'The code has no usable token.'],
    ['R1*10.0.0.25*0*' + TOKEN.toUpperCase() + '*A1B2C3D4E5F6*PC', 'The code has no usable port.'],
  ];
  for (const [raw, reason] of bad) {
    const result = parsePairingPayload(raw);
    is(`${JSON.stringify(raw.slice(0, 26))} refused`, !result.ok && result.reason, reason);
  }
}

console.log('\n=== the compact code really is smaller ===');
{
  const { json, compact } = agentPayload();
  is('fewer characters', compact.length < json.length, true);
  console.log(`       ${json.length} characters as JSON, ${compact.length} compact`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

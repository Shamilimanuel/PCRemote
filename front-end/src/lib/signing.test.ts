/**
 * Checks that the phone and the agent sign identically. Run it with:
 *
 *     npx tsx src/lib/signing.test.ts
 *
 * This one matters more than most. The two implementations are in different
 * languages, in different halves of the project, and nothing makes them agree
 * except care -- so if they ever drift, every request starts failing at once,
 * on every device, with an error that says only "Unauthorized". This file is
 * what catches that before it ships rather than afterwards.
 *
 * It deliberately reaches across into back-end/ to import the agent's real
 * module. Testing the phone's signing against a copy of the rules would prove
 * nothing at all.
 */

import * as phone from './signing';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const agent = require('../../../back-end/src/signing.js');

let pass = 0;
let fail = 0;

function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    console.log(`        got:  ${String(got)}`);
    console.log(`        want: ${String(want)}`);
  }
}

const SECRET = 'a3f1c09d4b7e2815a3f1c09d4b7e2815a3f1c09d4b7e2815';

const cases = [
  { method: 'GET', path: '/health', body: '', timestamp: 1758000000, nonce: 'deadbeef00000001' },
  { method: 'POST', path: '/action', body: '{"action":"shutdown"}', timestamp: 1758000001, nonce: 'deadbeef00000002' },
  { method: 'POST', path: '/action', body: '{"action":"restart","delaySeconds":300}', timestamp: 1758000002, nonce: 'deadbeef00000003' },
  { method: 'post', path: '/cancel', body: '', timestamp: 1758000003, nonce: 'deadbeef00000004' },
  { method: 'GET', path: '/health?x=1&y=2', body: '', timestamp: 1758000004, nonce: 'deadbeef00000005' },
  // Characters that would break a careless concatenation.
  { method: 'POST', path: '/action', body: '{"name":"café über"}', timestamp: 1758000005, nonce: 'deadbeef00000006' },
  { method: 'POST', path: '/action', body: '{"n":"line\nbreak"}', timestamp: 1758000006, nonce: 'deadbeef00000007' },
  { method: 'POST', path: '/action', body: '{"n":"quote\\"inside"}', timestamp: 1758000007, nonce: 'deadbeef00000008' },
];

console.log('=== the canonical string is identical on both sides ===');
for (const c of cases) {
  is(`${c.method} ${c.path}`, phone.canonicalRequest(c), agent.canonicalRequest(c));
}

console.log('\n=== the signature is identical on both sides ===');
for (const c of cases) {
  is(`${c.method} ${c.path}`, phone.signRequestValue(SECRET, c), agent.signRequestValue(SECRET, c));
}

console.log('\n=== the reply signature is identical on both sides ===');
for (const body of ['', '{"status":"ok"}', '{"hostname":"café-pc"}']) {
  is(
    `body ${JSON.stringify(body).slice(0, 26)}`,
    phone.canonicalResponse({ nonce: 'abc123', body }),
    agent.canonicalResponse({ nonce: 'abc123', body })
  );
}

console.log('\n=== a header the phone builds, checked by the agent ===');
{
  const nonces = agent.createNonceCache();
  const signed = phone.signRequest(SECRET, 'POST', '/action', '{"action":"lock"}');
  const base = { secret: SECRET, method: 'POST', path: '/action', body: '{"action":"lock"}' };

  is('accepted', agent.verifyRequest({ ...base, header: signed.authorization, nonces }).ok, true);
  is(
    'the same header a second time is refused',
    agent.verifyRequest({ ...base, header: signed.authorization, nonces }).reason,
    'replay'
  );
  is(
    'lock swapped for shutdown is refused',
    agent.verifyRequest({ ...base, body: '{"action":"shutdown"}', header: signed.authorization, nonces: agent.createNonceCache() }).reason,
    'signature'
  );
  is(
    'a different path is refused',
    agent.verifyRequest({ ...base, path: '/cancel', header: signed.authorization, nonces: agent.createNonceCache() }).reason,
    'signature'
  );
  is(
    'a different method is refused',
    agent.verifyRequest({ ...base, method: 'GET', header: signed.authorization, nonces: agent.createNonceCache() }).reason,
    'signature'
  );
  is(
    'a different token is refused',
    agent.verifyRequest({ ...base, secret: 'b'.repeat(48), header: signed.authorization, nonces: agent.createNonceCache() }).reason,
    'signature'
  );
}

/**
 * If a bad signature could consume a nonce, anyone on the network could replay
 * captured headers with the wrong secret and lock the real phone out of its own
 * PC. The signature is therefore checked before the nonce is claimed.
 */
console.log('\n=== a wrong secret must not burn a nonce ===');
{
  const nonces = agent.createNonceCache();
  const signed = phone.signRequest(SECRET, 'GET', '/health', '');
  const base = { method: 'GET', path: '/health', body: '', header: signed.authorization, nonces };
  agent.verifyRequest({ ...base, secret: 'b'.repeat(48) });
  is('the real request still works afterwards', agent.verifyRequest({ ...base, secret: SECRET }).ok, true);
}

console.log('\n=== the agent signs its reply, the phone checks it ===');
{
  const body = '{"status":"ok","hostname":"desktop"}';
  const sig = agent.signResponse(SECRET, { nonce: 'abc123', body });
  is('a real reply is accepted', phone.verifyResponse(SECRET, 'abc123', body, sig).ok, true);
  is('a reply for another request is rejected', phone.verifyResponse(SECRET, 'other1', body, sig).ok, false);
  is('an altered reply is rejected', phone.verifyResponse(SECRET, 'abc123', `${body} `, sig).ok, false);

  const legacy = phone.verifyResponse(SECRET, 'abc123', body, null);
  is('an older agent that does not sign still works', legacy.ok, true);
  is('  ...and is reported as unsigned', legacy.signed, false);
}

console.log('\n=== clock skew ===');
{
  const now = 1758000000;
  const header = (t: number) =>
    `Reveille ${t}.aaaaaaaa.${phone.signRequestValue(SECRET, {
      method: 'GET', path: '/health', body: '', timestamp: t, nonce: 'aaaaaaaa',
    })}`;

  const skews: [string, number, boolean][] = [
    ['exactly now', now, true],
    ['29s early', now - 29, true],
    ['31s early', now - 31, false],
    ['29s late', now + 29, true],
    ['31s late', now + 31, false],
    ['an hour old', now - 3600, false],
  ];
  for (const [label, t, want] of skews) {
    const r = agent.verifyRequest({
      header: header(t), secret: SECRET, method: 'GET', path: '/health', body: '',
      nonces: agent.createNonceCache(), nowSeconds: now,
    });
    is(`${label} -> ${want ? 'accepted' : 'refused'}`, r.ok, want);
  }
}

console.log('\n=== headers that are not the right shape ===');
{
  const bad = [
    null, '', 'Bearer abc', 'Reveille', 'Reveille x.y.z', 'Reveille 1.2',
    `Reveille 1758000000.ZZ.${'f'.repeat(64)}`,
    'Reveille 1758000000.aaaaaaaa.short',
    `reveille 1758000000.aaaaaaaa.${'f'.repeat(64)}`,
  ];
  for (const header of bad) {
    const r = agent.verifyRequest({
      header, secret: SECRET, method: 'GET', path: '/health', body: '',
      nonces: agent.createNonceCache(),
    });
    is(`${JSON.stringify(header)} -> malformed`, r.reason, 'malformed');
  }
}

console.log('\n=== the nonce cache cannot be grown without bound ===');
{
  let clock = 0;
  const nonces = agent.createNonceCache(() => clock);
  for (let i = 0; i < 500; i++) {
    clock += 1000;
    nonces.claim(`n${i}`);
  }
  const ok = nonces.size < 100;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} 500 nonces across 500s -> ${nonces.size} kept`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

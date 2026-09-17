/*
   Checks the browser version's hand-rolled SHA-256 and HMAC against Node's.
   Run it with:

       node tools/check-websign.js

   back-end/web/sign.js exists because the agent serves over plain http:// to a
   LAN address, which browsers treat as an insecure context where crypto.subtle
   does not exist. So the hash is written out by hand -- and a hand-rolled hash
   that is subtly wrong fails silently and identically every single time, which
   is the worst way for a hash to be wrong. Hence this.

   The padding boundaries are the interesting cases: 55/56/57 and 63/64/65 are
   where the message length forces an extra block, and a key longer than 64
   bytes has to be hashed first.
*/

const crypto = require('crypto');
const path = require('path');

const web = require(path.join(__dirname, '..', 'back-end', 'web', 'sign.js'));
const agent = require(path.join(__dirname, '..', 'back-end', 'src', 'signing.js'));

let pass = 0;
let fail = 0;

function is(label, got, want) {
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    console.log(`        browser: ${got}`);
    console.log(`        node:    ${want}`);
  }
}

const nodeSha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const nodeHmac = (k, m) =>
  crypto.createHmac('sha256', Buffer.from(k, 'utf8')).update(m, 'utf8').digest('hex');

console.log('=== SHA-256, known answers ===');
is('empty', web.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
is('abc', web.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

console.log('\n=== SHA-256, every padding boundary ===');
for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 200, 1000, 4096]) {
  const s = 'x'.repeat(n);
  is(`length ${n}`, web.sha256Hex(s), nodeSha(s));
}

console.log('\n=== SHA-256, multi-byte characters ===');
for (const s of ['café', 'über — dash', 'line\nbreak', '😀 emoji', '{"a":1}']) {
  is(JSON.stringify(s), web.sha256Hex(s), nodeSha(s));
}

console.log('\n=== HMAC-SHA256, including keys longer than the block ===');
for (const k of ['short', 'a'.repeat(48), 'k'.repeat(63), 'k'.repeat(64), 'k'.repeat(65), 'k'.repeat(200)]) {
  for (const m of ['', 'abc', 'x'.repeat(100), 'café']) {
    is(`key ${k.length}b / msg ${m.length}b`, web.hmacSha256Hex(k, m), nodeHmac(k, m));
  }
}

console.log('\n=== the canonical strings match the agent exactly ===');
const cases = [
  { method: 'GET', path: '/health', body: '', timestamp: 1758000000, nonce: 'deadbeef00000001' },
  { method: 'POST', path: '/action', body: '{"action":"shutdown"}', timestamp: 1758000001, nonce: 'deadbeef00000002' },
  { method: 'POST', path: '/action', body: '{"name":"café"}', timestamp: 1758000002, nonce: 'deadbeef00000003' },
];
for (const c of cases) {
  is(
    `canonical ${c.method} ${c.path}`,
    web.canonicalRequest(c.method, c.path, c.body, c.timestamp, c.nonce),
    agent.canonicalRequest(c)
  );
  is(
    `signature ${c.method} ${c.path}`,
    web.hmacSha256Hex('a'.repeat(48), web.canonicalRequest(c.method, c.path, c.body, c.timestamp, c.nonce)),
    agent.signRequestValue('a'.repeat(48), c)
  );
}

console.log('\n=== a header the page builds, checked by the agent ===');
{
  const TOKEN = 'a3f1c09d4b7e2815a3f1c09d4b7e2815a3f1c09d4b7e2815';
  const signed = web.signRequest(TOKEN, 'POST', '/action', '{"action":"lock"}');
  is(
    'accepted',
    agent.verifyRequest({
      header: signed.authorization, secret: TOKEN, method: 'POST',
      path: '/action', body: '{"action":"lock"}', nonces: agent.createNonceCache(),
    }).ok,
    true
  );
  is('the nonce is plain hex, no sign', /^[0-9a-f]{16}$/.test(signed.nonce), true);

  const body = '{"status":"ok"}';
  const sig = agent.signResponse(TOKEN, { nonce: signed.nonce, body });
  is('the page verifies a real reply', web.verifyResponse(TOKEN, signed.nonce, body, sig), true);
  is('and rejects a forged one', web.verifyResponse(TOKEN, signed.nonce, body, 'f'.repeat(64)), false);
  is('an older agent that sends nothing still works', web.verifyResponse(TOKEN, signed.nonce, body, null), true);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

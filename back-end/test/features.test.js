/**
 * Runs a real agent and calls every feature the way the phone does: signed
 * requests, checked replies. Run it with:
 *
 *     node test/features.test.js                  everything that changes nothing
 *     node test/features.test.js --side-effects   also shows one test message and
 *                                                 one "screen is being viewed"
 *                                                 notification on this PC
 *
 * The agent keeps its data in a throwaway folder (REVEILLE_DATA) on its own
 * port, so the real install's pairing, log and schedules are never touched.
 * Nothing here shuts down, sleeps, locks, launches, presses a media key or
 * changes the volume: the volume is set to the level it already has.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const signing = require('../src/signing');
const automation = require('../src/automation');

const SIDE_EFFECTS = process.argv.includes('--side-effects');
const PORT = 5611;
const TOKEN = 'abcdef0123456789'.repeat(3);
const WINDOWS = process.platform === 'win32';

let pass = 0;
let fail = 0;
function is(label, got, want) {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
}
function truthy(label, value) { is(label, Boolean(value), true); }

async function call(method, route, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const { authorization, nonce } = signing.signRequest(TOKEN, method, route, text);
  const res = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers: { Authorization: authorization, 'Content-Type': 'application/json', 'X-Reveille-Client': 'Test phone' },
    body: text || undefined,
  });
  const raw = await res.text();
  const sig = res.headers.get('x-reveille-signature');
  return {
    status: res.status,
    body: raw ? JSON.parse(raw) : null,
    signed: res.ok ? sig === signing.signResponse(TOKEN, { nonce, body: raw }) : null,
  };
}

async function main() {
  // ---------------------------------------------- the schedule arithmetic --
  console.log('=== when a schedule happens ===');
  {
    const { nextOccurrence, validSchedule, dateKey } = automation._internal;
    const wed = new Date(2026, 9, 7, 12, 0, 0);                 // Wednesday 7 Oct 2026, noon
    const every = { id: 'a', time: '23:30', days: [0, 1, 2, 3, 4, 5, 6], action: 'shutdown', enabled: true, skip: null };
    is('later today', dateKey(nextOccurrence(every, wed)) + ' ' + nextOccurrence(every, wed).getHours(), '2026-10-07 23');
    is('skipping tonight moves it to tomorrow', dateKey(nextOccurrence({ ...every, skip: '2026-10-07' }, wed)), '2026-10-08');
    const weekend = { ...every, days: [0, 6] };
    is('weekends only: the coming Saturday', dateKey(nextOccurrence(weekend, wed)), '2026-10-10');
    is('switched off: never', nextOccurrence({ ...every, enabled: false }, wed), null);
    is('a valid schedule', validSchedule(every), true);
    is('a time that does not exist', validSchedule({ ...every, time: '24:00' }), false);
    is('no days', validSchedule({ ...every, days: [] }), false);
    is('an action nobody offers', validSchedule({ ...every, action: 'format' }), false);
    is('an id with a path in it', validSchedule({ ...every, id: '../x' }), false);
  }

  // -------------------------------------------------------- a real agent --
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'reveille-test-'));
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ port: PORT, token: TOKEN }));
  fs.writeFileSync(path.join(data, 'apps.json'), JSON.stringify([
    { id: 'notepad', name: 'Notepad', target: 'C:\\Windows\\notepad.exe', icon: 'iVBORw0KGgo=' },
    { id: 'bad', name: 'Has a quote', target: 'x" & calc' },
  ]));

  const agent = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, REVEILLE_DATA: data },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  agent.stdout.on('data', (c) => { output += c; });
  agent.stderr.on('data', (c) => { output += c; });

  try {
    let health = null;
    for (let i = 0; i < 40 && !health; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { health = (await call('GET', '/health')).body; } catch { /* not up yet */ }
    }
    if (!health) throw new Error('the agent never answered:\n' + output);

    console.log('\n=== /health says what this PC can do ===');
    const caps = health.capabilities;
    is('media on Windows only', caps.media, WINDOWS);
    is('when-finished everywhere', caps.whenFinished, true);
    is('schedules everywhere', caps.schedules, true);
    is('messages', caps.message, true);
    is('activity log', caps.activity, true);
    is('apps: there is a list', caps.apps, true);
    is('screen: off until switched on', caps.screen, false);
    is('nothing automatic yet', health.automations, { whenFinished: null, nextSchedule: null });

    console.log('\n=== the graphics card turns up in the vitals ===');
    if (WINDOWS) {
      let gpu = null;
      for (let i = 0; i < 20 && !gpu; i++) {
        await new Promise((r) => setTimeout(r, 500));
        gpu = (await call('GET', '/health')).body.stats.gpu;
      }
      truthy('a name', gpu && gpu.name);
      truthy('a percentage from 0 to 100', gpu && gpu.percent >= 0 && gpu.percent <= 100);
      truthy('memory in use, and in all', gpu && gpu.memoryTotalBytes > 0 && gpu.memoryUsedBytes >= 0);
    } else {
      is('none off Windows', health.stats.gpu, null);
    }

    if (WINDOWS) {
      console.log('\n=== volume: read, and "set" to what it already is ===');
      const before = await call('GET', '/volume');
      is('reads', before.status, 200);
      is('the reply is signed', before.signed, true);
      truthy('a level from 0 to 100', before.body.level >= 0 && before.body.level <= 100);
      const same = await call('POST', '/volume', { level: before.body.level, muted: before.body.muted });
      is('setting it to itself changes nothing', same.body, before.body);
      is('a level that is not a number', (await call('POST', '/volume', { level: 'loud' })).status, 400);
      is('muted that is not true or false', (await call('POST', '/volume', { muted: 'yes' })).status, 400);
      is('a media key that does not exist', (await call('POST', '/media', { key: 'eject' })).status, 400);
      is('a player that is not text', (await call('POST', '/media', { key: 'next', session: 5 })).status, 400);
      const playing = await call('GET', '/nowplaying');
      is('what is playing: answers', playing.status, 200);
      truthy('what is playing: a list of players', Array.isArray(playing.body.sessions));
      for (const s of playing.body.sessions) {
        truthy(`  ${s.app}: says what it can do`, typeof s.canNext === 'boolean' && typeof s.playing === 'boolean');
      }
    }

    console.log('\n=== messages ===');
    is('an empty one is refused', (await call('POST', '/message', { text: '   ' })).status, 400);
    is('a long one is refused', (await call('POST', '/message', { text: 'x'.repeat(301) })).status, 400);
    if (SIDE_EFFECTS) {
      is('a real one is shown on the PC', (await call('POST', '/message', { text: 'Reveille test: you can ignore this.' })).status, 200);
    }

    console.log('\n=== apps: names out, never paths ===');
    const list = await call('GET', '/apps');
    is('only the valid entry is offered, with its icon', list.body.apps, [{ id: 'notepad', name: 'Notepad', icon: 'iVBORw0KGgo=' }]);
    is('no target ever leaves the PC', JSON.stringify(list.body).includes('notepad.exe'), false);
    is('an id not on the list', (await call('POST', '/launch', { id: 'calc' })).status, 404);
    is('the entry with a quote in it', (await call('POST', '/launch', { id: 'bad' })).status, 404);

    console.log('\n=== shut down when it is finished ===');
    const on = await call('POST', '/when-finished', { action: 'sleep', watch: 'cpu', quietMinutes: 240 });
    is('set', on.status, 200);
    is('it says what it is waiting for', on.body.whenFinished && on.body.whenFinished.action, 'sleep');
    is('/health shows it too', (await call('GET', '/health')).body.automations.whenFinished.quietMinutes, 240);
    is('zero minutes refused', (await call('POST', '/when-finished', { action: 'sleep', watch: 'cpu', quietMinutes: 0 })).status, 400);
    is('an action it does not do', (await call('POST', '/when-finished', { action: 'lock', quietMinutes: 5 })).status, 400);
    is('turned off', (await call('POST', '/when-finished', { off: true })).body.whenFinished, null);

    console.log('\n=== schedules ===');
    const inThreeHours = new Date(Date.now() + 3 * 3600 * 1000);
    const hhmm = `${String(inThreeHours.getHours()).padStart(2, '0')}:${String(inThreeHours.getMinutes()).padStart(2, '0')}`;
    const set = await call('PUT', '/schedules', {
      schedules: [{ id: 'nightly', time: hhmm, days: [0, 1, 2, 3, 4, 5, 6], action: 'shutdown', enabled: true, skip: null }],
    });
    is('saved', set.status, 200);
    truthy('it knows when it happens next', set.body.schedules[0].next);
    is('/health shows the next one', (await call('GET', '/health')).body.automations.nextSchedule.time, hhmm);
    is('kept in the data folder', JSON.parse(fs.readFileSync(path.join(data, 'schedules.json'), 'utf8')).list.length, 1);
    is('a bad one is refused', (await call('PUT', '/schedules', { schedules: [{ id: 'x', time: '9am' }] })).status, 400);
    is('cleared', (await call('PUT', '/schedules', { schedules: [] })).body.schedules, []);

    console.log('\n=== the screen ===');
    const off = await call('GET', '/screen');
    is('refused while switched off', off.status, WINDOWS ? 403 : 400);
    if (WINDOWS) is('and says how to switch it on', off.body.reason, 'screenOff');
    if (WINDOWS && SIDE_EFFECTS) {
      const config = JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8'));
      fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ ...config, allowScreen: true }));
      is('/health notices without a restart', (await call('GET', '/health')).body.capabilities.screen, true);
      const shot = await call('GET', '/screen?w=640&q=50');
      is('a picture', shot.status, 200);
      is('signed', shot.signed, true);
      is('640 wide', shot.body.width, 640);
      is('a real JPEG', Buffer.from(shot.body.jpeg, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
      truthy('with a fingerprint', /^[0-9a-f]{32}$/.test(shot.body.hash));
      // Usually unchanged a moment later; a ticking clock or a video can
      // change it, so either answer is right as long as it is well-formed.
      const again = await call('GET', `/screen?w=640&q=50&since=${shot.body.hash}`);
      truthy('asked again with it: "same" and no picture, or a new one', again.body.same === true ? !again.body.jpeg : Boolean(again.body.jpeg));
    }

    console.log('\n=== cancel, and the activity log ===');
    is('cancel answers', (await call('POST', '/cancel')).status, 200);
    const log = (await call('GET', '/activity?limit=50')).body.entries;
    const kinds = log.map((e) => e.action);
    for (const kind of ['started', 'whenFinishedOn', 'whenFinishedOff', 'schedulesChanged', 'cancel']) {
      truthy(`logged: ${kind}`, kinds.includes(kind));
    }
    is('newest first', log[0].action, 'cancel');
    is('who asked, as the phone described itself', log[0].client, 'Test phone');
    is('and from where', log[0].from, '127.0.0.1');
    is('looking is not logged', kinds.includes('volume') || kinds.includes('health'), false);

    console.log('\n=== nothing gets in unsigned ===');
    const res = await fetch(`http://127.0.0.1:${PORT}/volume`, { method: 'POST', body: '{"level":0}', headers: { 'Content-Type': 'application/json' } });
    is('volume without a signature', res.status, 401);
  } finally {
    agent.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(data, { recursive: true, force: true });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

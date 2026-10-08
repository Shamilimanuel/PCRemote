const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const {
  isValidAction,
  runAction,
  cancelPendingShutdown,
  hasFirmwareTask,
  getPending,
  normalizeDelay,
  MAX_DELAY_SECONDS,
} = require('./commands');
const { getPrimaryNetworkInfo, readSetting } = require('./config');
const { collect } = require('./stats');
const updates = require('./updates');
const platform = require('./platform');
const { createNonceCache, verifyRequest, signResponse } = require('./signing');
const { isLocalAddress, describe } = require('./netguard');
const winhelper = require('./winhelper');
const activity = require('./activity');
const automation = require('./automation');
const apps = require('./apps');
const { popup } = require('./notify');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Whether a plain `Authorization: Bearer <token>` is still accepted.
 *
 * It is, for now, because the phone app and the agent are updated separately
 * and whoever updates one first should not lose control of their own PC. But a
 * bearer token is the thing this release exists to stop sending, so this is a
 * transition and not a setting: it should be removed once signing has been out
 * long enough that nobody is running an app older than it.
 *
 * REVEILLE_REQUIRE_SIGNING=1 turns it off today, for anyone who would rather
 * not wait.
 */
const ALLOW_BEARER = process.env.REVEILLE_REQUIRE_SIGNING !== '1';

/** The address check can be turned off, but only deliberately. */
const ALLOW_ANY_ADDRESS = process.env.REVEILLE_ALLOW_PUBLIC === '1';

// The same buttons as the phone app, for anything with a browser. An iPhone
// cannot install an APK and Apple offers no equivalent, so a web page is the
// only route onto one that does not involve a paid developer account.
//
// Served without a token: it contains no secrets, and asking for one before
// handing over the login form would be circular. Every request it then makes
// carries the token like any other client.
const WEB_ROOT = path.join(__dirname, '..', 'web');

/** Screen viewing is off until the PC's owner turns it on in the setup window. */
function screenAllowed() {
  return winhelper.available() && readSetting('allowScreen') === true;
}

const MEDIA_KEYS = ['playpause', 'next', 'previous', 'stop'];

function createServer(config) {
  const app = express();
  const nonces = createNonceCache();

  // Before anything else, including the web page: a request from off the local
  // network gets nothing at all, not even a login form to guess at.
  app.use((req, res, next) => {
    if (ALLOW_ANY_ADDRESS || isLocalAddress(req.socket.remoteAddress)) {
      next();
      return;
    }
    console.warn(`refused a request from ${describe(req.socket.remoteAddress)} (not a local network)`);
    res.status(403).json({ error: 'Reveille only answers on your local network.' });
  });

  // The raw text is kept because that is what the signature covers. Express
  // parses and discards it otherwise, and a signature over a re-serialised
  // object would only be a signature over what this side happened to produce.
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.length ? buf.toString('utf8') : '';
      },
    })
  );

  // Sign every reply, bound to the nonce the phone chose, so it can tell this
  // agent from something else answering on the same address.
  app.use((req, res, next) => {
    res.json = (payload) => {
      const body = JSON.stringify(payload);
      if (req.reveilleNonce) {
        res.set(
          'X-Reveille-Signature',
          signResponse(config.token, { nonce: req.reveilleNonce, body })
        );
      }
      res.type('application/json');
      return res.send(body);
    };
    next();
  });

  app.use(
    express.static(WEB_ROOT, {
      index: 'index.html',
      // The page changes only when the agent is updated, and a stale one would
      // be confusing to debug.
      etag: true,
      maxAge: 0,
    })
  );

  function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';

    // A signature is the real path: it proves the caller holds the token
    // without the token ever crossing the network, and it cannot be replayed.
    if (header.startsWith('Reveille ')) {
      const result = verifyRequest({
        header,
        secret: config.token,
        method: req.method,
        // originalUrl, not path: the signature covers the query string too.
        path: req.originalUrl,
        body: req.rawBody ?? '',
        nonces,
      });
      if (!result.ok) {
        res.status(401).json({ error: 'Unauthorized', reason: result.reason });
        return;
      }
      req.reveilleNonce = result.nonce;
      next();
      return;
    }

    if (ALLOW_BEARER) {
      const [scheme, token] = header.split(' ');
      if (scheme === 'Bearer' && token && timingSafeEqual(token, config.token)) {
        next();
        return;
      }
    }

    res.status(401).json({ error: 'Unauthorized' });
  }

  app.get('/health', requireAuth, async (req, res) => {
    // A sleep counting down is held by automation.js, since Windows has no
    // delayed sleep of its own; shutdowns and restarts count down in Windows.
    const pending = getPending() || (() => {
      const firing = automation.firingPending();
      return firing ? { action: firing.action, atMs: Date.now() + firing.secondsRemaining * 1000 } : null;
    })();

    res.json({
      status: 'ok',
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSeconds: Math.floor(os.uptime()),
      // Read live rather than at boot: DHCP can hand out a new address, and a
      // laptop can move between Wi-Fi and Ethernet, while the agent keeps running.
      interfaces: getPrimaryNetworkInfo(),
      // Which OS this is, in the app's own vocabulary rather than Node's --
      // 'windows' | 'macos' | 'linux'. Absent on agents older than this, which
      // the app reads as Windows, because that is all there was.
      os: platform.PLATFORM,
      // Lets the app hide buttons for things this machine isn't set up to do.
      capabilities: {
        firmwareReboot: await hasFirmwareTask(),
        timedShutdown: true,
        stats: true,
        // Added with the features batch of October 2026. Absent on older
        // agents, which the app reads as "not available".
        media: winhelper.available(),
        whenFinished: true,
        whenFinishedNetwork: winhelper.available(),
        schedules: true,
        message: true,
        activity: true,
        apps: apps.count() > 0,
        screen: screenAllowed(),
        screenSupported: winhelper.available(),
      },
      // What the machine is actually doing, so the app can be a window as well
      // as a switch.
      stats: await collect(),
      // So the phone can show that the PC half needs updating too, not just
      // its own app.
      agent: updates.status(),
      // What the PC will do by itself: shut down once it goes quiet, and the
      // next scheduled shutdown, restart or sleep.
      automations: automation.summary(),
      // Present only while a timed shutdown or restart is counting down.
      pending: pending
        ? {
            action: pending.action,
            secondsRemaining: Math.max(0, Math.round((pending.atMs - Date.now()) / 1000)),
          }
        : null,
    });
  });

  app.post('/action', requireAuth, async (req, res) => {
    const { action, delaySeconds } = req.body || {};
    if (!isValidAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    if (delaySeconds !== undefined && !Number.isFinite(Number(delaySeconds))) {
      res.status(400).json({ error: 'delaySeconds must be a number' });
      return;
    }

    try {
      await runAction(action, { delaySeconds });
      activity.record(action, {
        ...activity.clientOf(req),
        detail: delaySeconds !== undefined && normalizeDelay(delaySeconds) > 60 ? `in ${normalizeDelay(delaySeconds)}s` : null,
      });
      res.status(202).json({
        status: 'accepted',
        action,
        delaySeconds:
          delaySeconds === undefined ? undefined : normalizeDelay(delaySeconds),
        maxDelaySeconds: MAX_DELAY_SECONDS,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/cancel', requireAuth, async (req, res) => {
    await cancelPendingShutdown();
    automation.cancelFiring();
    activity.record('cancel', activity.clientOf(req));
    res.json({ status: 'cancelled' });
  });

  // ---------------------------------------------------- volume and media --

  app.get('/volume', requireAuth, async (req, res) => {
    try {
      res.json(await winhelper.call('volume'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/volume', requireAuth, async (req, res) => {
    const { level, muted } = req.body || {};
    const args = {};
    if (level !== undefined) {
      if (!Number.isFinite(Number(level))) return res.status(400).json({ error: 'level must be a number from 0 to 100' });
      args.level = Math.max(0, Math.min(100, Math.round(Number(level))));
    }
    if (muted !== undefined) {
      if (typeof muted !== 'boolean') return res.status(400).json({ error: 'muted must be true or false' });
      args.muted = muted;
    }
    try {
      res.json(await winhelper.call('volume', args));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/media', requireAuth, async (req, res) => {
    const { key, session } = req.body || {};
    if (!MEDIA_KEYS.includes(key)) return res.status(400).json({ error: `Unknown media key: ${key}` });
    if (session !== undefined && typeof session !== 'string') return res.status(400).json({ error: 'session must be text' });
    try {
      const result = await winhelper.call('key', { key, session: session || '' });
      res.json({ status: 'pressed', key, app: result?.app ?? null });
    } catch (err) {
      // "Spotify has nothing to skip to" is an answer, not a failure.
      res.status(409).json({ error: err.message });
    }
  });

  // Every player Windows knows about, what it is playing, and what it can do.
  app.get('/nowplaying', requireAuth, async (req, res) => {
    try {
      res.json(await winhelper.call('nowplaying'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------ messages --

  app.post('/message', requireAuth, async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Write something to send.' });
    if (text.length > 300) return res.status(400).json({ error: 'Messages can be up to 300 characters.' });
    const who = activity.clientOf(req);
    // Reveille's own pop-up rather than a Windows notification, which Focus,
    // Do Not Disturb or a game can hide without a word.
    const shown = await popup({ title: who.client ? `Message from ${who.client}` : 'Message from your phone', body: text, seconds: 15 });
    activity.record('message', { ...who, detail: text.slice(0, 80) });
    if (!shown) return res.status(500).json({ error: 'The PC did not show the message.' });
    res.json({ status: 'shown' });
  });

  // ---------------------------------------------------------------- apps --

  app.get('/apps', requireAuth, (req, res) => {
    res.json({ apps: apps.list() });
  });

  app.post('/launch', requireAuth, (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    try {
      const started = apps.launch(id);
      activity.record('launch', { ...activity.clientOf(req), detail: started.name });
      res.status(202).json({ status: 'started', ...started });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------- automations --

  app.get('/automations', requireAuth, (req, res) => {
    res.json(automation.details());
  });

  app.post('/when-finished', requireAuth, (req, res) => {
    const who = activity.clientOf(req);
    if (req.body?.off === true) {
      automation.clearWhenFinished(who);
      return res.json(automation.details());
    }
    try {
      automation.setWhenFinished(req.body || {}, who);
      res.json(automation.details());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/schedules', requireAuth, (req, res) => {
    try {
      automation.setSchedules(req.body?.schedules, activity.clientOf(req));
      res.json(automation.details());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------ activity --

  app.get('/activity', requireAuth, (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    res.json({ entries: activity.recent(limit) });
  });

  // -------------------------------------------------------------- screen --

  // When a viewing session starts, the PC says so on its own screen. Someone
  // sitting at it should never be watched without knowing.
  let lastScreenAt = 0;

  app.get('/screen', requireAuth, async (req, res) => {
    if (!winhelper.available()) {
      return res.status(400).json({ error: 'Seeing the screen works on Windows only.' });
    }
    if (!screenAllowed()) {
      return res.status(403).json({
        error: 'Seeing the screen is switched off on this PC. Turn it on in the Reveille window, under Permissions.',
        reason: 'screenOff',
      });
    }
    const maxWidth = Math.max(320, Math.min(3840, Math.round(Number(req.query.w) || 1280)));
    const quality = Math.max(20, Math.min(90, Math.round(Number(req.query.q) || 60)));
    // The fingerprint of the picture the phone already has: if the screen has
    // not changed, the reply says so instead of sending it again.
    const since = typeof req.query.since === 'string' && /^[0-9a-f]{32}$/.test(req.query.since) ? req.query.since : '';

    if (Date.now() - lastScreenAt > 60000) {
      const who = activity.clientOf(req);
      activity.record('screen', who);
      popup({
        title: 'Your screen is being viewed',
        body: who.client ? `From ${who.client}, in the Reveille app.` : 'From a phone, in the Reveille app.',
        seconds: 8,
        tone: 'warn',
      }).catch(() => {});
    }
    lastScreenAt = Date.now();

    try {
      const shot = await winhelper.call('screen', { maxWidth, quality, since });
      const at = new Date().toISOString();
      if (shot.same) return res.json({ same: true, hash: shot.hash, width: shot.width, height: shot.height, at });
      res.json({ width: shot.width, height: shot.height, hash: shot.hash, jpeg: shot.jpeg, at });
    } catch (err) {
      // A locked PC is never photographed: the helper checks first, and
      // refuses. The second test is Windows itself refusing, as a backstop.
      const locked = /^locked$/i.test(err.message) || /handle is invalid/i.test(err.message);
      res.status(locked ? 409 : 500).json({
        error: locked ? 'The PC is locked. Windows does not let anything see the lock screen.' : err.message,
        reason: locked ? 'locked' : undefined,
      });
    }
  });

  return app;
}

module.exports = { createServer };

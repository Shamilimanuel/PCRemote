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
const { getPrimaryNetworkInfo } = require('./config');
const { collect } = require('./stats');
const updates = require('./updates');
const platform = require('./platform');
const { createNonceCache, verifyRequest, signResponse } = require('./signing');
const { isLocalAddress, describe } = require('./netguard');

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
    const pending = getPending();

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
      },
      // What the machine is actually doing, so the app can be a window as well
      // as a switch.
      stats: await collect(),
      // So the phone can show that the PC half needs updating too, not just
      // its own app.
      agent: updates.status(),
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
    res.json({ status: 'cancelled' });
  });

  return app;
}

module.exports = { createServer };

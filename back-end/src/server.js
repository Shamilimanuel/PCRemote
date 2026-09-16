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

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
  app.use(express.json());

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
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token || !timingSafeEqual(token, config.token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
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
      // Lets the app hide buttons for things this PC isn't set up to do.
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

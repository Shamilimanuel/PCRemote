const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { isValidAction, runAction, cancelPendingShutdown, hasFirmwareTask } = require('./commands');
const { getPrimaryNetworkInfo } = require('./config');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createServer(config) {
  const app = express();
  app.use(express.json());

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
      },
    });
  });

  app.post('/action', requireAuth, async (req, res) => {
    const { action } = req.body || {};
    if (!isValidAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    try {
      await runAction(action);
      res.status(202).json({ status: 'accepted', action });
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

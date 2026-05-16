const express = require('express');
const router = express.Router();
const db = require('../config/database');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Account = require('../models/Account');
const ExecutionRun = require('../models/ExecutionRun');
const { generateToken, TOKEN_PURPOSES } = require('../middleware/auth');

function ensureEnabled(req, res, next) {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_SUPPORT === 'false') {
    return res.status(404).json({ error: 'Route not found' });
  }
  next();
}

router.use(ensureEnabled);

router.post('/e2e/trade-management-fixture', async (req, res, next) => {
  try {
    const makeAdmin = req.body?.admin === true;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const user = await User.create({
      email: `trade-management-${suffix}@e2e.local`,
      username: `tm_e2e_${suffix.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 45),
      password: 'E2eFixture!123',
      fullName: 'Trade Management E2E',
      verificationToken: null,
      verificationExpires: null,
      role: makeAdmin ? 'admin' : 'user',
      isVerified: true,
      adminApproved: true,
      tier: 'pro'
    });
    await User.createSettings(user.id);
    await Account.create(user.id, {
      accountName: 'E2E Account',
      accountIdentifier: 'E2E-ACT',
      broker: 'E2E',
      initialBalance: 100000,
      initialBalanceDate: '2026-05-11',
      isPrimary: true,
      notes: 'Deterministic trade management fixture account'
    });

    const trade = await Trade.create(user.id, {
      symbol: 'AAPL',
      entryTime: '2026-05-11T13:30:00.000Z',
      exitTime: '2026-05-11T14:00:00.000Z',
      entryPrice: 100,
      exitPrice: 106,
      quantity: 10,
      side: 'long',
      commission: 0,
      fees: 0,
      broker: 'E2E',
      strategy: 'breakout',
      setup: 'opening range',
      tags: ['e2e', 'trade-management'],
      stopLoss: 98,
      takeProfit: 108,
      accountIdentifier: 'E2E-ACT',
      manualTargetHitFirst: 'take_profit',
      notes: 'Deterministic trade management fixture'
    }, { skipApiCalls: true, skipAchievements: true });

    const baseRunPayload = {
      source: 'trade-management',
      config: {
        fixture: true,
        route: '/analysis/trade-management',
        tradeId: trade.id,
        symbol: 'AAPL',
        strategy: 'breakout',
        accountId: 'E2E-ACT',
        accountIdentifier: 'E2E-ACT'
      },
      marketDataSnapshotId: 'tm-e2e-aapl-2026-05-11',
      marketDataSnapshot: {
        symbol: 'AAPL',
        strategy: 'breakout',
        accountId: 'E2E-ACT',
        accountIdentifier: 'E2E-ACT',
        provider: 'e2e',
        bars: 1,
        from: '2026-05-11T13:30:00.000Z',
        to: '2026-05-11T14:00:00.000Z'
      },
      confidence: {
        totalR: { count: 3, lower95: 2.8, upper95: 3.4 }
      },
      startedAt: '2026-05-11T13:30:00.000Z',
      endedAt: '2026-05-11T13:31:00.000Z',
      status: 'completed'
    };

    const liveRun = await ExecutionRun.create(user.id, {
        ...baseRunPayload,
        mode: 'live',
        name: 'Live fixture',
        metrics: { tradeCount: 1, totalR: 3, winRate: 100, avgR: 3 }
      });
    const replayRun = await ExecutionRun.create(user.id, {
        ...baseRunPayload,
        mode: 'replay',
        name: 'Replay fixture',
        parentRunId: liveRun.id,
        lineageType: 'replay_of',
        metrics: { tradeCount: 1, totalR: 2.5, winRate: 100, avgR: 2.5 }
      });
    const backtestRun = await ExecutionRun.create(user.id, {
        ...baseRunPayload,
        mode: 'backtest',
        name: 'Backtest fixture',
        parentRunId: replayRun.id,
        lineageType: 'backtest_of',
        metrics: { tradeCount: 1, totalR: 3.2, winRate: 100, avgR: 3.2 }
      });
    const runs = [liveRun, replayRun, backtestRun];

    const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        tier: user.tier
      },
      trade,
      runs
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/e2e/users/:id', async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ deleted: result.rowCount > 0 });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

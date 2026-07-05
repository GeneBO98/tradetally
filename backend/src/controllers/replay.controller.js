const Trade = require('../models/Trade');
const TierService = require('../services/tierService');
const replayDataService = require('../services/replayDataService');
const { getTierLimits } = require('../config/tierLimits');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Free-tier replay quota. Free users get a lifetime allowance of distinct
 * trade replays (maxFreeReplays); rewatching an already-replayed trade never
 * consumes quota. Pro users and self-hosted instances are unlimited.
 *
 * This lives in the controller rather than requiresTier middleware because
 * free users get partial access instead of a hard tier wall.
 */
async function getQuotaStatus(userId, hostHeader) {
  const { tier, billingEnabled } = await TierService.getUserTierWithBillingStatus(userId, hostHeader);
  const limit = billingEnabled ? getTierLimits(tier).maxFreeReplays : null;

  if (limit === null || limit === undefined) {
    return { unlimited: true, tier, limit: null, used: null, remaining: null };
  }

  const used = await replayDataService.countReplayedTrades(userId);
  return {
    unlimited: false,
    tier,
    limit,
    used,
    remaining: Math.max(0, limit - used)
  };
}

const replayController = {
  async getTradeReplay(req, res, next) {
    try {
      const userId = req.user.id;
      const tradeId = req.params.tradeId;

      if (!UUID_REGEX.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }

      const trade = await Trade.findById(tradeId, userId);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const quota = await getQuotaStatus(userId, req.headers.host);
      if (!quota.unlimited) {
        const alreadyReplayed = await replayDataService.hasReplayedTrade(userId, tradeId);
        if (!alreadyReplayed && quota.remaining <= 0) {
          return res.status(403).json({
            error: 'Free replay limit reached. Upgrade to Pro for unlimited trade replays.',
            upgrade_required: true,
            quota
          });
        }
      }

      const payload = await replayDataService.getTradeReplayData(trade, userId);

      // Record usage only after data was successfully served, so a failed
      // replay never burns quota. Recorded for all tiers (usage analytics).
      await replayDataService.recordReplayUsage(userId, tradeId);

      if (!quota.unlimited) {
        payload.quota = await getQuotaStatus(userId, req.headers.host);
      }

      res.json(payload);
    } catch (error) {
      if (error.code === 'PRO_REQUIRED') {
        return res.status(403).json({ error: error.message, upgrade_required: true });
      }
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        return res.status(429).json({ error: error.message, reset_at: error.resetAt });
      }
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error('[REPLAY] Failed to build replay data:', error);
      next(error);
    }
  },

  async getQuota(req, res, next) {
    try {
      const quota = await getQuotaStatus(req.user.id, req.headers.host);
      res.json(quota);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = replayController;

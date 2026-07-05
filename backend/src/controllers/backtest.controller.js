const TierService = require('../services/tierService');
const replayDataService = require('../services/replayDataService');
const backtestService = require('../services/backtestService');
const databento = require('../utils/databento');
const { resolveFuturesRoot, getFuturesPointValue } = require('../utils/futuresUtils');
const { getTierLimits } = require('../config/tierLimits');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL_REGEX = /^[A-Z][A-Z0-9.\-]{0,15}$/;
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Free-tier backtest quota: a lifetime allowance of distinct symbol/session
 * days (maxFreeBacktests). Reloading a session the user already backtested
 * never consumes quota. Pro users and self-hosted instances are unlimited.
 * Same partial-access model as trade replay, so it lives in the controller
 * rather than requiresTier middleware.
 */
async function getQuotaStatus(userId, hostHeader) {
  const { tier, billingEnabled } = await TierService.getUserTierWithBillingStatus(userId, hostHeader);
  const limit = billingEnabled ? getTierLimits(tier).maxFreeBacktests : null;

  if (limit === null || limit === undefined) {
    return {
      unlimited: true,
      tier,
      limit: null,
      used: null,
      remaining: null,
      futures_available: databento.isConfigured()
    };
  }

  const used = await backtestService.countBacktestedSessions(userId);
  return {
    unlimited: false,
    tier,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    futures_available: databento.isConfigured()
  };
}

function parseSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  return SYMBOL_REGEX.test(symbol) ? symbol : null;
}

// 'stock' (default) or 'future'; null for anything else
function parseInstrument(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'stock') return 'stock';
  return raw === 'future' ? 'future' : null;
}

function parseSessionDate(raw) {
  const value = String(raw || '').trim();
  const match = DATE_REGEX.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { value, year: Number(year), month: Number(month), day: Number(day) };
}

function sendKnownError(res, error) {
  if (error.code === 'PRO_REQUIRED') {
    res.status(403).json({ error: error.message, upgrade_required: true });
    return true;
  }
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    res.status(429).json({ error: error.message, reset_at: error.resetAt });
    return true;
  }
  if (error.statusCode) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

const backtestController = {
  /**
   * Candle payload for a symbol + past session date. Consumes one unit of the
   * free quota per distinct symbol/day, recorded only after data is served.
   */
  async getSessionData(req, res, next) {
    try {
      const userId = req.user.id;
      const instrument = parseInstrument(req.query.instrument);
      const sessionDate = parseSessionDate(req.query.date);

      if (!instrument) {
        return res.status(400).json({ error: 'Instrument must be "stock" or "future"' });
      }
      if (!sessionDate) {
        return res.status(400).json({ error: 'Session date must be in YYYY-MM-DD format' });
      }

      // Futures accept a root or contract symbol, normalized to the root so
      // quota and cache never double-charge MNQM6 vs MNQ.
      let symbol;
      if (instrument === 'future') {
        symbol = resolveFuturesRoot(req.query.symbol);
        if (!symbol) {
          return res.status(400).json({ error: 'Unknown futures root. Supported roots include ES, NQ, YM, RTY, MES, MNQ, MYM, M2K, CL, GC, and other CME contracts.' });
        }
      } else {
        symbol = parseSymbol(req.query.symbol);
        if (!symbol) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }
      }

      const quota = await getQuotaStatus(userId, req.headers.host);
      if (!quota.unlimited) {
        const alreadyUsed = await backtestService.hasBacktestedSession(userId, symbol, sessionDate.value);
        if (!alreadyUsed && quota.remaining <= 0) {
          return res.status(403).json({
            error: 'Free backtest limit reached. Upgrade to Pro for unlimited backtest sessions.',
            upgrade_required: true,
            quota
          });
        }
      }

      const payload = await replayDataService.getBacktestSessionData(symbol, sessionDate.value, userId, { instrument });

      // Record usage only after data was successfully served, so a failed
      // load never burns quota. Recorded for all tiers (usage analytics).
      await backtestService.recordBacktestUsage(userId, symbol, sessionDate.value);

      if (!quota.unlimited) {
        payload.quota = await getQuotaStatus(userId, req.headers.host);
      }

      res.json(payload);
    } catch (error) {
      if (sendKnownError(res, error)) return;
      console.error('[BACKTEST] Failed to build session data:', error);
      next(error);
    }
  },

  async saveSession(req, res, next) {
    try {
      const userId = req.user.id;
      const instrument = parseInstrument(req.body.instrument_type);
      const sessionDate = parseSessionDate(req.body.session_date);

      if (!instrument) {
        return res.status(400).json({ error: 'Instrument must be "stock" or "future"' });
      }
      if (!sessionDate) {
        return res.status(400).json({ error: 'Session date must be in YYYY-MM-DD format' });
      }

      // Multiplier is always derived server-side, never trusted from the client.
      let symbol;
      let multiplier = 1;
      if (instrument === 'future') {
        symbol = resolveFuturesRoot(req.body.symbol);
        if (!symbol) {
          return res.status(400).json({ error: 'Unknown futures root' });
        }
        multiplier = getFuturesPointValue(symbol);
      } else {
        symbol = parseSymbol(req.body.symbol);
        if (!symbol) {
          return res.status(400).json({ error: 'Invalid symbol' });
        }
      }

      const notes = req.body.notes == null ? null : String(req.body.notes).slice(0, 5000);
      const window = instrument === 'future'
        ? replayDataService.futuresSessionWindowForDate(sessionDate.year, sessionDate.month, sessionDate.day)
        : replayDataService.sessionWindowForDate(sessionDate.year, sessionDate.month, sessionDate.day);
      const fills = backtestService.normalizeSessionFills(req.body.fills, {
        from_ts: window.fromTs,
        to_ts: window.toTs
      });

      const stats = backtestService.computeSessionStats(fills, multiplier);
      if (stats.position !== 0) {
        return res.status(400).json({
          error: 'Backtest sessions must be flat when saved. Close the open position first.'
        });
      }

      const session = await backtestService.createSession(userId, {
        symbol,
        sessionDate: sessionDate.value,
        instrumentType: instrument,
        multiplier,
        fills,
        notes,
        stats
      });

      res.status(201).json({ session });
    } catch (error) {
      if (sendKnownError(res, error)) return;
      console.error('[BACKTEST] Failed to save session:', error);
      next(error);
    }
  },

  async listSessions(req, res, next) {
    try {
      const sessions = await backtestService.listSessions(req.user.id);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Saved session for review: the stored fills plus a fresh candle payload
   * (cache-served, so no upstream cost and no quota consumption).
   */
  async getSession(req, res, next) {
    try {
      const userId = req.user.id;
      const sessionId = req.params.id;
      if (!UUID_REGEX.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID format' });
      }

      const session = await backtestService.getSession(sessionId, userId);
      if (!session) {
        return res.status(404).json({ error: 'Backtest session not found' });
      }

      const payload = await replayDataService.getBacktestSessionData(
        session.symbol,
        session.session_date,
        userId,
        { instrument: session.instrument_type }
      );
      payload.saved_session = session;

      res.json(payload);
    } catch (error) {
      if (sendKnownError(res, error)) return;
      console.error('[BACKTEST] Failed to load session:', error);
      next(error);
    }
  },

  async deleteSession(req, res, next) {
    try {
      const sessionId = req.params.id;
      if (!UUID_REGEX.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID format' });
      }
      const deleted = await backtestService.deleteSession(sessionId, req.user.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Backtest session not found' });
      }
      res.json({ success: true });
    } catch (error) {
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

module.exports = backtestController;

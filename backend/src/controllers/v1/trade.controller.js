const db = require('../../config/database');
const Trade = require('../../models/Trade');
const tradeController = require('../trade.controller');
const analyticsController = require('../analytics.controller');
const { sendV1Error, sendV1ErrorFromLegacy, sendV1NotImplemented, sendV1Paginated } = require('../../utils/apiResponse');
const { captureControllerResult } = require('../../utils/legacyControllerAdapter');
const { publish } = require('../../events/domainEvents');

function cloneRequest(req, overrides = {}) {
  return {
    ...req,
    headers: { ...req.headers, ...(overrides.headers || {}) },
    query: { ...req.query, ...(overrides.query || {}) },
    params: { ...req.params, ...(overrides.params || {}) },
    body: overrides.body !== undefined ? overrides.body : req.body,
    user: overrides.user || req.user,
    file: overrides.file !== undefined ? overrides.file : req.file,
    files: overrides.files !== undefined ? overrides.files : req.files
  };
}

function buildPagination(limit, offset, total, returnedCount) {
  return {
    limit,
    offset,
    total,
    hasMore: offset + returnedCount < total
  };
}

function parseLimitOffset(query = {}, defaultLimit = 50) {
  const parsedLimit = parseInt(query.limit ?? `${defaultLimit}`, 10);
  const parsedOffset = parseInt(query.offset ?? '0', 10);

  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : defaultLimit;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  return { limit, offset };
}

async function runLegacy(handler, req, overrides = {}) {
  return captureControllerResult(handler, cloneRequest(req, overrides));
}

async function runTradeList(req, queryOverrides = {}) {
  const legacyResult = await runLegacy(tradeController.getUserTrades, req, {
    query: queryOverrides
  });

  return legacyResult;
}

async function queryQuickSummary(userId, timezone = 'UTC') {
  const result = await db.query(
    `
      WITH completed AS (
        SELECT *
        FROM trades
        WHERE user_id = $1
          AND pnl IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::integer FROM trades WHERE user_id = $1) AS total_trades,
        (SELECT COUNT(*)::integer FROM trades WHERE user_id = $1 AND exit_price IS NULL) AS open_trades,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date = (NOW() AT TIME ZONE $2)::date), 0) AS today_pnl,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date >= date_trunc('week', NOW() AT TIME ZONE $2)::date), 0) AS week_pnl,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date >= date_trunc('month', NOW() AT TIME ZONE $2)::date), 0) AS month_pnl
    `,
    [userId, timezone]
  );

  return result.rows[0] || {};
}

function publishTradeEvent(eventType, req, payload) {
  publish(eventType, payload, {
    source: 'api.v1.trades',
    userId: req.user?.id || null,
    requestId: req.requestId || req.headers['x-request-id'] || null
  }).catch((error) => {
    console.error(`[WEBHOOK-EVENT] Failed to publish ${eventType}:`, error.message);
  });
}

const tradeV1Controller = {
  async getTrades(req, res, next) {
    try {
      const { limit, offset } = parseLimitOffset(req.query, 50);
      const legacyResult = await runTradeList(req, {
        limit,
        offset,
        symbol: req.query.symbol,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      });

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to fetch trades');
      }

      const trades = legacyResult.body?.trades || [];
      const total = legacyResult.body?.total ?? (offset + trades.length);

      return sendV1Paginated(
        res,
        trades,
        buildPagination(limit, offset, total, trades.length)
      );
    } catch (error) {
      next(error);
    }
  },

  async getTradesForSync(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Trade sync is not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async createTrade(req, res, next) {
    try {
      const legacyResult = await runLegacy(tradeController.createTrade, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to create trade');
      }

      const createdTrade = legacyResult.body?.trade || null;
      if (createdTrade?.id) {
        publishTradeEvent('trade.created', req, {
          tradeId: createdTrade.id,
          trade: createdTrade
        });
      }

      return res.status(legacyResult.statusCode || 201).json({
        trade: createdTrade
      });
    } catch (error) {
      next(error);
    }
  },

  async getTradeById(req, res, next) {
    try {
      const legacyResult = await runLegacy(tradeController.getTrade, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to fetch trade');
      }

      return res.status(legacyResult.statusCode || 200).json({
        trade: legacyResult.body?.trade || null
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTrade(req, res, next) {
    try {
      const legacyResult = await runLegacy(tradeController.updateTrade, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to update trade');
      }

      const updatedTrade = legacyResult.body?.trade || null;
      const tradeId = updatedTrade?.id || req.params.id;
      if (tradeId) {
        publishTradeEvent('trade.updated', req, {
          tradeId,
          trade: updatedTrade
        });
      }

      return res.status(legacyResult.statusCode || 200).json({
        trade: updatedTrade
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteTrade(req, res, next) {
    try {
      const legacyResult = await runLegacy(tradeController.deleteTrade, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to delete trade');
      }

      if (req.params.id) {
        publishTradeEvent('trade.deleted', req, {
          tradeId: req.params.id
        });
      }

      return res.status(legacyResult.statusCode || 200).json({
        deleted: true,
        message: legacyResult.body?.message || 'Trade deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  async bulkCreateTrades(req, res, next) {
    try {
      const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];

      if (trades.length === 0) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'A non-empty trades array is required');
      }

      const results = [];
      let created = 0;

      for (let index = 0; index < trades.length; index += 1) {
        const legacyResult = await runLegacy(tradeController.createTrade, req, {
          body: trades[index]
        });

        if (legacyResult.statusCode >= 400) {
          results.push({
            index,
            status: 'failed',
            error: legacyResult.body?.message || legacyResult.body?.error || 'Trade creation failed'
          });
          continue;
        }

        created += 1;
        const createdTrade = legacyResult.body?.trade || null;
        if (createdTrade?.id) {
          publishTradeEvent('trade.created', req, {
            tradeId: createdTrade.id,
            trade: createdTrade,
            bulk: true,
            index
          });
        }

        results.push({
          index,
          status: 'created',
          trade: createdTrade
        });
      }

      return res.json({
        created,
        failed: trades.length - created,
        results
      });
    } catch (error) {
      next(error);
    }
  },

  async bulkUpdateTrades(req, res, next) {
    try {
      const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];

      if (trades.length === 0) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'A non-empty trades array is required');
      }

      const results = [];
      let updated = 0;

      for (let index = 0; index < trades.length; index += 1) {
        const trade = trades[index];

        if (!trade?.id) {
          results.push({ index, status: 'failed', error: 'Trade id is required' });
          continue;
        }

        const { id, ...updates } = trade;
        const legacyResult = await runLegacy(tradeController.updateTrade, req, {
          params: { id },
          body: updates
        });

        if (legacyResult.statusCode >= 400) {
          results.push({
            index,
            tradeId: trade.id,
            status: 'failed',
            error: legacyResult.body?.message || legacyResult.body?.error || 'Trade update failed'
          });
          continue;
        }

        updated += 1;
        const updatedTrade = legacyResult.body?.trade || null;
        publishTradeEvent('trade.updated', req, {
          tradeId: trade.id,
          trade: updatedTrade,
          bulk: true,
          index
        });

        results.push({
          index,
          tradeId: trade.id,
          status: 'updated',
          trade: updatedTrade
        });
      }

      return res.json({
        updated,
        failed: trades.length - updated,
        results
      });
    } catch (error) {
      next(error);
    }
  },

  async bulkDeleteTrades(req, res, next) {
    try {
      const tradeIds = Array.isArray(req.body?.tradeIds) ? req.body.tradeIds : [];

      if (tradeIds.length === 0) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'A non-empty tradeIds array is required');
      }

      const results = [];
      let deleted = 0;

      for (let index = 0; index < tradeIds.length; index += 1) {
        const tradeId = tradeIds[index];
        const legacyResult = await runLegacy(tradeController.deleteTrade, req, {
          params: { id: tradeId }
        });

        if (legacyResult.statusCode >= 400) {
          results.push({
            index,
            tradeId,
            status: 'failed',
            error: legacyResult.body?.message || legacyResult.body?.error || 'Trade deletion failed'
          });
          continue;
        }

        deleted += 1;
        publishTradeEvent('trade.deleted', req, {
          tradeId,
          bulk: true,
          index
        });

        results.push({
          index,
          tradeId,
          status: 'deleted'
        });
      }

      return res.json({
        deleted,
        failed: tradeIds.length - deleted,
        results
      });
    } catch (error) {
      next(error);
    }
  },

  async getQuickSummary(req, res, next) {
    try {
      const [overviewResult, summaryRow] = await Promise.all([
        runLegacy(analyticsController.getOverview, req),
        queryQuickSummary(req.user.id, req.user.timezone || 'UTC')
      ]);

      if (overviewResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, overviewResult, 'Failed to build trade summary');
      }

      const overview = overviewResult.body?.overview || {};

      return res.json({
        summary: {
          totalTrades: parseInt(summaryRow.total_trades, 10) || overview.total_trades || 0,
          openTrades: parseInt(summaryRow.open_trades, 10) || 0,
          todayPnL: parseFloat(summaryRow.today_pnl) || 0,
          weekPnL: parseFloat(summaryRow.week_pnl) || 0,
          monthPnL: parseFloat(summaryRow.month_pnl) || 0,
          winRate: parseFloat(overview.win_rate) || 0,
          avgWin: parseFloat(overview.avg_win) || 0,
          avgLoss: parseFloat(overview.avg_loss) || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getRecentTrades(req, res, next) {
    try {
      const { limit } = parseLimitOffset(req.query, 10);
      const filters = {
        limit,
        offset: 0,
        symbol: req.query.symbol,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const [trades, total] = await Promise.all([
        Trade.findByUser(req.user.id, filters),
        Trade.getCountWithFilters(req.user.id, {
          symbol: req.query.symbol,
          startDate: req.query.startDate,
          endDate: req.query.endDate
        })
      ]);

      const sortedTrades = [...trades].sort(
        (a, b) => new Date(b.entry_time || b.entryTime || 0) - new Date(a.entry_time || a.entryTime || 0)
      );

      return sendV1Paginated(
        res,
        sortedTrades,
        buildPagination(limit, 0, total, sortedTrades.length)
      );
    } catch (error) {
      next(error);
    }
  }
};

module.exports = tradeV1Controller;

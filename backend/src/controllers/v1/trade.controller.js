const db = require('../../config/database');
const { fxUsd } = require('../../utils/tradeFx');
const { convertForDisplay } = require('../../utils/displayCurrency');
const Trade = require('../../models/Trade');
const TradeQueries = require('../../services/tradeQueries');
const tradeController = require('../trade.controller');
const analyticsController = require('../analytics.controller');
const { sendV1Error, sendV1ErrorFromLegacy, sendV1NotImplemented, sendV1Paginated } = require('../../utils/apiResponse');
const { captureControllerResult } = require('../../utils/legacyControllerAdapter');
const { publish } = require('../../events/domainEvents');
const { validatePayload, schemas } = require('../../middleware/validation');
const { parseTradeFilters, tradeFilterProfiles } = require('../../utils/tradeFilters');

const BULK_LIMIT = 500;

// Returns an error response when the bulk array is empty or over the cap.
// Oversized batches are rejected outright: silently truncating them would
// report success while dropping the tail of the caller's data.
function rejectInvalidBulkArray(res, items, fieldName) {
  if (items.length === 0) {
    return sendV1Error(res, 400, 'BAD_REQUEST', `A non-empty ${fieldName} array is required`);
  }
  if (items.length > BULK_LIMIT) {
    return sendV1Error(
      res,
      400,
      'BULK_LIMIT_EXCEEDED',
      `A maximum of ${BULK_LIMIT} ${fieldName} can be processed per request (received ${items.length})`
    );
  }
  return null;
}

function formatValidationError(fields) {
  return fields.map((f) => `${f.field}: ${f.message}`).join(', ');
}

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
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : defaultLimit;

  let offset;
  if (query.offset !== undefined && query.offset !== '') {
    const n = parseInt(query.offset, 10);
    offset = Number.isFinite(n) && n >= 0 ? n : 0;
  } else if (query.page !== undefined && query.page !== '') {
    const p = parseInt(query.page, 10);
    offset = Number.isFinite(p) && p > 0 ? (p - 1) * limit : 0;
  } else {
    offset = 0;
  }

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

async function queryQuickSummary(userId, timezone = 'UTC', filters = {}) {
  // Scope through the canonical trade WHERE clause so the counts and period
  // totals honor the same filters (accounts, reporting exclusions, ...) as the
  // overview figures they are merged with.
  const { whereClause, values, paramCount, needsSectorOuterJoin } =
    await TradeQueries._buildWhereClause(userId, filters);
  const tzParam = `$${paramCount}`;
  const sectorJoin = needsSectorOuterJoin ? 'LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol' : '';

  const result = await db.query(
    `
      WITH scoped AS (
        SELECT t.trade_date, t.exit_price, t.pnl AS raw_pnl,
               -- Normalized to USD before summing; the caller converts the totals
               -- to the user's display currency so they match the overview fields
               -- it merges them with.
               ${fxUsd('pnl', 't')} AS pnl
        FROM trades t
        ${sectorJoin}
        ${whereClause}
      ),
      completed AS (
        SELECT trade_date, pnl FROM scoped WHERE raw_pnl IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::integer FROM scoped) AS total_trades,
        (SELECT COUNT(*)::integer FROM scoped WHERE exit_price IS NULL) AS open_trades,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date = (NOW() AT TIME ZONE ${tzParam})::date), 0) AS today_pnl,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date >= date_trunc('week', NOW() AT TIME ZONE ${tzParam})::date), 0) AS week_pnl,
        COALESCE((SELECT SUM(pnl) FROM completed WHERE trade_date >= date_trunc('month', NOW() AT TIME ZONE ${tzParam})::date), 0) AS month_pnl
    `,
    [...values, timezone]
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
      if (createdTrade?.id && !legacyResult.body?.duplicate) {
        publishTradeEvent('trade.created', req, {
          tradeId: createdTrade.id,
          trade: createdTrade
        });
      }

      return res.status(legacyResult.statusCode || 201).json({
        trade: createdTrade,
        ...(legacyResult.body?.duplicate ? { duplicate: true } : {})
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
      const invalid = rejectInvalidBulkArray(res, trades, 'trades');
      if (invalid) return invalid;

      const results = [];
      let created = 0;
      let duplicates = 0;

      for (let index = 0; index < trades.length; index += 1) {
        // Each item gets the same validation/normalization as POST /trades.
        const { value, fields } = validatePayload(schemas.trade, trades[index]);
        if (fields) {
          results.push({ index, status: 'failed', error: formatValidationError(fields), details: fields });
          continue;
        }

        const legacyResult = await runLegacy(tradeController.createTrade, req, {
          body: value
        });

        if (legacyResult.statusCode >= 400) {
          results.push({
            index,
            status: 'failed',
            error: legacyResult.body?.message || legacyResult.body?.error || 'Trade creation failed'
          });
          continue;
        }

        const createdTrade = legacyResult.body?.trade || null;
        if (legacyResult.body?.duplicate) {
          duplicates += 1;
          results.push({ index, status: 'duplicate', trade: createdTrade });
          continue;
        }

        created += 1;
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
        duplicates,
        failed: trades.length - created - duplicates,
        results
      });
    } catch (error) {
      next(error);
    }
  },

  async bulkUpdateTrades(req, res, next) {
    try {
      const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
      const invalid = rejectInvalidBulkArray(res, trades, 'trades');
      if (invalid) return invalid;

      const results = [];
      let updated = 0;

      for (let index = 0; index < trades.length; index += 1) {
        const trade = trades[index];

        if (!trade?.id) {
          results.push({ index, status: 'failed', error: 'Trade id is required' });
          continue;
        }

        const { id, ...updates } = trade;
        // Same validation/normalization as PUT /trades/:id.
        const { value, fields } = validatePayload(schemas.updateTrade, updates);
        if (fields) {
          results.push({ index, tradeId: id, status: 'failed', error: formatValidationError(fields), details: fields });
          continue;
        }

        const legacyResult = await runLegacy(tradeController.updateTrade, req, {
          params: { id },
          body: value
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
      // `ids` is accepted as an alias: the /api-docs route annotations
      // documented it before being corrected to `tradeIds`.
      const rawIds = req.body?.tradeIds ?? req.body?.ids;
      const tradeIds = Array.isArray(rawIds) ? rawIds : [];
      const invalid = rejectInvalidBulkArray(res, tradeIds, 'tradeIds');
      if (invalid) return invalid;

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
        queryQuickSummary(
          req.user.id,
          req.user.timezone || 'UTC',
          parseTradeFilters(req.query, tradeFilterProfiles.tradeList)
        )
      ]);

      if (overviewResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, overviewResult, 'Failed to build trade summary');
      }

      const overview = overviewResult.body?.overview || {};

      // getOverview already returned its amounts in the user's display
      // currency. These period totals are still USD, so convert them the same
      // way before the two are merged - otherwise one summary object would
      // carry two currencies.
      const periodTotals = await convertForDisplay(req, {
        todayPnL: parseFloat(summaryRow.today_pnl) || 0,
        weekPnL: parseFloat(summaryRow.week_pnl) || 0,
        monthPnL: parseFloat(summaryRow.month_pnl) || 0
      }, { clone: false });

      return res.json({
        summary: {
          totalTrades: parseInt(summaryRow.total_trades, 10) || overview.total_trades || 0,
          openTrades: parseInt(summaryRow.open_trades, 10) || 0,
          todayPnL: periodTotals.todayPnL,
          weekPnL: periodTotals.weekPnL,
          monthPnL: periodTotals.monthPnL,
          winRate: parseFloat(overview.win_rate) || 0,
          avgWin: parseFloat(overview.avg_win) || 0,
          avgLoss: parseFloat(overview.avg_loss) || 0,
          currency: overviewResult.body?.display_currency || periodTotals.display_currency || 'USD'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getRecentTrades(req, res, next) {
    try {
      const { limit } = parseLimitOffset(req.query, 10);
      // Same filter parsing as the trade list so accounts, side, status, etc.
      // behave identically on both endpoints. findByUser already orders by
      // entry_time DESC.
      const baseFilters = parseTradeFilters(req.query, tradeFilterProfiles.tradeList);

      const [trades, total] = await Promise.all([
        TradeQueries.findByUser(req.user.id, { ...baseFilters, limit, offset: 0 }),
        Trade.getCountWithFilters(req.user.id, baseFilters)
      ]);

      return sendV1Paginated(
        res,
        trades,
        buildPagination(limit, 0, total, trades.length)
      );
    } catch (error) {
      next(error);
    }
  }
};

module.exports = tradeV1Controller;

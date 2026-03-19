/**
 * Bitunix Futures API Integration
 * Docs:
 * - Sign: https://www.bitunix.com/api-docs/futures/common/sign.html
 * - Account: GET /api/v1/futures/account
 * - History positions: GET /api/v1/futures/position/get_history_positions
 * - Pending positions: GET /api/v1/futures/position/get_pending_positions
 */

const axios = require('axios');
const crypto = require('crypto');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const AnalyticsCache = require('../analyticsCache');
const cache = require('../../utils/cache');
const db = require('../../config/database');

const BITUNIX_API_BASE = 'https://fapi.bitunix.com';
const DEFAULT_MARGIN_COIN = 'USDT';
const PAGE_SIZE = 100;
const STABLECOIN_TO_CURRENCY = {
  USDT: 'USD',
  USDC: 'USD',
  USD: 'USD'
};

function invalidateInMemoryCache(userId) {
  const cacheKeys = Object.keys(cache.data || {}).filter(key =>
    key.startsWith(`analytics:user_${userId}:`)
  );
  cacheKeys.forEach(key => cache.del(key));
}

class BitunixService {
  generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  buildQuerySignatureString(params = {}) {
    return Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');
  }

  buildHeaders(apiKey, apiSecret, queryParams = {}, body = '') {
    const nonce = this.generateNonce();
    const timestamp = Date.now().toString();
    const queryString = this.buildQuerySignatureString(queryParams);
    const bodyString = body || '';
    const digest = this.sha256Hex(`${nonce}${timestamp}${apiKey}${queryString}${bodyString}`);
    const sign = this.sha256Hex(`${digest}${apiSecret}`);

    return {
      'api-key': apiKey,
      nonce,
      timestamp,
      sign,
      language: 'en-US',
      'Content-Type': 'application/json'
    };
  }

  async request({ apiKey, apiSecret, method = 'GET', path, query = {}, body = null }) {
    const compactBody = body ? JSON.stringify(body) : '';
    const headers = this.buildHeaders(apiKey, apiSecret, query, compactBody);

    const response = await axios({
      method,
      url: `${BITUNIX_API_BASE}${path}`,
      params: query,
      data: body || undefined,
      headers,
      timeout: 30000
    });

    if (response.data?.code !== 0) {
      throw new Error(response.data?.msg || `Bitunix API request failed (${response.data?.code ?? 'unknown'})`);
    }

    return response.data;
  }

  async validateCredentials(apiKey, apiSecret, marginCoin = DEFAULT_MARGIN_COIN) {
    const normalizedMarginCoin = String(marginCoin || DEFAULT_MARGIN_COIN).toUpperCase();
    try {
      await this.request({
        apiKey,
        apiSecret,
        path: '/api/v1/futures/account',
        query: { marginCoin: normalizedMarginCoin }
      });

      return { valid: true, message: 'Bitunix credentials validated successfully' };
    } catch (error) {
      console.error('[BITUNIX] Credential validation failed:', error.message);
      return { valid: false, message: error.message };
    }
  }

  async getHistoryPositions(apiKey, apiSecret, { startDate, endDate } = {}) {
    const positions = [];
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
      const query = {
        skip,
        limit: PAGE_SIZE
      };

      if (startDate) {
        query.startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();
      }
      if (endDate) {
        query.endTime = new Date(`${endDate}T23:59:59.999Z`).getTime();
      }

      const result = await this.request({
        apiKey,
        apiSecret,
        path: '/api/v1/futures/position/get_history_positions',
        query
      });

      const page = result.data?.positionList || [];
      total = Number(result.data?.total || page.length);
      positions.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }

      skip += page.length;
    }

    return positions;
  }

  async getPendingPositions(apiKey, apiSecret) {
    const result = await this.request({
      apiKey,
      apiSecret,
      path: '/api/v1/futures/position/get_pending_positions'
    });

    return Array.isArray(result.data) ? result.data : [];
  }

  normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
  }

  normalizeOriginalCurrency(marginCoin) {
    const normalizedMarginCoin = String(marginCoin || DEFAULT_MARGIN_COIN).trim().toUpperCase();
    return STABLECOIN_TO_CURRENCY[normalizedMarginCoin] || (normalizedMarginCoin.length <= 3 ? normalizedMarginCoin : 'USD');
  }

  normalizePositionSide(sideValue) {
    const normalizedSide = String(sideValue || '').trim().toUpperCase();

    if (normalizedSide === 'SHORT' || normalizedSide === 'SELL') {
      return 'short';
    }

    if (normalizedSide === 'LONG' || normalizedSide === 'BUY') {
      return 'long';
    }

    return 'long';
  }

  toIsoString(timestamp) {
    if (!timestamp) return null;
    const date = new Date(Number(timestamp));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  toTradeDate(value) {
    const iso = this.toIsoString(value);
    return iso ? iso.split('T')[0] : null;
  }

  parseClosedPosition(position, marginCoin) {
    const side = this.normalizePositionSide(position.side);
    const quantity = Math.abs(parseFloat(position.maxQty || 0));
    const entryTime = this.toIsoString(position.ctime);
    const exitTime = this.toIsoString(position.mtime);
    const originalCurrency = this.normalizeOriginalCurrency(marginCoin);

    if (!position.positionId || !position.symbol || !quantity || !entryTime) {
      return null;
    }

    return {
      symbol: this.normalizeSymbol(position.symbol),
      side,
      quantity,
      entryPrice: parseFloat(position.entryPrice || 0) || null,
      exitPrice: parseFloat(position.closePrice || 0) || null,
      entryTime,
      exitTime,
      tradeDate: this.toTradeDate(position.mtime || position.ctime),
      commission: Math.abs(parseFloat(position.fee || 0)),
      fees: Math.abs(parseFloat(position.funding || 0)),
      pnl: parseFloat(position.realizedPNL || 0),
      broker: 'bitunix',
      originalCurrency,
      accountIdentifier: `bitunix-${marginCoin.toLowerCase()}`,
      executionData: [
        {
          type: 'entry',
          datetime: entryTime,
          price: parseFloat(position.entryPrice || 0) || null,
          quantity,
          side,
          positionId: String(position.positionId)
        },
        {
          type: 'exit',
          datetime: exitTime,
          price: parseFloat(position.closePrice || 0) || null,
          quantity,
          side,
          positionId: String(position.positionId)
        }
      ]
    };
  }

  parsePendingPosition(position, marginCoin) {
    const side = this.normalizePositionSide(position.side);
    const quantity = Math.abs(parseFloat(position.qty || 0));
    const entryTime = this.toIsoString(position.ctime);
    const originalCurrency = this.normalizeOriginalCurrency(marginCoin);

    if (!position.positionId || !position.symbol || !quantity || !entryTime) {
      return null;
    }

    return {
      symbol: this.normalizeSymbol(position.symbol),
      side,
      quantity,
      entryPrice: parseFloat(position.avgOpenPrice || 0) || null,
      exitPrice: null,
      entryTime,
      exitTime: null,
      tradeDate: this.toTradeDate(position.ctime),
      commission: Math.abs(parseFloat(position.fee || 0)),
      fees: Math.abs(parseFloat(position.funding || 0)),
      pnl: null,
      broker: 'bitunix',
      originalCurrency,
      accountIdentifier: `bitunix-${marginCoin.toLowerCase()}`,
      executionData: [
        {
          type: 'entry',
          datetime: entryTime,
          price: parseFloat(position.avgOpenPrice || 0) || null,
          quantity,
          side,
          positionId: String(position.positionId)
        }
      ]
    };
  }

  parsePositions(historyPositions, pendingPositions, marginCoin) {
    const closedTrades = historyPositions
      .map(position => this.parseClosedPosition(position, marginCoin))
      .filter(Boolean);

    const openTrades = pendingPositions
      .map(position => this.parsePendingPosition(position, marginCoin))
      .filter(Boolean);

    return [...closedTrades, ...openTrades];
  }

  getTradeDateRange(trades) {
    const dates = trades
      .map(trade => trade.tradeDate || trade.exitTime?.split('T')[0] || trade.entryTime?.split('T')[0])
      .filter(Boolean)
      .sort();

    if (dates.length === 0) {
      return { minDate: null, maxDate: null };
    }

    return {
      minDate: dates[0],
      maxDate: dates[dates.length - 1]
    };
  }

  async getExistingTrades(userId, incomingTrades = []) {
    if (!Array.isArray(incomingTrades) || incomingTrades.length === 0) {
      return [];
    }

    const { minDate, maxDate } = this.getTradeDateRange(incomingTrades);
    const params = [userId];

    let query = `
      SELECT symbol, side, quantity, entry_price, exit_price, entry_time, exit_time,
             executions, trade_date, pnl, account_identifier
      FROM trades
      WHERE user_id = $1
    `;

    if (minDate && maxDate) {
      params.push(minDate, maxDate);
      query += `
        AND trade_date >= $2
        AND trade_date <= $3
      `;
    }

    query += `
      ORDER BY trade_date DESC, entry_time DESC
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  extractPositionIds(executions) {
    let normalized = executions;
    if (typeof normalized === 'string') {
      try {
        normalized = JSON.parse(normalized);
      } catch {
        normalized = [];
      }
    }

    if (!Array.isArray(normalized)) {
      return new Set();
    }

    return new Set(
      normalized
        .map(exec => exec?.positionId)
        .filter(Boolean)
        .map(String)
    );
  }

  isDuplicateTrade(newTrade, existingTrades) {
    const newPositionIds = this.extractPositionIds(newTrade.executionData || []);

    for (const existing of existingTrades) {
      if (String(existing.symbol || '').toUpperCase() !== String(newTrade.symbol || '').toUpperCase()) {
        continue;
      }

      if (
        newTrade.accountIdentifier &&
        existing.account_identifier &&
        newTrade.accountIdentifier !== existing.account_identifier
      ) {
        continue;
      }

      const existingPositionIds = this.extractPositionIds(existing.executions);
      if (newPositionIds.size > 0) {
        for (const positionId of newPositionIds) {
          if (existingPositionIds.has(positionId)) {
            return true;
          }
        }
      }

      const sameTradeDate = (existing.trade_date?.toISOString?.().split('T')[0] || String(existing.trade_date || '').split('T')[0]) === newTrade.tradeDate;
      const sameSide = existing.side === newTrade.side;
      const sameQty = Math.abs((parseFloat(existing.quantity) || 0) - (parseFloat(newTrade.quantity) || 0)) < 0.000001;
      const sameEntry = Math.abs((parseFloat(existing.entry_price) || 0) - (parseFloat(newTrade.entryPrice) || 0)) < 0.000001;
      const sameExit = Math.abs((parseFloat(existing.exit_price) || 0) - (parseFloat(newTrade.exitPrice) || 0)) < 0.000001;

      if (sameTradeDate && sameSide && sameQty && sameEntry && sameExit) {
        return true;
      }
    }

    return false;
  }

  async importTrades(userId, connectionId, trades) {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let duplicates = 0;

    const existingTrades = await this.getExistingTrades(userId, trades);

    for (const tradeData of trades) {
      try {
        if (this.isDuplicateTrade(tradeData, existingTrades)) {
          duplicates++;
          continue;
        }

        tradeData.brokerConnectionId = connectionId;

        await Trade.create(userId, tradeData, {
          skipAchievements: true,
          skipApiCalls: true
        });

        imported++;

        existingTrades.push({
          symbol: tradeData.symbol,
          side: tradeData.side,
          quantity: tradeData.quantity,
          entry_price: tradeData.entryPrice,
          exit_price: tradeData.exitPrice,
          entry_time: tradeData.entryTime,
          exit_time: tradeData.exitTime,
          trade_date: tradeData.tradeDate,
          pnl: tradeData.pnl,
          account_identifier: tradeData.accountIdentifier,
          executions: tradeData.executionData || []
        });
      } catch (error) {
        console.error('[BITUNIX] Failed to import trade:', error.message);
        failed++;
      }
    }

    if (imported > 0) {
      await AnalyticsCache.invalidateUserCache(userId);
      invalidateInMemoryCache(userId);
    }

    return { imported, skipped, failed, duplicates };
  }

  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;
    const marginCoin = String(connection.bitunixMarginCoin || DEFAULT_MARGIN_COIN).toUpperCase();

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    }

    const [historyPositions, pendingPositions] = await Promise.all([
      this.getHistoryPositions(connection.bitunixApiKey, connection.bitunixApiSecret, { startDate, endDate }),
      this.getPendingPositions(connection.bitunixApiKey, connection.bitunixApiSecret)
    ]);

    const trades = this.parsePositions(historyPositions, pendingPositions, marginCoin);

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing', {
        tradesFetched: trades.length
      });
    }

    return this.importTrades(connection.userId, connection.id, trades);
  }
}

module.exports = new BitunixService();

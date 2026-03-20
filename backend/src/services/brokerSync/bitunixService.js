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
const BITUNIX_SPOT_API_BASE = 'https://openapi.bitunix.com';
const DEFAULT_MARGIN_COIN = 'USDT';
const FUNDING_HISTORY_START_DATE = '2020-01-01T00:00:00.000Z';
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
  constructor() {
    this.orderIntentByPositionSide = {
      long: {
        scale_in: 'BUY',
        reduce: 'SELL'
      },
      short: {
        scale_in: 'SELL',
        reduce: 'BUY'
      }
    };
  }

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

  async request({ apiKey, apiSecret, method = 'GET', path, query = {}, body = null, baseURL = BITUNIX_API_BASE }) {
    const compactBody = body ? JSON.stringify(body) : '';
    const headers = this.buildHeaders(apiKey, apiSecret, query, compactBody);

    const response = await axios({
      method,
      url: `${baseURL}${path}`,
      params: query,
      data: body || undefined,
      headers,
      timeout: 30000
    });

    if (String(response.data?.code) !== '0') {
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

  async getPendingOrders(apiKey, apiSecret) {
    const orders = [];
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
      const result = await this.request({
        apiKey,
        apiSecret,
        path: '/api/v1/futures/trade/get_pending_orders',
        query: {
          skip,
          limit: PAGE_SIZE
        }
      });

      const page = result.data?.orderList || [];
      total = Number(result.data?.total || page.length);
      orders.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }

      skip += page.length;
    }

    return orders;
  }

  async getPendingTpSlOrders(apiKey, apiSecret) {
    const orders = [];
    let skip = 0;

    while (true) {
      const result = await this.request({
        apiKey,
        apiSecret,
        path: '/api/v1/futures/tpsl/get_pending_orders',
        query: {
          skip,
          limit: PAGE_SIZE
        }
      });

      const page = Array.isArray(result.data) ? result.data : [];
      orders.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }

      skip += page.length;
    }

    return orders;
  }

  async getHistoryTrades(apiKey, apiSecret, { startDate, endDate } = {}) {
    const trades = [];
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
        path: '/api/v1/futures/trade/get_history_trades',
        query
      });

      const data = result.data;
      const page = Array.isArray(data)
        ? data
        : (data?.tradeList || data?.orderList || data?.list || []);
      total = Number(data?.total || page.length);
      trades.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }

      skip += page.length;
    }

    return trades;
  }

  async getDepositRecords(apiKey, apiSecret, { coin, startTime, endTime, limit = 100 } = {}) {
    const body = {
      coin,
      limit
    };

    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;

    const result = await this.request({
      apiKey,
      apiSecret,
      method: 'POST',
      path: '/api/spot/v1/deposit/page',
      body,
      baseURL: BITUNIX_SPOT_API_BASE
    });

    return Array.isArray(result.data) ? result.data : [];
  }

  async getWithdrawalRecords(apiKey, apiSecret, { coin, startTime, endTime, limit = 100 } = {}) {
    const body = {
      coin,
      limit
    };

    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;

    const result = await this.request({
      apiKey,
      apiSecret,
      method: 'POST',
      path: '/api/spot/v1/withdraw_transfer/page',
      body,
      baseURL: BITUNIX_SPOT_API_BASE
    });

    return Array.isArray(result.data) ? result.data : [];
  }

  async syncFundingHistoryForAccount({ userId, accountId, connection, account }) {
    const marginCoin = String(connection?.bitunixMarginCoin || DEFAULT_MARGIN_COIN).toUpperCase();
    // Funding is authoritative broker data, so always fetch the full known history
    // and dedupe locally. This avoids permanently missing older deposits when an
    // account was created with a late manual initial balance date.
    const startDate = new Date(FUNDING_HISTORY_START_DATE);
    const startTime = startDate.getTime();
    const endTime = Date.now();

    const [deposits, withdrawals] = await Promise.all([
      this.getDepositRecords(connection.bitunixApiKey, connection.bitunixApiSecret, {
        coin: marginCoin,
        startTime,
        endTime
      }),
      this.getWithdrawalRecords(connection.bitunixApiKey, connection.bitunixApiSecret, {
        coin: marginCoin,
        startTime,
        endTime
      })
    ]);

    const fundingEvents = [
      ...deposits
        .filter(record =>
          record &&
          String(record.status || '').toLowerCase() === 'success' &&
          String(record.type || '').toLowerCase() === 'deposit' &&
          String(record.coin || '').toUpperCase() === marginCoin
        )
        .map(record => ({
          transactionType: 'deposit',
          amount: parseFloat(record.amount) || 0,
          transactionDate: new Date(Number(record.ctime)).toISOString().slice(0, 10),
          description: `[BITUNIX FUNDING] Deposit ${record.id}`,
          sourceId: String(record.id)
        })),
      ...withdrawals
        .filter(record =>
          record &&
          String(record.status || '').toLowerCase() === 'success' &&
          String(record.type || '').toLowerCase() === 'withdraw' &&
          String(record.coin || '').toUpperCase() === marginCoin
        )
        .map(record => ({
          transactionType: 'withdrawal',
          amount: parseFloat(record.amount) || 0,
          transactionDate: new Date(Number(record.ctime)).toISOString().slice(0, 10),
          description: `[BITUNIX FUNDING] Withdrawal ${record.id}`,
          sourceId: String(record.id)
        }))
    ]
      .filter(event => event.amount > 0 && event.transactionDate)
      .sort((a, b) => new Date(a.transactionDate) - new Date(b.transactionDate));

    const client = await db.connect();
    let insertedCount = 0;
    const existingInitialBalance = parseFloat(
      account?.initial_balance ?? account?.initialBalance ?? 0
    ) || 0;
    const existingInitialBalanceDate = account?.initial_balance_date || account?.initialBalanceDate || null;
    let hasManualBaseline = Math.abs(existingInitialBalance) > 0.000001;

    try {
      await client.query('BEGIN');

      const existingFundingResult = await client.query(
        `SELECT description
         FROM account_transactions
         WHERE user_id = $1
           AND account_id = $2
           AND description LIKE '[BITUNIX FUNDING]%'`,
        [userId, accountId]
      );

      const existingDescriptions = new Set(
        existingFundingResult.rows.map(row => row.description)
      );

      const nonBrokerFundingTransactionsResult = await client.query(
        `SELECT COUNT(*)::integer AS count
         FROM account_transactions
         WHERE user_id = $1
           AND account_id = $2
           AND (
             description IS NULL
             OR description !~ '^\\[[^]]+ FUNDING\\]'
           )`,
        [userId, accountId]
      );

      hasManualBaseline =
        hasManualBaseline ||
        Number(nonBrokerFundingTransactionsResult.rows[0]?.count || 0) > 0;

      for (const event of fundingEvents) {
        if (existingDescriptions.has(event.description)) {
          continue;
        }

        await client.query(
          `INSERT INTO account_transactions (
             user_id, account_id, transaction_type, amount, transaction_date, description
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            accountId,
            event.transactionType,
            event.amount,
            event.transactionDate,
            event.description
          ]
        );

        existingDescriptions.add(event.description);
        insertedCount++;
      }

      if (fundingEvents.length > 0 && !hasManualBaseline) {
        const firstFundingDate = fundingEvents[0].transactionDate;
        await client.query(
          `UPDATE user_accounts
           SET initial_balance_date = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND user_id = $2`,
          [accountId, userId, firstFundingDate]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      marginCoin,
      insertedCount,
      depositsImported: fundingEvents.filter(event => event.transactionType === 'deposit').length,
      withdrawalsImported: fundingEvents.filter(event => event.transactionType === 'withdrawal').length,
      totalDeposited: fundingEvents
        .filter(event => event.transactionType === 'deposit')
        .reduce((sum, event) => sum + event.amount, 0),
      totalWithdrawn: fundingEvents
        .filter(event => event.transactionType === 'withdrawal')
        .reduce((sum, event) => sum + event.amount, 0),
      earliestFundingDate: fundingEvents[0]?.transactionDate || null,
      preservedInitialBalance: Math.abs(existingInitialBalance) > 0.000001,
      preservedInitialBalanceDate: Boolean(existingInitialBalanceDate),
      skippedBaselineReset: hasManualBaseline
    };
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

  normalizeOrderSide(sideValue) {
    const normalizedSide = String(sideValue || '').trim().toUpperCase();

    if (normalizedSide === 'SELL' || normalizedSide === 'SHORT') {
      return 'sell';
    }

    if (normalizedSide === 'BUY' || normalizedSide === 'LONG') {
      return 'buy';
    }

    return 'buy';
  }

  getExpectedActionsForPositionSide(positionSide) {
    return this.orderIntentByPositionSide[positionSide] || this.orderIntentByPositionSide.long;
  }

  determineFillAction(positionSide, fill = {}) {
    const expectedActions = this.getExpectedActionsForPositionSide(positionSide);
    const normalizedFillSide = this.normalizeOrderSide(fill.side);

    if (normalizedFillSide === expectedActions.scale_in.toLowerCase()) {
      return normalizedFillSide;
    }

    if (normalizedFillSide === expectedActions.reduce.toLowerCase()) {
      return normalizedFillSide;
    }

    if (this.parseBoolean(fill.reduceOnly)) {
      return expectedActions.reduce.toLowerCase();
    }

    return expectedActions.scale_in.toLowerCase();
  }

  determineFillType(positionSide, fill = {}) {
    const action = this.determineFillAction(positionSide, fill);
    const expectedActions = this.getExpectedActionsForPositionSide(positionSide);
    return action === expectedActions.reduce.toLowerCase() ? 'exit' : 'entry';
  }

  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
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

  parsePendingOrder(order) {
    if (!order?.orderId || !order?.symbol) {
      return null;
    }

    return {
      orderId: String(order.orderId),
      symbol: this.normalizeSymbol(order.symbol),
      side: this.normalizeOrderSide(order.side),
      quantity: this.parseNumber(order.qty),
      filledQuantity: this.parseNumber(order.tradeQty),
      remainingQuantity: Math.max(
        0,
        (this.parseNumber(order.qty) || 0) - (this.parseNumber(order.tradeQty) || 0)
      ),
      price: this.parseNumber(order.price),
      status: order.status || null,
      orderType: order.orderType || order.type || null,
      effect: order.effect || null,
      reduceOnly: this.parseBoolean(order.reduceOnly),
      leverage: this.parseNumber(order.leverage),
      marginMode: order.marginMode || null,
      positionMode: order.positionMode || null,
      tpPrice: this.parseNumber(order.tpPrice),
      tpStopType: order.tpStopType || null,
      tpOrderType: order.tpOrderType || null,
      tpOrderPrice: this.parseNumber(order.tpOrderPrice),
      slPrice: this.parseNumber(order.slPrice),
      slStopType: order.slStopType || null,
      slOrderType: order.slOrderType || null,
      slOrderPrice: this.parseNumber(order.slOrderPrice),
      createdAt: this.toIsoString(order.ctime),
      updatedAt: this.toIsoString(order.mtime),
      source: 'pending_order'
    };
  }

  parsePendingTpSlOrder(order) {
    if (!order?.id || !order?.positionId || !order?.symbol) {
      return null;
    }

    return {
      id: String(order.id),
      positionId: String(order.positionId),
      symbol: this.normalizeSymbol(order.symbol),
      tpPrice: this.parseNumber(order.tpPrice),
      tpStopType: order.tpStopType || null,
      tpOrderType: order.tpOrderType || null,
      tpOrderPrice: this.parseNumber(order.tpOrderPrice),
      tpQty: this.parseNumber(order.tpQty),
      slPrice: this.parseNumber(order.slPrice),
      slStopType: order.slStopType || null,
      slOrderType: order.slOrderType || null,
      slOrderPrice: this.parseNumber(order.slOrderPrice),
      slQty: this.parseNumber(order.slQty),
      source: 'position_tpsl'
    };
  }

  buildPendingOrdersIndex(pendingOrders) {
    return pendingOrders
      .map(order => this.parsePendingOrder(order))
      .filter(Boolean)
      .reduce((acc, order) => {
        const key = order.symbol;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(order);
        return acc;
      }, {});
  }

  buildPendingTpSlIndex(pendingTpSlOrders) {
    return pendingTpSlOrders
      .map(order => this.parsePendingTpSlOrder(order))
      .filter(Boolean)
      .reduce((acc, order) => {
        const key = order.positionId;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(order);
        return acc;
      }, {});
  }

  getRelevantPendingOrders(position, pendingOrdersIndex) {
    const symbol = this.normalizeSymbol(position.symbol);
    const side = this.normalizePositionSide(position.side);
    const expectedActions = this.orderIntentByPositionSide[side] || this.orderIntentByPositionSide.long;
    const orders = pendingOrdersIndex[symbol] || [];

    return orders
      .filter(order => {
        if (!order?.side) return false;
        if (order.reduceOnly) {
          return order.side.toUpperCase() === expectedActions.reduce;
        }
        return order.side.toUpperCase() === expectedActions.scale_in;
      })
      .map(order => ({
        ...order,
        intent: order.reduceOnly ? 'reduce' : 'scale_in'
      }));
  }

  buildPositionTargets(positionTpSlOrders = [], relevantPendingOrders = []) {
    const takeProfitTargets = [];
    let stopLoss = null;
    let takeProfit = null;

    positionTpSlOrders.forEach(order => {
      if (stopLoss === null && order.slPrice !== null) {
        stopLoss = order.slPrice;
      }
      if (order.tpPrice !== null) {
        takeProfitTargets.push({
          price: order.tpPrice,
          shares: order.tpQty || null,
          orderType: order.tpOrderType || null,
          orderPrice: order.tpOrderPrice || null,
          stopType: order.tpStopType || null,
          source: order.source
        });
      }
    });

    relevantPendingOrders.forEach(order => {
      if (stopLoss === null && order.slPrice !== null) {
        stopLoss = order.slPrice;
      }
      if (order.tpPrice !== null) {
        takeProfitTargets.push({
          price: order.tpPrice,
          shares: order.remainingQuantity || order.quantity || null,
          orderType: order.tpOrderType || null,
          orderPrice: order.tpOrderPrice || null,
          stopType: order.tpStopType || null,
          source: order.source
        });
      }
    });

    const dedupedTakeProfitTargets = takeProfitTargets.filter((target, index, list) =>
      list.findIndex(candidate =>
        candidate.price === target.price &&
        candidate.shares === target.shares &&
        candidate.orderType === target.orderType &&
        candidate.source === target.source
      ) === index
    );

    if (dedupedTakeProfitTargets.length > 0) {
      takeProfit = dedupedTakeProfitTargets[0].price;
    }

    return {
      stopLoss,
      takeProfit,
      takeProfitTargets: dedupedTakeProfitTargets
    };
  }

  calculatePositionPnl(entryPrice, exitPrice, quantity, side) {
    const parsedEntry = this.parseNumber(entryPrice);
    const parsedExit = this.parseNumber(exitPrice);
    const parsedQty = this.parseNumber(quantity);

    if (parsedEntry === null || parsedExit === null || parsedQty === null) {
      return null;
    }

    if (side === 'short') {
      return (parsedEntry - parsedExit) * parsedQty;
    }

    return (parsedExit - parsedEntry) * parsedQty;
  }

  parseHistoryTradeFill(fill, positionSide, fallbackMeta = {}, forcedPositionId = null) {
    const positionId = forcedPositionId || (fill?.positionId ? String(fill.positionId) : null);
    const quantity = Math.abs(this.parseNumber(fill?.qty) || 0);
    const price = this.parseNumber(fill?.price);
    const datetime = this.toIsoString(fill?.ctime || fill?.mtime);

    if (!quantity || price === null || !datetime) {
      return null;
    }

    const action = this.determineFillAction(positionSide, fill);
    const type = this.determineFillType(positionSide, fill);

    return {
      type,
      action,
      side: positionSide,
      datetime,
      price,
      quantity,
      positionId,
      tradeId: fill?.tradeId ? String(fill.tradeId) : null,
      orderId: fill?.orderId ? String(fill.orderId) : null,
      reduceOnly: this.parseBoolean(fill?.reduceOnly),
      fee: this.parseNumber(fill?.fee),
      fees: Math.abs(this.parseNumber(fill?.fee) || 0),
      realizedPnl: this.parseNumber(fill?.realizedPNL),
      leverage: fallbackMeta.leverage ?? null,
      marginMode: fallbackMeta.marginMode ?? null,
      positionMode: fallbackMeta.positionMode ?? null,
      liquidationPrice: fallbackMeta.liquidationPrice ?? null
    };
  }

  buildHistoryTradesIndex(historyTrades = [], historyPositions = []) {
    const positionMetaIndex = historyPositions.reduce((acc, position) => {
      if (!position?.positionId) {
        return acc;
      }

      acc[String(position.positionId)] = {
        side: this.normalizePositionSide(position.side),
        leverage: this.parseNumber(position.leverage),
        marginMode: position.marginMode || null,
        positionMode: position.positionMode || null,
        liquidationPrice: this.parseNumber(position.liqPrice)
      };
      return acc;
    }, {});

    const historyTradeIndex = {};
    const unmatchedFills = [];

    historyTrades.forEach(fill => {
      if (fill?.positionId) {
        const positionId = String(fill.positionId);
        const positionMeta = positionMetaIndex[positionId];
        if (positionMeta?.side) {
          const parsedFill = this.parseHistoryTradeFill(fill, positionMeta.side, positionMeta, positionId);
          if (parsedFill) {
            if (!historyTradeIndex[positionId]) {
              historyTradeIndex[positionId] = [];
            }
            historyTradeIndex[positionId].push(parsedFill);
            return;
          }
        }
      }

      unmatchedFills.push(fill);
    });

    const availableFills = unmatchedFills
      .map((fill, index) => ({ fill, index }))
      .filter(({ fill }) => fill?.symbol && fill?.ctime);

    const sortedPositions = [...historyPositions]
      .filter(position => position?.positionId && position?.symbol && position?.ctime && position?.mtime)
      .sort((a, b) => Number(a.ctime) - Number(b.ctime));

    sortedPositions.forEach(position => {
      const positionId = String(position.positionId);
      if (historyTradeIndex[positionId]?.length) {
        return;
      }

      const positionMeta = positionMetaIndex[positionId];
      if (!positionMeta?.side) {
        return;
      }

      const positionSymbol = this.normalizeSymbol(position.symbol);
      const entryTime = Number(position.ctime);
      const exitTime = Number(position.mtime);
      const quantity = Math.abs(this.parseNumber(position.maxQty) || 0);
      const tolerance = 60 * 1000;

      const matched = [];
      for (let i = availableFills.length - 1; i >= 0; i--) {
        const candidate = availableFills[i];
        const fill = candidate.fill;
        const fillTime = Number(fill.ctime || fill.mtime);
        const sameSymbol = this.normalizeSymbol(fill.symbol) === positionSymbol;

        if (!sameSymbol || !Number.isFinite(fillTime)) {
          continue;
        }

        if (fillTime < entryTime - tolerance || fillTime > exitTime + tolerance) {
          continue;
        }

        matched.push(candidate);
        availableFills.splice(i, 1);
      }

      if (!matched.length) {
        return;
      }

      const parsedFills = matched
        .sort((a, b) => Number(a.fill.ctime || a.fill.mtime) - Number(b.fill.ctime || b.fill.mtime))
        .map(({ fill }) => this.parseHistoryTradeFill(fill, positionMeta.side, positionMeta, positionId))
        .filter(Boolean);

      if (!parsedFills.length) {
        return;
      }

      const totalEntryQty = parsedFills
        .filter(fill => fill.type === 'entry')
        .reduce((sum, fill) => sum + (fill.quantity || 0), 0);
      const totalExitQty = parsedFills
        .filter(fill => fill.type === 'exit')
        .reduce((sum, fill) => sum + (fill.quantity || 0), 0);

      const hasReasonableCoverage =
        quantity === 0 ||
        totalEntryQty > 0 ||
        totalExitQty > 0;

      if (hasReasonableCoverage) {
        historyTradeIndex[positionId] = parsedFills;
      }
    });

    return historyTradeIndex;
  }

  buildClosedPositionExecutions(position, fallbackExecutions = [], historyTradeIndex = {}) {
    const positionId = position?.positionId ? String(position.positionId) : null;
    const fills = positionId ? (historyTradeIndex[positionId] || []) : [];

    if (!fills.length) {
      return fallbackExecutions;
    }

    const sortedFills = [...fills].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const entryFills = sortedFills.filter(fill => fill.type === 'entry');
    const exitFills = sortedFills.filter(fill => fill.type === 'exit');

    if (entryFills.length > 0 && exitFills.length > 0) {
      return sortedFills;
    }

    return [
      ...fallbackExecutions.filter(exec => exec.type === 'entry'),
      ...sortedFills,
      ...fallbackExecutions.filter(exec => exec.type === 'exit')
    ];
  }

  parseClosedPosition(position, marginCoin, historyTradeIndex = {}) {
    const side = this.normalizePositionSide(position.side);
    const quantity = Math.abs(parseFloat(position.maxQty || 0));
    const entryTime = this.toIsoString(position.ctime);
    const exitTime = this.toIsoString(position.mtime);
    const originalCurrency = this.normalizeOriginalCurrency(marginCoin);
    const tradingFees = Math.abs(parseFloat(position.fee || 0));
    const fundingFees = Math.abs(parseFloat(position.funding || 0));
    const entryPrice = this.parseNumber(position.entryPrice);
    const exitPrice = this.parseNumber(position.closePrice);
    const leverage = this.parseNumber(position.leverage);
    const notionalValue = quantity && entryPrice !== null
      ? quantity * entryPrice
      : null;
    const marginUsed = leverage && leverage > 0 && notionalValue !== null
      ? notionalValue / leverage
      : null;
    const netPnl = this.parseNumber(position.realizedPNL);
    const positionPnl = this.calculatePositionPnl(entryPrice, exitPrice, quantity, side);
    const pnlPercent = marginUsed && marginUsed > 0 && netPnl !== null
      ? (netPnl / marginUsed) * 100
      : null;

    if (!position.positionId || !position.symbol || !quantity || !entryTime) {
      return null;
    }

    const fallbackExecutions = [
      {
        type: 'entry',
        action: side === 'short' ? 'sell' : 'buy',
        datetime: entryTime,
        price: entryPrice,
        quantity,
        side,
        positionId: String(position.positionId),
        leverage,
        notionalValue,
        marginUsed,
        positionPnl,
        netPnl,
        marginMode: position.marginMode || null,
        positionMode: position.positionMode || null,
        liquidationPrice: this.parseNumber(position.liqPrice)
      },
      {
        type: 'exit',
        action: side === 'short' ? 'buy' : 'sell',
        datetime: exitTime,
        price: exitPrice,
        quantity,
        side,
        positionId: String(position.positionId),
        leverage,
        notionalValue,
        marginUsed,
        positionPnl,
        netPnl,
        marginMode: position.marginMode || null,
        positionMode: position.positionMode || null,
        liquidationPrice: this.parseNumber(position.liqPrice)
      }
    ];

    return {
      symbol: this.normalizeSymbol(position.symbol),
      side,
      quantity,
      entryPrice,
      exitPrice,
      entryTime,
      exitTime,
      tradeDate: this.toTradeDate(position.mtime || position.ctime),
      commission: 0,
      fees: tradingFees + fundingFees,
      pnl: netPnl,
      pnlPercent,
      broker: 'bitunix',
      instrumentType: 'crypto',
      originalCurrency,
      accountIdentifier: `bitunix-${marginCoin.toLowerCase()}`,
      stopLoss: null,
      takeProfit: null,
      takeProfitTargets: [],
      executionData: this.buildClosedPositionExecutions(position, fallbackExecutions, historyTradeIndex)
    };
  }

  parsePendingPosition(position, marginCoin, pendingOrdersIndex = {}, pendingTpSlIndex = {}) {
    const side = this.normalizePositionSide(position.side);
    const quantity = Math.abs(parseFloat(position.qty || 0));
    const entryTime = this.toIsoString(position.ctime);
    const originalCurrency = this.normalizeOriginalCurrency(marginCoin);
    const tradingFees = Math.abs(parseFloat(position.fee || 0));
    const fundingFees = Math.abs(parseFloat(position.funding || 0));
    const positionId = String(position.positionId);
    const relevantPendingOrders = this.getRelevantPendingOrders(position, pendingOrdersIndex);
    const positionTpSlOrders = pendingTpSlIndex[positionId] || [];
    const { stopLoss, takeProfit, takeProfitTargets } = this.buildPositionTargets(positionTpSlOrders, relevantPendingOrders);
    const leverage = this.parseNumber(position.leverage);
    const notionalValue = this.parseNumber(position.entryValue) !== null
      ? this.parseNumber(position.entryValue)
      : (quantity && this.parseNumber(position.avgOpenPrice) !== null
        ? quantity * this.parseNumber(position.avgOpenPrice)
        : null);
    const marginUsed = this.parseNumber(position.margin) !== null
      ? this.parseNumber(position.margin)
      : (leverage && leverage > 0 && notionalValue !== null ? notionalValue / leverage : null);

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
      commission: 0,
      fees: tradingFees + fundingFees,
      pnl: null,
      broker: 'bitunix',
      instrumentType: 'crypto',
      originalCurrency,
      accountIdentifier: `bitunix-${marginCoin.toLowerCase()}`,
      stopLoss,
      takeProfit,
      takeProfitTargets,
      executionData: [
        {
          type: 'entry',
          action: side === 'short' ? 'sell' : 'buy',
          datetime: entryTime,
          price: parseFloat(position.avgOpenPrice || 0) || null,
          quantity,
          side,
          positionId,
          leverage,
          notionalValue,
          marginUsed,
          unrealizedPnl: this.parseNumber(position.unrealizedPNL),
          realizedPnl: this.parseNumber(position.realizedPNL),
          liquidationPrice: this.parseNumber(position.liqPrice),
          marginRate: this.parseNumber(position.marginRate),
          marginMode: position.marginMode || null,
          positionMode: position.positionMode || null,
          pendingOrders: relevantPendingOrders,
          positionTpSlOrders
        }
      ]
    };
  }

  parsePositions(historyPositions, pendingPositions, pendingOrders, pendingTpSlOrders, marginCoin, historyTrades = []) {
    const pendingOrdersIndex = this.buildPendingOrdersIndex(pendingOrders);
    const pendingTpSlIndex = this.buildPendingTpSlIndex(pendingTpSlOrders);
    const historyTradeIndex = this.buildHistoryTradesIndex(historyTrades, historyPositions);

    const closedTrades = historyPositions
      .map(position => this.parseClosedPosition(position, marginCoin, historyTradeIndex))
      .filter(Boolean);

    const openTrades = pendingPositions
      .map(position => this.parsePendingPosition(position, marginCoin, pendingOrdersIndex, pendingTpSlIndex))
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
             executions, trade_date, pnl, account_identifier, id,
             stop_loss, take_profit, take_profit_targets, fees, commission, pnl_percent
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

  findTradeByPositionId(newTrade, existingTrades) {
    const newPositionIds = this.extractPositionIds(newTrade.executionData || []);
    if (newPositionIds.size === 0) {
      return null;
    }

    return existingTrades.find(existing => {
      const existingPositionIds = this.extractPositionIds(existing.executions);
      for (const positionId of newPositionIds) {
        if (existingPositionIds.has(positionId)) {
          return true;
        }
      }
      return false;
    }) || null;
  }

  hasTradeChanged(existingTrade, newTrade) {
    const existingStopLoss = this.parseNumber(existingTrade.stop_loss);
    const existingTakeProfit = this.parseNumber(existingTrade.take_profit);
    const existingPnL = this.parseNumber(existingTrade.pnl);
    const existingFees = this.parseNumber(existingTrade.fees);
    const existingCommission = this.parseNumber(existingTrade.commission);
    const existingPnLPercent = this.parseNumber(existingTrade.pnl_percent);
    const newPnLPercent = newTrade.pnlPercent !== undefined
      ? newTrade.pnlPercent
      : (
        newTrade.exitPrice !== null && newTrade.entryPrice !== null
          ? Trade.calculatePnLPercent(
            newTrade.entryPrice,
            newTrade.exitPrice,
            newTrade.side,
            newTrade.pnl,
            newTrade.quantity,
            newTrade.instrumentType || 'crypto'
          )
          : null
      );

    const normalizedExistingTargets = JSON.stringify(existingTrade.take_profit_targets || []);
    const normalizedNewTargets = JSON.stringify(newTrade.takeProfitTargets || []);
    const normalizedExistingExecutions = JSON.stringify(existingTrade.executions || []);
    const normalizedNewExecutions = JSON.stringify(newTrade.executionData || []);

    return (
      existingTrade.exit_time !== newTrade.exitTime ||
      Math.abs((this.parseNumber(existingTrade.entry_price) || 0) - (this.parseNumber(newTrade.entryPrice) || 0)) > 0.000001 ||
      Math.abs((this.parseNumber(existingTrade.exit_price) || 0) - (this.parseNumber(newTrade.exitPrice) || 0)) > 0.000001 ||
      Math.abs((this.parseNumber(existingTrade.quantity) || 0) - (this.parseNumber(newTrade.quantity) || 0)) > 0.000001 ||
      Math.abs((existingPnL || 0) - (this.parseNumber(newTrade.pnl) || 0)) > 0.000001 ||
      Math.abs((existingFees || 0) - (this.parseNumber(newTrade.fees) || 0)) > 0.000001 ||
      Math.abs((existingCommission || 0) - (this.parseNumber(newTrade.commission) || 0)) > 0.000001 ||
      Math.abs((existingPnLPercent || 0) - (this.parseNumber(newPnLPercent) || 0)) > 0.000001 ||
      Math.abs((existingStopLoss || 0) - (this.parseNumber(newTrade.stopLoss) || 0)) > 0.000001 ||
      Math.abs((existingTakeProfit || 0) - (this.parseNumber(newTrade.takeProfit) || 0)) > 0.000001 ||
      normalizedExistingTargets !== normalizedNewTargets ||
      normalizedExistingExecutions !== normalizedNewExecutions
    );
  }

  async updateExistingTrade(userId, connectionId, existingTradeId, tradeData) {
    const pnlPercent = tradeData.pnlPercent !== undefined
      ? tradeData.pnlPercent
      : (
        tradeData.exitPrice !== null && tradeData.entryPrice !== null
          ? Trade.calculatePnLPercent(
            tradeData.entryPrice,
            tradeData.exitPrice,
            tradeData.side,
            tradeData.pnl,
            tradeData.quantity,
            tradeData.instrumentType || 'crypto'
          )
          : null
      );

    const query = `
      UPDATE trades
      SET trade_date = $1,
          entry_time = $2,
          exit_time = $3,
          entry_price = $4,
          exit_price = $5,
          quantity = $6,
          commission = $7,
          fees = $8,
          pnl = $9,
          pnl_percent = $10,
          stop_loss = $11,
          take_profit = $12,
          take_profit_targets = $13::jsonb,
          executions = $14::jsonb,
          broker_connection_id = COALESCE(broker_connection_id, $15),
          account_identifier = COALESCE(account_identifier, $16),
          updated_at = NOW()
      WHERE id = $17
        AND user_id = $18
    `;

    await db.query(query, [
      tradeData.tradeDate,
      tradeData.entryTime,
      tradeData.exitTime,
      tradeData.entryPrice,
      tradeData.exitPrice,
      tradeData.quantity,
      tradeData.commission || 0,
      tradeData.fees || 0,
      tradeData.pnl,
      pnlPercent,
      tradeData.stopLoss,
      tradeData.takeProfit,
      JSON.stringify(tradeData.takeProfitTargets || []),
      JSON.stringify(tradeData.executionData || []),
      connectionId,
      tradeData.accountIdentifier || null,
      existingTradeId,
      userId
    ]);
  }

  async importTrades(userId, connectionId, trades) {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let duplicates = 0;

    const existingTrades = await this.getExistingTrades(userId, trades);

    for (const tradeData of trades) {
      try {
        const matchingTrade = this.findTradeByPositionId(tradeData, existingTrades);
        if (matchingTrade) {
          if (this.hasTradeChanged(matchingTrade, tradeData)) {
            await this.updateExistingTrade(userId, connectionId, matchingTrade.id, tradeData);
            updated++;

            matchingTrade.trade_date = tradeData.tradeDate;
            matchingTrade.entry_time = tradeData.entryTime;
            matchingTrade.exit_time = tradeData.exitTime;
            matchingTrade.entry_price = tradeData.entryPrice;
            matchingTrade.exit_price = tradeData.exitPrice;
            matchingTrade.quantity = tradeData.quantity;
            matchingTrade.commission = tradeData.commission || 0;
            matchingTrade.fees = tradeData.fees || 0;
            matchingTrade.pnl = tradeData.pnl;
            matchingTrade.stop_loss = tradeData.stopLoss;
            matchingTrade.take_profit = tradeData.takeProfit;
            matchingTrade.take_profit_targets = tradeData.takeProfitTargets || [];
            matchingTrade.executions = tradeData.executionData || [];
          } else {
            duplicates++;
          }
          continue;
        }

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

    if (imported > 0 || updated > 0) {
      await AnalyticsCache.invalidateUserCache(userId);
      invalidateInMemoryCache(userId);
    }

    return { imported, updated, skipped, failed, duplicates };
  }

  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;
    const marginCoin = String(connection.bitunixMarginCoin || DEFAULT_MARGIN_COIN).toUpperCase();

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    }

    const [historyPositions, pendingPositions, pendingOrders, pendingTpSlOrders, historyTrades] = await Promise.all([
      this.getHistoryPositions(connection.bitunixApiKey, connection.bitunixApiSecret, { startDate, endDate }),
      this.getPendingPositions(connection.bitunixApiKey, connection.bitunixApiSecret),
      this.getPendingOrders(connection.bitunixApiKey, connection.bitunixApiSecret),
      this.getPendingTpSlOrders(connection.bitunixApiKey, connection.bitunixApiSecret),
      this.getHistoryTrades(connection.bitunixApiKey, connection.bitunixApiSecret, { startDate, endDate })
    ]);

    const trades = this.parsePositions(
      historyPositions,
      pendingPositions,
      pendingOrders,
      pendingTpSlOrders,
      marginCoin,
      historyTrades
    );

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing', {
        tradesFetched: trades.length
      });
    }

    return this.importTrades(connection.userId, connection.id, trades);
  }
}

module.exports = new BitunixService();

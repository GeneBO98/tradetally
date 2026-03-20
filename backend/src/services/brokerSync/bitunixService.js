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

  parseClosedPosition(position, marginCoin) {
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
      executionData: [
        {
          type: 'entry',
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
      ]
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

  parsePositions(historyPositions, pendingPositions, pendingOrders, pendingTpSlOrders, marginCoin) {
    const pendingOrdersIndex = this.buildPendingOrdersIndex(pendingOrders);
    const pendingTpSlIndex = this.buildPendingTpSlIndex(pendingTpSlOrders);

    const closedTrades = historyPositions
      .map(position => this.parseClosedPosition(position, marginCoin))
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

    const [historyPositions, pendingPositions, pendingOrders, pendingTpSlOrders] = await Promise.all([
      this.getHistoryPositions(connection.bitunixApiKey, connection.bitunixApiSecret, { startDate, endDate }),
      this.getPendingPositions(connection.bitunixApiKey, connection.bitunixApiSecret),
      this.getPendingOrders(connection.bitunixApiKey, connection.bitunixApiSecret),
      this.getPendingTpSlOrders(connection.bitunixApiKey, connection.bitunixApiSecret)
    ]);

    const trades = this.parsePositions(historyPositions, pendingPositions, pendingOrders, pendingTpSlOrders, marginCoin);

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing', {
        tradesFetched: trades.length
      });
    }

    return this.importTrades(connection.userId, connection.id, trades);
  }
}

module.exports = new BitunixService();

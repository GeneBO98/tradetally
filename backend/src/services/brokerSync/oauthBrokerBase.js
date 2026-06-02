const axios = require('axios');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const AnalyticsCache = require('../analyticsCache');
const cache = require('../../utils/cache');
const db = require('../../config/database');

const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

function invalidateInMemoryCache(userId) {
  const cacheKeys = Object.keys(cache.data || {}).filter(key =>
    key.startsWith(`analytics:user_${userId}:`)
  );
  cacheKeys.forEach(key => cache.del(key));
}

function toDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().split('T')[0];
}

class OAuthBrokerBase {
  constructor(config) {
    this.config = config;
  }

  isConfigured() {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  getAuthorizationUrl(state, options = {}) {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    const scope = this.getScope(options);
    if (scope) {
      url.searchParams.set('scope', scope);
    }
    this.applyAuthorizationParams(url, options);
    return url.toString();
  }

  getScope() {
    return this.config.scope;
  }

  applyAuthorizationParams() {}

  async exchangeCodeForTokens(code) {
    const response = await axios.post(
      this.config.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return this.normalizeTokenResponse(response.data);
  }

  async refreshAccessToken(refreshToken) {
    const response = await axios.post(
      this.config.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return this.normalizeTokenResponse(response.data, refreshToken);
  }

  normalizeTokenResponse(data, fallbackRefreshToken = null) {
    const expiresIn = Number(data.expires_in || data.expiresIn || 3600);
    const refreshExpiresIn = Number(data.refresh_token_expires_in || data.refreshExpiresIn || 0);
    return {
      accessToken: data.access_token || data.accessToken,
      refreshToken: data.refresh_token || data.refreshToken || fallbackRefreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      refreshTokenExpiresAt: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000) : null,
      scopes: typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : (data.scope || [])
    };
  }

  async ensureValidToken(connection) {
    const expiresAt = connection.oauthTokenExpiresAt ? new Date(connection.oauthTokenExpiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER) {
      if (!connection.oauthRefreshToken) {
        await BrokerConnection.updateStatus(connection.id, 'expired', `${this.config.displayName} authentication expired. Please reconnect.`);
        return { accessToken: null, needsReauth: true };
      }

      try {
        const tokens = await this.refreshAccessToken(connection.oauthRefreshToken);
        await BrokerConnection.updateOAuthTokens(
          connection.id,
          tokens.accessToken,
          tokens.refreshToken,
          tokens.expiresAt,
          tokens.refreshTokenExpiresAt
        );
        return { accessToken: tokens.accessToken, needsReauth: false };
      } catch (error) {
        await BrokerConnection.updateStatus(connection.id, 'expired', `${this.config.displayName} authentication expired. Please reconnect.`);
        return { accessToken: null, needsReauth: true };
      }
    }

    return { accessToken: connection.oauthAccessToken, needsReauth: false };
  }

  async createConnectionFromTokens(userId, tokens, options = {}) {
    const profile = await this.fetchConnectionProfile(tokens.accessToken, options);
    const connection = await BrokerConnection.create(userId, {
      brokerType: this.config.brokerType,
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthTokenExpiresAt: tokens.expiresAt,
      oauthRefreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      oauthScopes: tokens.scopes,
      externalAccountId: profile.externalAccountId,
      externalUserId: profile.externalUserId,
      brokerEnvironment: options.environment || profile.environment || null,
      brokerMetadata: profile.metadata || {},
      accountLabel: profile.accountLabel || null,
      autoSyncEnabled: false,
      syncFrequency: 'daily'
    });
    await BrokerConnection.updateStatus(connection.id, 'active', 'OAuth connection successful');
    return BrokerConnection.findById(connection.id, false);
  }

  async fetchConnectionProfile() {
    return {};
  }

  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;
    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth) {
      throw new Error(`${this.config.displayName} authentication expired. Please reconnect.`);
    }

    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    const rawExecutions = await this.fetchExecutions(accessToken, connection, { startDate, endDate });
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing', { tradesFetched: rawExecutions.length });
    }

    const trades = this.mapExecutionsToTrades(rawExecutions, connection);
    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    return this.importTrades(connection.userId, connection.id, trades);
  }

  async fetchExecutions() {
    return [];
  }

  mapExecutionsToTrades(executions) {
    const fills = executions.map(execution => this.mapExecutionToFill(execution)).filter(Boolean);
    if (fills.length > 0) {
      return this.pairFillsToTrades(fills);
    }
    return executions.map(execution => this.mapExecutionToTrade(execution)).filter(Boolean);
  }

  mapExecutionToFill() {
    return null;
  }

  pairFillsToTrades(fills) {
    const openLots = new Map();
    const trades = [];

    const sortedFills = [...fills].sort((a, b) => new Date(a.time) - new Date(b.time));
    for (const fill of sortedFills) {
      const key = `${String(fill.symbol).toUpperCase()}|${fill.accountIdentifier || ''}`;
      if (!openLots.has(key)) openLots.set(key, []);
      const lots = openLots.get(key);
      let remaining = Number(fill.quantity);

      while (remaining > 0 && lots.length > 0 && lots[0].action !== fill.action) {
        const lot = lots[0];
        const quantity = Math.min(remaining, lot.remainingQuantity);
        const longTrade = lot.action === 'buy';
        const entryFill = longTrade ? lot : fill;
        const exitFill = longTrade ? fill : lot;
        const side = longTrade ? 'long' : 'short';
        const pnl = this.calculatePnL(entryFill.price, exitFill.price, quantity, side, entryFill.instrumentType);

        trades.push({
          symbol: fill.symbol,
          side,
          quantity,
          entryPrice: entryFill.price,
          exitPrice: exitFill.price,
          entryTime: entryFill.time,
          exitTime: exitFill.time,
          tradeDate: toDateOnly(exitFill.time),
          commission: (entryFill.commission || 0) + (exitFill.commission || 0),
          fees: (entryFill.fees || 0) + (exitFill.fees || 0),
          pnl,
          broker: this.config.brokerType,
          instrumentType: entryFill.instrumentType || fill.instrumentType || 'stock',
          accountIdentifier: fill.accountIdentifier || lot.accountIdentifier || null,
          executionData: [
            this.toExecutionData(entryFill, 'entry'),
            this.toExecutionData(exitFill, 'exit')
          ]
        });

        remaining -= quantity;
        lot.remainingQuantity -= quantity;
        if (lot.remainingQuantity <= 0.000001) lots.shift();
      }

      if (remaining > 0) {
        lots.push({ ...fill, remainingQuantity: remaining });
      }
    }

    for (const lots of openLots.values()) {
      for (const lot of lots) {
        trades.push({
          symbol: lot.symbol,
          side: lot.action === 'buy' ? 'long' : 'short',
          quantity: lot.remainingQuantity,
          entryPrice: lot.price,
          exitPrice: null,
          entryTime: lot.time,
          exitTime: null,
          tradeDate: toDateOnly(lot.time),
          commission: lot.commission || 0,
          fees: lot.fees || 0,
          pnl: null,
          broker: this.config.brokerType,
          instrumentType: lot.instrumentType || 'stock',
          accountIdentifier: lot.accountIdentifier || null,
          executionData: [this.toExecutionData(lot, 'entry')]
        });
      }
    }

    return trades;
  }

  calculatePnL(entryPrice, exitPrice, quantity, side, instrumentType) {
    const multiplier = instrumentType === 'option' ? 100 : 1;
    const diff = Number(exitPrice) - Number(entryPrice);
    const pnl = side === 'long' ? diff * quantity * multiplier : -diff * quantity * multiplier;
    return Math.round(pnl * 100) / 100;
  }

  toExecutionData(fill, type) {
    return {
      action: fill.action,
      type,
      quantity: fill.quantity,
      price: fill.price,
      datetime: fill.time,
      orderId: fill.orderId || null
    };
  }

  mapExecutionToTrade() {
    return null;
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
          executions: tradeData.executionData,
          instrument_type: tradeData.instrumentType || 'stock',
          account_identifier: tradeData.accountIdentifier || null
        });
      } catch (error) {
        console.error(`[${this.config.logPrefix}] Failed to import trade:`, error.message);
        failed++;
      }
    }

    if (imported > 0) {
      await AnalyticsCache.invalidateUserCache(userId);
      invalidateInMemoryCache(userId);
    }

    return { imported, skipped, failed, duplicates };
  }

  async getExistingTrades(userId, incomingTrades = []) {
    if (!incomingTrades.length) return [];
    const dates = incomingTrades
      .map(trade => toDateOnly(trade.tradeDate || trade.entryTime || trade.exitTime))
      .filter(Boolean)
      .sort();
    const params = [userId];
    let rangeClause = '';
    if (dates.length) {
      params.push(dates[0], dates[dates.length - 1]);
      rangeClause = 'AND trade_date >= $2 AND trade_date <= $3';
    }

    const result = await db.query(
      `SELECT symbol, side, quantity, entry_price, exit_price, entry_time, exit_time,
              executions, trade_date, pnl, instrument_type, account_identifier
         FROM trades
        WHERE user_id = $1 ${rangeClause}`,
      params
    );
    return result.rows;
  }

  isDuplicateTrade(newTrade, existingTrades) {
    return existingTrades.some(existing => {
      if (String(existing.symbol).toUpperCase() !== String(newTrade.symbol).toUpperCase()) return false;
      if (existing.side !== newTrade.side) return false;
      if (toDateOnly(existing.trade_date) !== toDateOnly(newTrade.tradeDate)) return false;

      const qtyMatch = Math.abs(Number(existing.quantity) - Number(newTrade.quantity)) < 0.0001;
      const entryMatch = Math.abs(Number(existing.entry_price || 0) - Number(newTrade.entryPrice || 0)) < 0.0001;
      const exitMatch = Math.abs(Number(existing.exit_price || 0) - Number(newTrade.exitPrice || 0)) < 0.0001;
      if (qtyMatch && entryMatch && exitMatch) return true;

      const existingExecs = Array.isArray(existing.executions) ? existing.executions : [];
      const newExecs = newTrade.executionData || [];
      return newExecs.some(newExec => existingExecs.some(existingExec =>
        newExec.orderId && existingExec.orderId && String(newExec.orderId) === String(existingExec.orderId)
      ));
    });
  }
}

module.exports = OAuthBrokerBase;

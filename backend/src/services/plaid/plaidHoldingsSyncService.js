const db = require('../../config/database');
const PlaidSecurity = require('../../models/PlaidSecurity');
const HoldingsService = require('../holdingsService');
const plaidClient = require('./plaidClient');
const { derivePlaidAccountIdentifier } = require('./plaidAccountIdentifier');

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildExternalId(plaidAccountId, plaidSecurityId) {
  return `${plaidAccountId}:${plaidSecurityId}`;
}

class PlaidHoldingsSyncService {
  /**
   * Sync Plaid investment holdings into the investment planning module.
   * Each (security, plaid account) pair maps to one Plaid-managed lot
   * (source='plaid', external_id '<plaid_account_id>:<plaid_security_id>')
   * that is updated in place to mirror the broker's reported position.
   *
   * @param {Object} connection - Plaid connection with decrypted accessToken
   * @param {Map} plaidAccountMap - plaid_account_id -> normalized plaid account
   * @returns {Promise<{upserted: number, removed: number, skipped: number}>}
   */
  async syncHoldings(connection, plaidAccountMap) {
    const schemaReady = await PlaidSecurity.hasSchema();
    if (!schemaReady) {
      return { upserted: 0, removed: 0, skipped: 0 };
    }

    const response = await plaidClient.getInvestmentHoldings(connection.accessToken);
    const holdings = response.holdings || [];
    const securities = response.securities || [];

    await PlaidSecurity.upsertMany(securities);

    const securityById = new Map(
      securities.filter(security => security?.security_id).map(security => [security.security_id, security])
    );

    const userId = connection.userId;
    const accountIdentifierCache = new Map();
    const affectedHoldingIds = new Set();
    const seenExternalIds = [];
    let upserted = 0;
    let skipped = 0;

    for (const holding of holdings) {
      const security = securityById.get(holding.security_id);
      const plaidAccount = plaidAccountMap.get(holding.account_id);
      const skipReason = this.getSkipReason(holding, security, plaidAccount);
      if (skipReason) {
        skipped += 1;
        console.log(`[INFO] [PLAID] Skipping holding ${holding.security_id || 'unknown'}: ${skipReason}`);
        continue;
      }

      const ticker = security.ticker_symbol.trim().toUpperCase();
      const externalId = buildExternalId(holding.account_id, holding.security_id);
      const accountIdentifier = await this.resolveAccountIdentifier(connection, plaidAccount, accountIdentifierCache);

      const quantity = round(parseFloat(holding.quantity), 6);
      const institutionPrice = holding.institution_price !== null && holding.institution_price !== undefined
        ? parseFloat(holding.institution_price)
        : null;
      const reportedCostBasis = holding.cost_basis !== null && holding.cost_basis !== undefined
        ? parseFloat(holding.cost_basis)
        : null;

      // Plaid's cost_basis is the total cost for the position. Many
      // institutions do not report it; fall back to current market value so
      // the lot at least carries the right share count.
      const costBasisEstimated = reportedCostBasis === null;
      const totalCost = round(
        reportedCostBasis ?? (institutionPrice !== null ? quantity * institutionPrice : 0),
        2
      );
      const costPerShare = quantity > 0 ? round(totalCost / quantity, 4) : 0;

      const holdingId = await this.upsertPlaidLot(userId, {
        symbol: ticker,
        externalId,
        shares: quantity,
        costPerShare,
        totalCost,
        broker: connection.institutionName || 'Plaid',
        accountIdentifier,
        costBasisEstimated
      });

      affectedHoldingIds.add(holdingId);
      seenExternalIds.push(externalId);
      upserted += 1;
    }

    const removed = await this.removeStaleLots(userId, [...plaidAccountMap.keys()], seenExternalIds, affectedHoldingIds);
    await this.reconcileAffectedHoldings(userId, affectedHoldingIds);

    return { upserted, removed, skipped };
  }

  getSkipReason(holding, security, plaidAccount) {
    if (!plaidAccount) {
      return 'no matching active Plaid account';
    }
    if (!security) {
      return 'security metadata missing';
    }
    if (security.is_cash_equivalent) {
      return 'cash equivalent';
    }
    const type = String(security.type || '').toLowerCase();
    if (type === 'cash' || type === 'currency') {
      return `security type "${type}"`;
    }
    if (type === 'derivative') {
      return 'derivative security';
    }
    const ticker = String(security.ticker_symbol || '').trim();
    if (!ticker) {
      return 'no ticker symbol';
    }
    if (ticker.includes(':')) {
      return `pseudo ticker "${ticker}"`;
    }
    const quantity = parseFloat(holding.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'non-positive quantity';
    }
    return null;
  }

  async resolveAccountIdentifier(connection, plaidAccount, cache) {
    const cacheKey = plaidAccount.id;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let identifier = null;
    if (plaidAccount.linkedAccountId) {
      const result = await db.query(
        `SELECT account_identifier FROM user_accounts WHERE id = $1`,
        [plaidAccount.linkedAccountId]
      );
      identifier = result.rows[0]?.account_identifier || null;
    }

    if (!identifier) {
      identifier = derivePlaidAccountIdentifier(connection.institutionName, plaidAccount.mask);
    }

    cache.set(cacheKey, identifier);
    return identifier;
  }

  /**
   * Insert or update the Plaid-managed lot for one (security, account) pair.
   * Returns the holding id the lot belongs to.
   */
  async upsertPlaidLot(userId, lot) {
    const existing = await db.query(`
      SELECT id, holding_id FROM investment_lots
      WHERE user_id = $1 AND source = 'plaid' AND external_id = $2
    `, [userId, lot.externalId]);

    if (existing.rows.length > 0) {
      await db.query(`
        UPDATE investment_lots
        SET shares = $2,
            cost_per_share = $3,
            total_cost = $4,
            broker = $5,
            account_identifier = $6
        WHERE id = $1
      `, [
        existing.rows[0].id,
        lot.shares,
        lot.costPerShare,
        lot.totalCost,
        lot.broker,
        lot.accountIdentifier
      ]);
      return existing.rows[0].holding_id;
    }

    const holdingId = await this.findOrCreateHolding(userId, lot.symbol);
    const notes = lot.costBasisEstimated
      ? 'Synced from Plaid (cost basis estimated from market value)'
      : 'Synced from Plaid';

    await db.query(`
      INSERT INTO investment_lots (
        holding_id, user_id, shares, cost_per_share, total_cost,
        purchase_date, broker, account_identifier, notes, source, external_id
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, 'plaid', $9)
    `, [
      holdingId,
      userId,
      lot.shares,
      lot.costPerShare,
      lot.totalCost,
      lot.broker,
      lot.accountIdentifier,
      notes,
      lot.externalId
    ]);

    return holdingId;
  }

  async findOrCreateHolding(userId, symbol) {
    const inserted = await db.query(`
      INSERT INTO investment_holdings (user_id, symbol, total_shares, average_cost_basis, total_cost_basis)
      VALUES ($1, $2, 0, 0, 0)
      ON CONFLICT (user_id, symbol) DO NOTHING
      RETURNING id
    `, [userId, symbol]);

    if (inserted.rows.length > 0) {
      return inserted.rows[0].id;
    }

    const existing = await db.query(
      `SELECT id FROM investment_holdings WHERE user_id = $1 AND symbol = $2`,
      [userId, symbol]
    );
    return existing.rows[0].id;
  }

  /**
   * Delete Plaid lots for this connection's accounts whose external_id was
   * not reported in the current sync (position closed or transferred out).
   */
  async removeStaleLots(userId, plaidAccountIds, seenExternalIds, affectedHoldingIds) {
    if (plaidAccountIds.length === 0) {
      return 0;
    }

    const result = await db.query(`
      DELETE FROM investment_lots
      WHERE user_id = $1
        AND source = 'plaid'
        AND external_id IS NOT NULL
        AND split_part(external_id, ':', 1) = ANY($2::text[])
        AND external_id != ALL($3::text[])
      RETURNING holding_id
    `, [userId, plaidAccountIds, seenExternalIds]);

    for (const row of result.rows) {
      affectedHoldingIds.add(row.holding_id);
    }
    return result.rowCount;
  }

  /**
   * Recalculate (or delete, when no lots remain) every holding touched by
   * this sync. Price refresh is skipped here; prices refresh lazily when the
   * user opens the holdings views.
   */
  async reconcileAffectedHoldings(userId, affectedHoldingIds) {
    for (const holdingId of affectedHoldingIds) {
      const remaining = await db.query(
        `SELECT COUNT(*) AS count FROM investment_lots WHERE holding_id = $1`,
        [holdingId]
      );

      if (parseInt(remaining.rows[0].count, 10) === 0) {
        await db.query(`DELETE FROM investment_holdings WHERE id = $1 AND user_id = $2`, [holdingId, userId]);
      } else {
        await HoldingsService.recalculateHolding(userId, holdingId, { refreshPrice: false });
      }
    }
  }
}

module.exports = new PlaidHoldingsSyncService();

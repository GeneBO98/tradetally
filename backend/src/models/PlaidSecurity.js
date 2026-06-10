const db = require('../config/database');

class PlaidSecurity {
  static async hasSchema() {
    // Same caching strategy as PlaidConnection.hasSchema: schema availability
    // only changes when migrations run, so cache the positive result.
    if (PlaidSecurity._schemaReady) {
      return true;
    }

    const result = await db.query(`
      SELECT to_regclass('public.plaid_securities') IS NOT NULL AS ready
    `);

    const ready = Boolean(result.rows[0]?.ready);
    if (ready) {
      PlaidSecurity._schemaReady = true;
    }
    return ready;
  }

  static async upsertMany(securities = []) {
    if (!Array.isArray(securities) || securities.length === 0) {
      return 0;
    }

    let upserted = 0;
    for (const security of securities) {
      if (!security?.security_id) continue;

      await db.query(`
        INSERT INTO plaid_securities (
          plaid_security_id, ticker_symbol, name, security_type, is_cash_equivalent,
          iso_currency_code, cusip, isin, close_price, close_price_as_of, raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (plaid_security_id) DO UPDATE SET
          ticker_symbol = EXCLUDED.ticker_symbol,
          name = EXCLUDED.name,
          security_type = EXCLUDED.security_type,
          is_cash_equivalent = EXCLUDED.is_cash_equivalent,
          iso_currency_code = EXCLUDED.iso_currency_code,
          cusip = COALESCE(EXCLUDED.cusip, plaid_securities.cusip),
          isin = COALESCE(EXCLUDED.isin, plaid_securities.isin),
          close_price = COALESCE(EXCLUDED.close_price, plaid_securities.close_price),
          close_price_as_of = COALESCE(EXCLUDED.close_price_as_of, plaid_securities.close_price_as_of),
          raw_payload = EXCLUDED.raw_payload,
          updated_at = CURRENT_TIMESTAMP
      `, [
        security.security_id,
        security.ticker_symbol || null,
        security.name || null,
        security.type || null,
        Boolean(security.is_cash_equivalent),
        security.iso_currency_code || security.unofficial_currency_code || null,
        security.cusip || null,
        security.isin || null,
        security.close_price ?? null,
        security.close_price_as_of || null,
        JSON.stringify(security)
      ]);
      upserted += 1;
    }

    return upserted;
  }

  static async findByPlaidIds(plaidSecurityIds = []) {
    if (!Array.isArray(plaidSecurityIds) || plaidSecurityIds.length === 0) {
      return [];
    }

    const result = await db.query(`
      SELECT * FROM plaid_securities
      WHERE plaid_security_id = ANY($1::text[])
    `, [plaidSecurityIds]);

    return result.rows.map(row => this.formatSecurity(row));
  }

  static formatSecurity(row) {
    if (!row) return null;

    return {
      id: row.id,
      plaidSecurityId: row.plaid_security_id,
      tickerSymbol: row.ticker_symbol,
      name: row.name,
      securityType: row.security_type,
      isCashEquivalent: row.is_cash_equivalent,
      isoCurrencyCode: row.iso_currency_code,
      cusip: row.cusip,
      isin: row.isin,
      closePrice: row.close_price !== null ? parseFloat(row.close_price) : null,
      closePriceAsOf: row.close_price_as_of,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = PlaidSecurity;

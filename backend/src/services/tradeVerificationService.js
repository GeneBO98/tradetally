// Verified trades (tradetally.io cloud-only).
//
// Tier 1 verification: the trade arrived via authenticated broker sync
// (trades.broker_connection_id is set) and its economic fields are unchanged
// since the verification was issued. The attestation is only as strong as the
// instance making it, which is why this ships on tradetally.io and not in the
// self-hosted build.
//
// Tampering is handled lazily: every read re-computes the snapshot hash from
// the live trade. A mismatch (the user edited prices/times/size after
// verifying) marks the verification revoked. No write hooks needed.

const crypto = require('crypto');
const db = require('../config/database');

const PUBLIC_CODE_BYTES = 6; // 12 hex chars; uniqueness enforced by the DB

function canonicalNumber(value) {
  if (value === null || value === undefined) return '';
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(8) : '';
}

function canonicalTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

// The fields a forger would need to change. Notes/tags/strategy stay editable
// without invalidating the verification.
function computeSnapshotHash(trade) {
  const canonical = [
    String(trade.symbol || '').toUpperCase(),
    String(trade.side || '').toLowerCase(),
    canonicalNumber(trade.entry_price),
    canonicalNumber(trade.exit_price),
    canonicalNumber(trade.quantity),
    canonicalNumber(trade.pnl),
    canonicalTime(trade.entry_time),
    canonicalTime(trade.exit_time),
    String(trade.trade_date || '').slice(0, 10)
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function generatePublicCode() {
  return crypto.randomBytes(PUBLIC_CODE_BYTES).toString('hex');
}

class TradeVerificationService {
  // A trade qualifies for Tier 1 when it came from an authenticated broker
  // sync and is closed. CSV imports and manual entries never qualify (the
  // file/form contents are user-controlled).
  static isEligible(trade) {
    return Boolean(
      trade &&
      trade.broker_connection_id &&
      trade.exit_price !== null &&
      trade.exit_price !== undefined &&
      trade.pnl !== null &&
      trade.pnl !== undefined
    );
  }

  // Create (or return the existing) verification for a trade the user owns.
  // Returns null when the trade is not eligible.
  static async verifyTrade(tradeId, userId, { showAmounts = false } = {}) {
    const tradeResult = await db.query(
      `SELECT id, user_id, symbol, side, entry_price, exit_price, quantity, pnl,
              pnl_percent, r_value, entry_time, exit_time, trade_date, broker,
              broker_connection_id
       FROM trades WHERE id = $1 AND user_id = $2`,
      [tradeId, userId]
    );
    const trade = tradeResult.rows[0];
    if (!this.isEligible(trade)) return null;

    const snapshotHash = computeSnapshotHash(trade);

    const existing = await db.query(
      'SELECT * FROM trade_verifications WHERE trade_id = $1',
      [tradeId]
    );

    if (existing.rows.length > 0) {
      // Refresh: re-issue against the current trade state (an owner re-sharing
      // an edited-then-restored trade gets a clean verification) and update
      // the amounts preference.
      const updated = await db.query(
        `UPDATE trade_verifications
         SET snapshot_hash = $2, show_amounts = $3, revoked_at = NULL
         WHERE trade_id = $1
         RETURNING *`,
        [tradeId, snapshotHash, showAmounts === true]
      );
      return this.formatOwnerView(updated.rows[0]);
    }

    // Retry on the (vanishingly unlikely) public_code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const inserted = await db.query(
          `INSERT INTO trade_verifications (trade_id, user_id, public_code, broker, snapshot_hash, show_amounts)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [tradeId, userId, generatePublicCode(), trade.broker || null, snapshotHash, showAmounts === true]
        );
        return this.formatOwnerView(inserted.rows[0]);
      } catch (error) {
        if (error.code === '23505' && String(error.constraint || '').includes('public_code') && attempt < 2) {
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  // Public lookup by code. Recomputes the hash against the live trade so
  // post-verification edits surface as revoked.
  static async getPublicVerification(publicCode) {
    const result = await db.query(
      `SELECT v.*, t.symbol, t.underlying_symbol, t.side, t.entry_price, t.exit_price,
              t.quantity, t.pnl, t.pnl_percent, t.r_value, t.entry_time, t.exit_time,
              t.trade_date, t.instrument_type, t.broker_connection_id,
              u.username
       FROM trade_verifications v
       JOIN trades t ON t.id = v.trade_id
       JOIN users u ON u.id = v.user_id
       WHERE v.public_code = $1`,
      [String(publicCode || '').toLowerCase()]
    );
    const row = result.rows[0];
    if (!row) return null;

    const currentHash = computeSnapshotHash(row);
    let status = row.status;
    if (row.revoked_at) {
      status = 'revoked';
    } else if (currentHash !== row.snapshot_hash) {
      status = 'revoked';
      await db.query(
        'UPDATE trade_verifications SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
        [row.id]
      );
      console.log(`[TRADE-VERIFY] Revoked verification ${row.public_code}: economic fields changed after issuance`);
    }

    const payload = {
      public_code: row.public_code,
      status,
      verified_at: row.created_at,
      revoked_at: status === 'revoked' ? (row.revoked_at || new Date().toISOString()) : null,
      broker: row.broker,
      username: row.username,
      symbol: String(row.underlying_symbol || row.symbol || '').toUpperCase(),
      side: row.side,
      instrument_type: row.instrument_type,
      trade_date: String(row.trade_date || '').slice(0, 10),
      pnl_percent: row.pnl_percent !== null ? parseFloat(row.pnl_percent) : null,
      r_value: row.r_value !== null ? parseFloat(row.r_value) : null,
      is_win: parseFloat(row.pnl) >= 0
    };

    // Dollar amounts and position size only when the owner opted in.
    if (row.show_amounts && status !== 'revoked') {
      payload.pnl = parseFloat(row.pnl);
      payload.quantity = parseFloat(row.quantity);
      payload.entry_price = parseFloat(row.entry_price);
      payload.exit_price = parseFloat(row.exit_price);
    }

    return payload;
  }

  // Owner-facing status for a trade (drives the share-card badge).
  static async getForTrade(tradeId, userId) {
    const result = await db.query(
      `SELECT v.*, t.symbol, t.side, t.entry_price, t.exit_price, t.quantity, t.pnl,
              t.entry_time, t.exit_time, t.trade_date
       FROM trade_verifications v
       JOIN trades t ON t.id = v.trade_id
       WHERE v.trade_id = $1 AND v.user_id = $2`,
      [tradeId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.revoked_at && computeSnapshotHash(row) !== row.snapshot_hash) {
      await db.query(
        'UPDATE trade_verifications SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
        [row.id]
      );
      row.revoked_at = new Date().toISOString();
    }
    return this.formatOwnerView(row);
  }

  static formatOwnerView(row) {
    return {
      public_code: row.public_code,
      status: row.revoked_at ? 'revoked' : row.status,
      verified_at: row.created_at,
      show_amounts: row.show_amounts === true
    };
  }
}

TradeVerificationService.computeSnapshotHash = computeSnapshotHash;

module.exports = TradeVerificationService;

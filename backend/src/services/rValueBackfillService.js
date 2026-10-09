const db = require('../config/database');
const Trade = require('../models/Trade');
const AnalyticsCache = require('./analyticsCache');

const BATCH_SIZE = 200;
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

async function runBatch(userId, afterId = null) {
  const result = await db.withTransaction(async client => {
    const { rows } = await client.query(`
      SELECT id, symbol, side, entry_price, exit_price, stop_loss, quantity,
             commission, fees, instrument_type, contract_size, point_value,
             underlying_asset
      FROM trades
      WHERE user_id = $1 AND id > $2::uuid AND r_value IS NULL
        AND entry_price > 0 AND exit_price > 0 AND stop_loss > 0 AND quantity > 0
        AND side IN ('long', 'short')
      ORDER BY id LIMIT $3 FOR UPDATE
    `, [userId, afterId || FIRST_ID, BATCH_SIZE]);

    let updated = 0;
    for (const trade of rows) {
      const rValue = Trade.calculateRValue(
        trade.entry_price, trade.stop_loss, trade.exit_price, trade.side, {
          quantity: trade.quantity,
          commission: trade.commission,
          fees: trade.fees,
          instrumentType: trade.instrument_type,
          contractSize: trade.contract_size,
          pointValue: trade.point_value,
          symbol: trade.symbol,
          underlyingAsset: trade.underlying_asset
        }
      );
      if (rValue == null) continue;
      await client.query('UPDATE trades SET r_value = $1 WHERE id = $2 AND user_id = $3',
        [rValue, trade.id, userId]);
      updated++;
    }
    return {
      updated,
      next_after: rows.length === BATCH_SIZE ? rows[rows.length - 1].id : null
    };
  });

  if (result.updated) await AnalyticsCache.invalidate(userId);
  return result;
}

module.exports = { runBatch };

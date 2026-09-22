const db = require('../config/database');
const Trade = require('../models/Trade');
const AnalyticsCache = require('./analyticsCache');
const AppError = require('../utils/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function update(userId, tradeIds, stops, applyDefaultToMissing, dryRun = false) {
  if (!Array.isArray(tradeIds) || tradeIds.length < 1 || tradeIds.length > 500 ||
      tradeIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw new AppError(400, { error: 'Select between 1 and 500 valid trades' });
  }
  const ids = [...new Set(tradeIds.map(id => id.toLowerCase()))];
  if (!Array.isArray(stops) || stops.length > ids.length || typeof applyDefaultToMissing !== 'boolean' ||
      (!stops.length && !applyDefaultToMissing)) {
    throw new AppError(400, { error: 'Provide stops or choose to fill missing stops' });
  }

  const requested = new Map();
  for (const entry of stops) {
    const id = typeof entry?.trade_id === 'string' ? entry.trade_id.toLowerCase() : null;
    const price = Number(entry?.stop_loss);
    if (!ids.includes(id) || requested.has(id) || !Number.isFinite(price) || price <= 0 || price >= 1e9) {
      throw new AppError(400, { error: 'Each stop needs a selected trade and a positive price' });
    }
    const storedPrice = Number(price.toFixed(6));
    if (storedPrice <= 0) throw new AppError(400, { error: 'Stop price is below supported precision' });
    requested.set(id, storedPrice);
  }

  const planChanges = async client => {
    const rows = await client.query(`
      SELECT id, symbol, side, entry_price, exit_price, quantity, commission, fees,
             instrument_type, contract_size, point_value, underlying_asset, stop_loss
      FROM trades WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY id ${dryRun ? '' : 'FOR UPDATE'}
    `, [userId, ids]);
    if (rows.rows.length !== ids.length) {
      throw new AppError(404, { error: 'One or more selected trades were not found' });
    }
    const settings = applyDefaultToMissing
      ? (await client.query(`
          SELECT default_stop_loss_type, default_stop_loss_percent, default_stop_loss_dollars
          FROM user_settings WHERE user_id = $1
        `, [userId])).rows[0]
      : null;
    const planned = [];
    for (const trade of rows.rows) {
      let stop = requested.get(trade.id);
      if (stop === undefined && applyDefaultToMissing && trade.stop_loss == null) {
        stop = Trade.calculateDefaultStopLossFromSettings(trade, settings);
      }
      if (stop === undefined || stop === null || Trade.stopLossMatches(stop, trade.stop_loss)) continue;
      const riskAmount = Trade.calculateRiskAmount(trade.entry_price, stop, trade.quantity, trade.side,
        trade.instrument_type, trade.contract_size, trade.point_value, trade.symbol, trade.underlying_asset);
      if (!riskAmount) {
        throw new AppError(400, { error: `Stop for ${trade.symbol} must define positive risk` });
      }
      const rValue = trade.exit_price == null ? null : Trade.calculateRValue(
        trade.entry_price, stop, trade.exit_price, trade.side, {
          quantity: trade.quantity, commission: trade.commission, fees: trade.fees,
          instrumentType: trade.instrument_type, contractSize: trade.contract_size,
          pointValue: trade.point_value, symbol: trade.symbol,
          underlyingAsset: trade.underlying_asset
        }
      );
      planned.push({ trade_id: trade.id, stop_loss: stop, risk_amount: riskAmount, r_value: rValue });
      if (!dryRun) {
        await client.query(`
          UPDATE trades SET stop_loss = $1, r_value = $2, updated_at = NOW()
          WHERE id = $3 AND user_id = $4
        `, [stop, rValue, trade.id, userId]);
      }
    }
    return planned;
  };
  const changes = dryRun ? await planChanges(db) : await db.withTransaction(planChanges);
  if (!dryRun && changes.length) await AnalyticsCache.invalidate(userId);
  return { updated_trade_count: changes.length, changes };
}

function preview(userId, tradeIds, stops, applyDefaultToMissing) {
  return update(userId, tradeIds, stops, applyDefaultToMissing, true);
}

module.exports = { update, preview };

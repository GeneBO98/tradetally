const db = require('../config/database');
const { isPositionGroupingEnabled } = require('../utils/positionGrouping');

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minTime(rows, field) {
  const times = rows.map(row => toDate(row[field])).filter(Boolean);
  if (times.length === 0) return null;
  return new Date(Math.min(...times.map(date => date.getTime()))).toISOString();
}

function maxTime(rows, field) {
  const times = rows.map(row => toDate(row[field])).filter(Boolean);
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map(date => date.getTime()))).toISOString();
}

function firstNonEmpty(rows, field) {
  const row = rows.find(candidate => candidate[field] !== null && candidate[field] !== undefined && String(candidate[field]).trim() !== '');
  return row ? row[field] : null;
}

function formatOptionStrategy(strategy) {
  return strategy ? String(strategy).replace(/_/g, ' ') : null;
}

class BehavioralAnalysisPositionService {
  static addTradeFilters(sqlParts, params, filter = {}) {
    if (filter.startDate) {
      params.push(filter.startDate);
      sqlParts.push(`AND t.exit_time >= $${params.length}`);
    }

    if (filter.endDate) {
      params.push(filter.endDate);
      sqlParts.push(`AND t.exit_time <= $${params.length}`);
    }

    if (filter.accounts && filter.accounts.length > 0) {
      if (filter.accounts.includes('__unsorted__')) {
        sqlParts.push(`AND (t.account_identifier IS NULL OR t.account_identifier = '')`);
      } else {
        params.push(filter.accounts);
        sqlParts.push(`AND t.account_identifier = ANY($${params.length}::text[])`);
      }
    }
  }

  static async getCompletedPositions(userId, filter = {}) {
    const params = [userId];
    const filters = [];
    this.addTradeFilters(filters, params, filter);

    const result = await db.query(`
      SELECT
        t.id,
        t.symbol,
        t.account_identifier,
        t.underlying_symbol,
        t.instrument_type,
        t.option_type,
        t.strike_price,
        t.expiration_date,
        t.entry_time,
        t.exit_time,
        t.trade_date,
        t.entry_price,
        t.exit_price,
        t.quantity,
        t.side,
        t.strategy,
        t.manual_override,
        t.commission,
        t.fees,
        t.pnl,
        t.contract_size,
        t.point_value,
        t.position_group_id,
        tpg.detected_strategy AS group_detected_strategy,
        tpg.strategy_confidence AS group_strategy_confidence,
        tpg.leg_count AS persisted_leg_count
      FROM trades t
      LEFT JOIN trade_position_groups tpg ON tpg.id = t.position_group_id
      WHERE t.user_id = $1
        AND t.exit_price IS NOT NULL
        AND t.exit_time IS NOT NULL
        AND t.entry_time IS NOT NULL
        AND t.pnl IS NOT NULL
        ${filters.join('\n        ')}
      ORDER BY t.entry_time ASC, t.id ASC
    `, params);

    const rows = result.rows || [];
    const groupByPosition = await isPositionGroupingEnabled(userId);
    if (!groupByPosition) {
      return rows.map(row => this.buildPosition([row], false));
    }

    const groups = new Map();
    for (const row of rows) {
      const key = this.positionKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    return Array.from(groups.values())
      .map(groupRows => this.buildPosition(groupRows, true))
      .sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));
  }

  static positionKey(row) {
    if (row.position_group_id) return String(row.position_group_id);
    return [
      row.account_identifier || '',
      row.underlying_symbol || row.symbol || '',
      row.entry_time || row.id
    ].join('|');
  }

  static tradeMultiplier(row) {
    if (row.instrument_type === 'option') {
      return parseNumber(row.contract_size, 100) || 100;
    }
    if (row.instrument_type === 'future') {
      return parseNumber(row.point_value, 1) || 1;
    }
    return 1;
  }

  static tradePositionSize(row) {
    return Math.abs(parseNumber(row.quantity)) * parseNumber(row.entry_price) * this.tradeMultiplier(row);
  }

  static buildPosition(rows, groupingEnabled) {
    const ordered = [...rows].sort((a, b) => {
      const aTime = toDate(a.entry_time)?.getTime() || 0;
      const bTime = toDate(b.entry_time)?.getTime() || 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.id).localeCompare(String(b.id));
    });
    const representative = ordered[0];
    const entryTime = minTime(ordered, 'entry_time');
    const exitTime = maxTime(ordered, 'exit_time');
    const entryDate = toDate(entryTime);
    const exitDate = toDate(exitTime);
    const groupStrategy = firstNonEmpty(ordered, 'group_detected_strategy');
    const storedStrategy = ordered.find(row => row.manual_override && row.strategy)?.strategy || firstNonEmpty(ordered, 'strategy');
    const positionStrategy = groupStrategy || storedStrategy || representative.strategy || null;
    const legCount = groupingEnabled
      ? Math.max(ordered.length, parseInt(firstNonEmpty(ordered, 'persisted_leg_count')) || 0)
      : 1;
    const symbol = firstNonEmpty(ordered, 'underlying_symbol') || representative.symbol;
    const pnl = ordered.reduce((sum, row) => sum + parseNumber(row.pnl), 0);
    const commission = ordered.reduce((sum, row) => sum + parseNumber(row.commission), 0);
    const fees = ordered.reduce((sum, row) => sum + parseNumber(row.fees), 0);
    const positionSize = ordered.reduce((sum, row) => sum + this.tradePositionSize(row), 0);

    return {
      id: representative.id,
      trade_ids: ordered.map(row => row.id),
      position_key: this.positionKey(representative),
      position_group_id: representative.position_group_id || null,
      position_grouped: groupingEnabled && ordered.length > 1,
      leg_count: legCount,
      symbol,
      raw_symbol: representative.symbol,
      account_identifier: representative.account_identifier || null,
      underlying_symbol: symbol,
      instrument_type: representative.instrument_type || 'stock',
      entry_time: entryTime,
      exit_time: exitTime,
      trade_date: representative.trade_date,
      entry_price: representative.entry_price,
      exit_price: representative.exit_price,
      quantity: ordered.reduce((sum, row) => sum + Math.abs(parseNumber(row.quantity)), 0),
      side: groupStrategy ? formatOptionStrategy(groupStrategy) : representative.side,
      strategy: positionStrategy,
      stored_strategy: storedStrategy,
      group_detected_strategy: groupStrategy,
      group_strategy_confidence: firstNonEmpty(ordered, 'group_strategy_confidence'),
      manual_override: ordered.some(row => row.manual_override === true),
      commission,
      fees,
      pnl,
      position_size: positionSize,
      hold_time_minutes: entryDate && exitDate ? (exitDate - entryDate) / (1000 * 60) : 0,
      legs: ordered.map(row => ({
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        entry_price: row.entry_price,
        exit_price: row.exit_price,
        pnl: row.pnl,
        strategy: row.strategy,
        option_type: row.option_type,
        strike_price: row.strike_price,
        expiration_date: row.expiration_date
      }))
    };
  }
}

module.exports = BehavioralAnalysisPositionService;

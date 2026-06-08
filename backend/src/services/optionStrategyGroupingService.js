const db = require('../config/database');

const DEFAULT_TIME_WINDOW_MINUTES = 5;
const KNOWN_STRATEGY_CONFIDENCE = 95;
const FALLBACK_STRATEGY_CONFIDENCE = 70;

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function toTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60);
}

function minDate(values) {
  const dates = values.map(toTime).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map(date => date.getTime()))).toISOString();
}

function maxDate(values) {
  const dates = values.map(toTime).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map(date => date.getTime()))).toISOString();
}

function combinations(items, size) {
  const result = [];
  const walk = (start, combo) => {
    if (combo.length === size) {
      result.push(combo);
      return;
    }
    for (let index = start; index <= items.length - (size - combo.length); index++) {
      walk(index + 1, combo.concat(items[index]));
    }
  };
  walk(0, []);
  return result;
}

function allSame(values) {
  const normalized = values.filter(value => value !== null && value !== undefined);
  return normalized.length > 0 && normalized.every(value => String(value) === String(normalized[0]));
}

function tradeIdsKey(ids) {
  return ids.map(String).sort().join('|');
}

class OptionStrategyGroupingService {
  static normalizeLeg(raw) {
    const entryTime = toTime(raw.entry_time || raw.entryTime);
    const expirationDate = toDateOnly(raw.expiration_date || raw.expirationDate);
    const tradeDate = toDateOnly(raw.trade_date || raw.tradeDate || entryTime);
    const strike = parseNumber(raw.strike_price ?? raw.strikePrice);
    const quantity = parseNumber(raw.quantity);
    const underlying = String(raw.underlying_symbol || raw.underlyingSymbol || raw.symbol || '').trim().toUpperCase();
    const optionType = String(raw.option_type || raw.optionType || '').trim().toLowerCase();
    const side = String(raw.side || '').trim().toLowerCase();

    if (!raw.id || !entryTime || !tradeDate || !underlying || !expirationDate || !optionType || !side || strike === null || quantity === null) {
      return null;
    }

    if (!['call', 'put'].includes(optionType) || !['long', 'short'].includes(side)) {
      return null;
    }

    return {
      id: raw.id,
      account_identifier: raw.account_identifier || raw.accountIdentifier || null,
      symbol: raw.symbol,
      underlying_symbol: underlying,
      instrument_type: raw.instrument_type || raw.instrumentType || 'option',
      expiration_date: expirationDate,
      trade_date: tradeDate,
      entry_time: entryTime.toISOString(),
      exit_time: raw.exit_time || raw.exitTime || null,
      option_type: optionType,
      strike_price: strike,
      side,
      quantity: Math.abs(quantity),
      pnl: parseNumber(raw.pnl) || 0,
      commission: parseNumber(raw.commission) || 0,
      fees: parseNumber(raw.fees) || 0,
      manual_override: raw.manual_override === true
    };
  }

  static classifyOptionStrategy(rawLegs, options = {}) {
    const legs = rawLegs
      .map(leg => this.normalizeLeg(leg) || leg)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.option_type !== b.option_type) return a.option_type.localeCompare(b.option_type);
        return a.strike_price - b.strike_price;
      });

    const metadata = this.buildMetadata(legs, options);

    if (legs.length === 2) {
      const classification = this.classifyTwoLegStrategy(legs);
      if (classification) {
        return {
          ...classification,
          confidence: KNOWN_STRATEGY_CONFIDENCE,
          method: 'option_strategy_rules',
          metadata: { ...metadata, variant: classification.variant }
        };
      }
    }

    if (legs.length === 4) {
      const classification = this.classifyFourLegStrategy(legs);
      if (classification) {
        return {
          ...classification,
          confidence: KNOWN_STRATEGY_CONFIDENCE,
          method: 'option_strategy_rules',
          metadata: { ...metadata, variant: classification.variant }
        };
      }
    }

    return {
      strategy: 'multi_leg_option',
      confidence: FALLBACK_STRATEGY_CONFIDENCE,
      method: 'option_strategy_rules',
      metadata
    };
  }

  static classifyTwoLegStrategy(legs) {
    const [a, b] = legs;
    const sides = new Set(legs.map(leg => leg.side));
    const optionTypes = new Set(legs.map(leg => leg.option_type));
    const expirations = new Set(legs.map(leg => leg.expiration_date));
    const strikes = new Set(legs.map(leg => String(leg.strike_price)));

    if (optionTypes.size === 1 && expirations.size === 1 && strikes.size === 2 && sides.size === 2) {
      const optionType = a.option_type;
      const lower = legs[0].strike_price < legs[1].strike_price ? legs[0] : legs[1];
      const higher = lower === legs[0] ? legs[1] : legs[0];

      if (optionType === 'put') {
        if (higher.side === 'short' && lower.side === 'long') {
          return { strategy: 'bull_put_spread', variant: 'credit_vertical' };
        }
        if (higher.side === 'long' && lower.side === 'short') {
          return { strategy: 'bear_put_spread', variant: 'debit_vertical' };
        }
      }

      if (optionType === 'call') {
        if (lower.side === 'long' && higher.side === 'short') {
          return { strategy: 'bull_call_spread', variant: 'debit_vertical' };
        }
        if (lower.side === 'short' && higher.side === 'long') {
          return { strategy: 'bear_call_spread', variant: 'credit_vertical' };
        }
      }
    }

    if (optionTypes.size === 1 && expirations.size > 1 && sides.size === 2) {
      if (strikes.size === 1) {
        return { strategy: 'calendar_spread', variant: 'same_strike_time_spread' };
      }
      return { strategy: 'diagonal_spread', variant: 'different_strike_time_spread' };
    }

    if (expirations.size === 1 && strikes.size === 1 && optionTypes.size === 2 && sides.size === 1) {
      return {
        strategy: a.side === 'long' ? 'long_straddle' : 'short_straddle',
        variant: 'same_strike_volatility'
      };
    }

    if (expirations.size === 1 && strikes.size === 2 && optionTypes.size === 2 && sides.size === 1) {
      return {
        strategy: a.side === 'long' ? 'long_strangle' : 'short_strangle',
        variant: 'different_strike_volatility'
      };
    }

    return null;
  }

  static classifyFourLegStrategy(legs) {
    const puts = legs.filter(leg => leg.option_type === 'put').sort((a, b) => a.strike_price - b.strike_price);
    const calls = legs.filter(leg => leg.option_type === 'call').sort((a, b) => a.strike_price - b.strike_price);

    if (puts.length !== 2 || calls.length !== 2) return null;
    if (!allSame(legs.map(leg => leg.expiration_date))) return null;
    if (new Set(puts.map(leg => String(leg.strike_price))).size !== 2) return null;
    if (new Set(calls.map(leg => String(leg.strike_price))).size !== 2) return null;

    const putLong = puts.find(leg => leg.side === 'long');
    const putShort = puts.find(leg => leg.side === 'short');
    const callLong = calls.find(leg => leg.side === 'long');
    const callShort = calls.find(leg => leg.side === 'short');
    if (!putLong || !putShort || !callLong || !callShort) return null;

    const shortSameStrike = putShort.strike_price === callShort.strike_price;
    const longSameStrike = putLong.strike_price === callLong.strike_price;

    if (shortSameStrike && putLong.strike_price < putShort.strike_price && callLong.strike_price > callShort.strike_price) {
      return { strategy: 'iron_butterfly', variant: 'short_iron_butterfly' };
    }

    if (longSameStrike && putShort.strike_price < putLong.strike_price && callShort.strike_price > callLong.strike_price) {
      return { strategy: 'iron_butterfly', variant: 'long_iron_butterfly' };
    }

    const putVertical = this.classifyTwoLegStrategy(puts);
    const callVertical = this.classifyTwoLegStrategy(calls);
    if (putVertical && callVertical && Math.max(...puts.map(leg => leg.strike_price)) < Math.min(...calls.map(leg => leg.strike_price))) {
      return { strategy: 'iron_condor', variant: `${putVertical.strategy}+${callVertical.strategy}` };
    }

    return null;
  }

  static buildMetadata(legs, options = {}) {
    return {
      detected_at: new Date().toISOString(),
      time_window_minutes: options.timeWindowMinutes || DEFAULT_TIME_WINDOW_MINUTES,
      leg_ids: legs.map(leg => leg.id),
      legs: legs.map(leg => ({
        id: leg.id,
        option_type: leg.option_type,
        side: leg.side,
        strike_price: leg.strike_price,
        expiration_date: leg.expiration_date,
        quantity: leg.quantity,
        entry_time: leg.entry_time
      }))
    };
  }

  static detectGroups(rawTrades, options = {}) {
    const timeWindowMinutes = options.timeWindowMinutes || DEFAULT_TIME_WINDOW_MINUTES;
    const candidates = rawTrades
      .map(trade => this.normalizeLeg(trade))
      .filter(leg => leg && leg.instrument_type === 'option');

    const buckets = new Map();
    for (const leg of candidates) {
      const key = [
        leg.account_identifier || '',
        leg.underlying_symbol,
        leg.expiration_date,
        leg.trade_date,
        leg.quantity
      ].join('|');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(leg);
    }

    const groups = [];
    for (const bucketLegs of buckets.values()) {
      bucketLegs.sort((a, b) => toTime(a.entry_time).getTime() - toTime(b.entry_time).getTime());
      const clusters = this.buildTimeClusters(bucketLegs, timeWindowMinutes);
      for (const cluster of clusters) {
        groups.push(...this.detectGroupsInCluster(cluster, timeWindowMinutes));
      }
    }

    return groups;
  }

  static buildTimeClusters(legs, timeWindowMinutes) {
    const clusters = [];
    let current = [];
    let currentStart = null;

    for (const leg of legs) {
      const entryTime = toTime(leg.entry_time);
      if (!currentStart || minutesBetween(currentStart, entryTime) <= timeWindowMinutes) {
        current.push(leg);
        currentStart = currentStart || entryTime;
      } else {
        if (current.length > 1) clusters.push(current);
        current = [leg];
        currentStart = entryTime;
      }
    }

    if (current.length > 1) clusters.push(current);
    return clusters;
  }

  static detectGroupsInCluster(cluster, timeWindowMinutes) {
    const unused = new Map(cluster.map(leg => [leg.id, leg]));
    const groups = [];

    const takeKnownGroups = (size) => {
      let found = true;
      while (found) {
        found = false;
        const available = Array.from(unused.values());
        for (const combo of combinations(available, size)) {
          const classification = this.classifyOptionStrategy(combo, { timeWindowMinutes });
          if (classification.strategy !== 'multi_leg_option') {
            groups.push(this.buildDetectedGroup(combo, classification));
            combo.forEach(leg => unused.delete(leg.id));
            found = true;
            break;
          }
        }
      }
    };

    takeKnownGroups(4);
    takeKnownGroups(2);

    const remaining = Array.from(unused.values());
    const byExpiration = new Map();
    for (const leg of remaining) {
      if (!byExpiration.has(leg.expiration_date)) byExpiration.set(leg.expiration_date, []);
      byExpiration.get(leg.expiration_date).push(leg);
    }

    for (const legs of byExpiration.values()) {
      if (legs.length >= 2 && legs.length <= 4) {
        groups.push(this.buildDetectedGroup(legs, this.classifyOptionStrategy(legs, { timeWindowMinutes })));
      }
    }

    return groups;
  }

  static buildDetectedGroup(legs, classification) {
    const expirationDates = Array.from(new Set(legs.map(leg => leg.expiration_date)));
    return {
      legs,
      tradeIds: legs.map(leg => leg.id),
      account_identifier: legs[0].account_identifier || null,
      underlying_symbol: legs[0].underlying_symbol,
      instrument_type: 'option',
      expiration_date: expirationDates.length === 1 ? expirationDates[0] : null,
      entry_time: minDate(legs.map(leg => leg.entry_time)),
      exit_time: maxDate(legs.map(leg => leg.exit_time)),
      trade_date: toDateOnly(minDate(legs.map(leg => leg.trade_date))),
      detected_strategy: classification.strategy,
      strategy_confidence: classification.confidence,
      classification_method: classification.method,
      classification_metadata: classification.metadata,
      total_pnl: legs.reduce((sum, leg) => sum + (parseNumber(leg.pnl) || 0), 0),
      total_commission: legs.reduce((sum, leg) => sum + (parseNumber(leg.commission) || 0), 0),
      total_fees: legs.reduce((sum, leg) => sum + (parseNumber(leg.fees) || 0), 0),
      leg_count: legs.length,
      is_completed: legs.every(leg => leg.exit_time && leg.pnl !== null && leg.pnl !== undefined)
    };
  }

  static async rebuildUserGroups(userId, options = {}) {
    const timeWindowMinutes = options.timeWindowMinutes || DEFAULT_TIME_WINDOW_MINUTES;
    const result = await db.query(`
      SELECT
        id, symbol, account_identifier, underlying_symbol, instrument_type,
        expiration_date, option_type, strike_price, side, quantity,
        entry_time, exit_time, trade_date, pnl, commission, fees, manual_override
      FROM trades
      WHERE user_id = $1
        AND instrument_type = 'option'
        AND underlying_symbol IS NOT NULL
        AND expiration_date IS NOT NULL
        AND option_type IS NOT NULL
        AND strike_price IS NOT NULL
        AND quantity IS NOT NULL
        AND entry_time IS NOT NULL
      ORDER BY trade_date, entry_time, underlying_symbol, expiration_date, strike_price
    `, [userId]);

    const groups = this.detectGroups(result.rows, { timeWindowMinutes });

    await db.query('BEGIN');
    try {
      const existingResult = await db.query(`
        SELECT
          tpg.id,
          COALESCE(ARRAY_AGG(t.id ORDER BY t.id) FILTER (WHERE t.id IS NOT NULL), ARRAY[]::uuid[]) as trade_ids
        FROM trade_position_groups tpg
        LEFT JOIN trades t ON t.position_group_id = tpg.id AND t.user_id = tpg.user_id
        WHERE tpg.user_id = $1
        GROUP BY tpg.id
      `, [userId]);

      const existingByTradeIds = new Map();
      for (const row of existingResult.rows) {
        const key = tradeIdsKey(row.trade_ids || []);
        if (key) existingByTradeIds.set(key, row.id);
      }

      await db.query('UPDATE trades SET position_group_id = NULL WHERE user_id = $1 AND position_group_id IS NOT NULL', [userId]);

      const retainedGroupIds = [];
      for (const group of groups) {
        const groupValues = [
          group.account_identifier,
          group.underlying_symbol,
          group.instrument_type,
          group.expiration_date,
          group.entry_time,
          group.exit_time,
          group.trade_date,
          group.detected_strategy,
          group.strategy_confidence,
          group.classification_method,
          JSON.stringify(group.classification_metadata || {}),
          group.total_pnl,
          group.total_commission,
          group.total_fees,
          group.leg_count,
          group.is_completed
        ];

        let groupId = existingByTradeIds.get(tradeIdsKey(group.tradeIds));
        if (groupId) {
          const updateResult = await db.query(`
            UPDATE trade_position_groups
            SET
              account_identifier = $2,
              underlying_symbol = $3,
              instrument_type = $4,
              expiration_date = $5,
              entry_time = $6,
              exit_time = $7,
              trade_date = $8,
              detected_strategy = $9,
              strategy_confidence = $10,
              classification_method = $11,
              classification_metadata = $12::jsonb,
              total_pnl = $13,
              total_commission = $14,
              total_fees = $15,
              leg_count = $16,
              is_completed = $17
            WHERE id = $1 AND user_id = $18
            RETURNING id
          `, [groupId, ...groupValues, userId]);
          groupId = updateResult.rows[0]?.id || null;
        }

        if (!groupId) {
          const insertResult = await db.query(`
            INSERT INTO trade_position_groups (
              user_id, account_identifier, underlying_symbol, instrument_type,
              expiration_date, entry_time, exit_time, trade_date,
              detected_strategy, strategy_confidence, classification_method, classification_metadata,
              total_pnl, total_commission, total_fees, leg_count, is_completed
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)
            RETURNING id
          `, [userId, ...groupValues]);
          groupId = insertResult.rows[0].id;
        }

        retainedGroupIds.push(groupId);

        await db.query(
          'UPDATE trades SET position_group_id = $1 WHERE user_id = $2 AND id = ANY($3::uuid[])',
          [groupId, userId, group.tradeIds]
        );
      }

      if (retainedGroupIds.length > 0) {
        await db.query('DELETE FROM trade_position_groups WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))', [userId, retainedGroupIds]);
      } else {
        await db.query('DELETE FROM trade_position_groups WHERE user_id = $1', [userId]);
      }

      await db.query('COMMIT');
      return { groupsCreated: groups.length, legsGrouped: groups.reduce((sum, group) => sum + group.leg_count, 0) };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  static async rebuildUserGroupsSafe(userId, context = 'trade mutation') {
    try {
      const result = await this.rebuildUserGroups(userId);
      console.log(`[OPTION-GROUPING] Rebuilt option strategy groups after ${context}: ${result.groupsCreated} groups, ${result.legsGrouped} legs`);
      return result;
    } catch (error) {
      console.warn(`[OPTION-GROUPING] Failed to rebuild option strategy groups after ${context}: ${error.message}`);
      return { groupsCreated: 0, legsGrouped: 0, error: error.message };
    }
  }
}

OptionStrategyGroupingService.DEFAULT_TIME_WINDOW_MINUTES = DEFAULT_TIME_WINDOW_MINUTES;

module.exports = OptionStrategyGroupingService;

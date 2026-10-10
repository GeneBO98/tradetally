#!/usr/bin/env node

require('dotenv').config();

const db = require('../src/config/database');
const PortfolioService = require('../src/services/portfolioService');

const DEMO_NOTE_PREFIX = '[RETIREMENT DEMO]';
const ACCOUNT_IDENTIFIER = 'RETIREMENT-DEMO';
const TARGET_CURRENT_VALUE = 155000;
const LOT_SCHEDULE = [
  { years_ago: 6, portfolio_fraction: 0.45 },
  { years_ago: 5, portfolio_fraction: 0.11 },
  { years_ago: 4, portfolio_fraction: 0.11 },
  { years_ago: 3, portfolio_fraction: 0.11 },
  { years_ago: 2, portfolio_fraction: 0.11 },
  { years_ago: 1, portfolio_fraction: 0.11 }
];
const POSITIONS = [
  {
    symbol: 'VTI',
    allocation_percent: 50,
    sector: 'Diversified',
    description: 'Broad U.S. stock market core'
  },
  {
    symbol: 'BRK.B',
    allocation_percent: 45,
    sector: 'Financial Services',
    description: 'Diversified quality tilt'
  },
  {
    symbol: 'AMZN',
    allocation_percent: 5,
    sector: 'Consumer Discretionary',
    description: 'Small growth allocation'
  }
];

function toDateString(value) {
  return value.toISOString().split('T')[0];
}

function dateYearsAgo(years) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return toDateString(date);
}

function normalizeCandle(candle) {
  const timestamp = typeof candle.time === 'number'
    ? candle.time * 1000
    : Date.parse(candle.time);

  return {
    date: toDateString(new Date(timestamp)),
    close: Number(candle.close)
  };
}

function closeOnOrAfter(candles, requestedDate) {
  return candles.find(candle => candle.date >= requestedDate)
    || candles[candles.length - 1];
}

async function getUserByEmail(email) {
  const result = await db.query(
    `SELECT id, email
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

async function loadPositionHistory(userId) {
  const requestedStart = dateYearsAgo(10);
  const requestedEnd = toDateString(new Date());
  const histories = new Map();

  for (const position of POSITIONS) {
    const rawCandles = await PortfolioService._getDailySeries(
      position.symbol,
      requestedStart,
      requestedEnd,
      userId,
      { allowFullHistory: true }
    );
    const candles = rawCandles
      .map(normalizeCandle)
      .filter(candle => Number.isFinite(candle.close) && candle.close > 0)
      .sort((left, right) => left.date.localeCompare(right.date));

    const fiveYearStart = dateYearsAgo(5);
    const fiveYearCandles = candles.filter(candle => candle.date >= fiveYearStart);
    const coveredDays = fiveYearCandles.length > 1
      ? (
          new Date(`${fiveYearCandles[fiveYearCandles.length - 1].date}T00:00:00.000Z`)
          - new Date(`${fiveYearCandles[0].date}T00:00:00.000Z`)
        ) / 86_400_000
      : 0;

    if (coveredDays < (365.25 * 5 * 0.8)) {
      throw new Error(`${position.symbol} does not have enough market history to seed the five-year example`);
    }

    histories.set(position.symbol, candles);
  }

  return histories;
}

async function findOrCreateHolding(client, userId, position) {
  const existing = await client.query(
    `SELECT id, notes
     FROM investment_holdings
     WHERE user_id = $1
       AND symbol = $2
     LIMIT 1`,
    [userId, position.symbol]
  );

  if (existing.rows[0]) {
    if (String(existing.rows[0].notes || '').startsWith(DEMO_NOTE_PREFIX)) {
      await client.query(
        `UPDATE investment_holdings
         SET target_allocation_percent = $3,
             notes = $4,
             sector = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND user_id = $2`,
        [
          existing.rows[0].id,
          userId,
          position.allocation_percent,
          `${DEMO_NOTE_PREFIX} ${position.description}.`,
          position.sector
        ]
      );
    }
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO investment_holdings (
       user_id,
       symbol,
       total_shares,
       average_cost_basis,
       total_cost_basis,
       target_allocation_percent,
       notes,
       sector
     )
     VALUES ($1, $2, 0, 0, 0, $3, $4, $5)
     RETURNING id`,
    [
      userId,
      position.symbol,
      position.allocation_percent,
      `${DEMO_NOTE_PREFIX} ${position.description}.`,
      position.sector
    ]
  );

  return inserted.rows[0].id;
}

async function upsertAccount(client, userId, initialBalance, initialBalanceDate) {
  const existing = await client.query(
    `SELECT id
     FROM user_accounts
     WHERE user_id = $1
       AND account_identifier = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId, ACCOUNT_IDENTIFIER]
  );

  const accountNotes = `${DEMO_NOTE_PREFIX} Six years of annual contributions in a broad-market portfolio with a modest quality tilt.`;
  if (existing.rows[0]) {
    await client.query(
      `UPDATE user_accounts
       SET account_name = 'Index Plus Retirement Example',
           broker = 'Portfolio Demo',
           initial_balance = $3,
           initial_balance_date = $4,
           notes = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2`,
      [existing.rows[0].id, userId, initialBalance, initialBalanceDate, accountNotes]
    );

    await client.query(
      `DELETE FROM user_accounts
       WHERE user_id = $1
         AND account_identifier = $2
         AND id <> $3`,
      [userId, ACCOUNT_IDENTIFIER, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO user_accounts (
       user_id,
       account_name,
       account_identifier,
       broker,
       initial_balance,
       initial_balance_date,
       is_primary,
       notes
     )
     VALUES ($1, 'Index Plus Retirement Example', $2, 'Portfolio Demo', $3, $4, false, $5)
     RETURNING id`,
    [userId, ACCOUNT_IDENTIFIER, initialBalance, initialBalanceDate, accountNotes]
  );

  return inserted.rows[0].id;
}

async function seedRetirementPortfolioDemo(email) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error(`User not found for email ${email}`);
  }

  const histories = await loadPositionHistory(user.id);
  const seededPositions = [];
  let initialBalance = 0;
  let initialBalanceDate = null;

  await db.withTransaction(async client => {
    await client.query(
      `DELETE FROM investment_lots
       WHERE user_id = $1
         AND account_identifier = $2`,
      [user.id, ACCOUNT_IDENTIFIER]
    );

    await client.query(
      `DELETE FROM investment_holdings h
       WHERE h.user_id = $1
         AND h.notes LIKE $2
         AND NOT EXISTS (
           SELECT 1
           FROM investment_lots l
           WHERE l.holding_id = h.id
         )`,
      [user.id, `${DEMO_NOTE_PREFIX}%`]
    );

    for (const position of POSITIONS) {
      const candles = histories.get(position.symbol);
      const latest = candles[candles.length - 1];
      const positionCurrentValue = TARGET_CURRENT_VALUE * (position.allocation_percent / 100);
      const totalShares = positionCurrentValue / latest.close;
      const holdingId = await findOrCreateHolding(client, user.id, position);
      let positionCost = 0;

      for (const scheduledLot of LOT_SCHEDULE) {
        const requestedPurchaseDate = dateYearsAgo(scheduledLot.years_ago);
        const purchaseCandle = closeOnOrAfter(candles, requestedPurchaseDate);
        const shares = totalShares * scheduledLot.portfolio_fraction;
        const totalCost = shares * purchaseCandle.close;
        positionCost += totalCost;

        if (!initialBalanceDate || purchaseCandle.date < initialBalanceDate) {
          initialBalanceDate = purchaseCandle.date;
        }
        if (scheduledLot === LOT_SCHEDULE[0]) {
          initialBalance += totalCost;
        }

        await client.query(
          `INSERT INTO investment_lots (
             holding_id,
             user_id,
             shares,
             cost_per_share,
             total_cost,
             purchase_date,
             broker,
             account_identifier,
             notes,
             source
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'Portfolio Demo', $7, $8, 'manual')`,
          [
            holdingId,
            user.id,
            shares,
            purchaseCandle.close,
            totalCost,
            purchaseCandle.date,
            ACCOUNT_IDENTIFIER,
            `${DEMO_NOTE_PREFIX} Annual contribution cohort.`
          ]
        );
      }

      await client.query(
        `WITH totals AS (
           SELECT
             holding_id,
             SUM(shares) AS shares,
             SUM(total_cost) AS cost
           FROM investment_lots
           WHERE holding_id = $1
           GROUP BY holding_id
         )
         UPDATE investment_holdings h
         SET total_shares = totals.shares,
             total_cost_basis = totals.cost,
             average_cost_basis = CASE
               WHEN totals.shares > 0 THEN totals.cost / totals.shares
               ELSE 0
             END,
             current_price = $2,
             current_value = totals.shares * $2,
             unrealized_pnl = (totals.shares * $2) - totals.cost,
             unrealized_pnl_percent = CASE
               WHEN totals.cost > 0 THEN (((totals.shares * $2) - totals.cost) / totals.cost) * 100
               ELSE 0
             END,
             price_updated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         FROM totals
         WHERE h.id = totals.holding_id`,
        [holdingId, latest.close]
      );

      await client.query(
        `INSERT INTO price_monitoring (
           symbol,
           current_price,
           previous_price,
           price_change,
           percent_change,
           data_source,
           last_updated
         )
         VALUES ($1, $2, $2, 0, 0, 'retirement_demo', CURRENT_TIMESTAMP)
         ON CONFLICT (symbol) DO UPDATE SET
           current_price = EXCLUDED.current_price,
           last_updated = CURRENT_TIMESTAMP,
           data_source = EXCLUDED.data_source`,
        [position.symbol, latest.close]
      );

      seededPositions.push({
        symbol: position.symbol,
        allocation_percent: position.allocation_percent,
        shares: Number(totalShares.toFixed(6)),
        current_price: latest.close,
        current_value: Number(positionCurrentValue.toFixed(2)),
        cost_basis: Number(positionCost.toFixed(2))
      });
    }

    await upsertAccount(client, user.id, initialBalance, initialBalanceDate);
  });

  const historicalScenarios = await PortfolioService.getHistoricalReturnScenarios(
    user.id,
    { accounts: ACCOUNT_IDENTIFIER }
  );

  return {
    user_id: user.id,
    email: user.email,
    account_name: 'Index Plus Retirement Example',
    account_identifier: ACCOUNT_IDENTIFIER,
    current_value: TARGET_CURRENT_VALUE,
    first_purchase_date: initialBalanceDate,
    lots_created: POSITIONS.length * LOT_SCHEDULE.length,
    positions: seededPositions,
    historical_scenarios: historicalScenarios
  };
}

async function main() {
  const email = process.argv[2] || 'demo@example.com';

  try {
    const result = await seedRetirementPortfolioDemo(email);
    console.log('[SUCCESS] Retirement portfolio demo seeded');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[ERROR] Failed to seed retirement portfolio demo:', error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ACCOUNT_IDENTIFIER,
  POSITIONS,
  seedRetirementPortfolioDemo
};

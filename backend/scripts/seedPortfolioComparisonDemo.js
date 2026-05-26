#!/usr/bin/env node

require('dotenv').config();

const db = require('../src/config/database');

const DEMO_NOTE_PREFIX = '[PORTFOLIO DEMO]';

const PORTFOLIOS = [
  {
    account_name: 'Alpha Outperformer',
    account_identifier: 'PORT-ALPHA',
    broker: 'Portfolio Demo',
    initial_balance: 150000,
    initial_balance_date: '2025-01-02',
    is_primary: true,
    notes: `${DEMO_NOTE_PREFIX} Built to outperform SPY with growth-heavy names.`,
    positions: [
      {
        symbol: 'PLTR',
        shares: 140,
        cost_per_share: 28.4,
        purchase_date: '2025-01-10',
        sector: 'Technology',
        target_allocation_percent: 42,
        notes: `${DEMO_NOTE_PREFIX} Growth allocation leader.`
      },
      {
        symbol: 'META',
        shares: 36,
        cost_per_share: 472.5,
        purchase_date: '2025-02-18',
        sector: 'Communication Services',
        target_allocation_percent: 33,
        notes: `${DEMO_NOTE_PREFIX} Core compounder.`
      },
      {
        symbol: 'UBER',
        shares: 110,
        cost_per_share: 71.8,
        purchase_date: '2025-03-05',
        sector: 'Technology',
        target_allocation_percent: 25,
        notes: `${DEMO_NOTE_PREFIX} Tactical growth sleeve.`
      }
    ],
    dividends: [
      {
        symbol: 'META',
        dividend_per_share: 0.5,
        shares_held: 36,
        payment_date: '2025-12-26',
        ex_dividend_date: '2025-12-12',
        notes: `${DEMO_NOTE_PREFIX} Synthetic demo dividend.`
      }
    ]
  },
  {
    account_name: 'Lagging Value Trap',
    account_identifier: 'PORT-LAG',
    broker: 'Portfolio Demo',
    initial_balance: 150000,
    initial_balance_date: '2025-01-02',
    is_primary: false,
    notes: `${DEMO_NOTE_PREFIX} Built to underperform SPY with weaker holdings.`,
    positions: [
      {
        symbol: 'INTC',
        shares: 260,
        cost_per_share: 31.9,
        purchase_date: '2025-01-10',
        sector: 'Technology',
        target_allocation_percent: 35,
        notes: `${DEMO_NOTE_PREFIX} Underperforming turnaround bet.`
      },
      {
        symbol: 'NKE',
        shares: 85,
        cost_per_share: 91.4,
        purchase_date: '2025-02-20',
        sector: 'Consumer Discretionary',
        target_allocation_percent: 33,
        notes: `${DEMO_NOTE_PREFIX} Weak consumer exposure.`
      },
      {
        symbol: 'PFE',
        shares: 210,
        cost_per_share: 30.8,
        purchase_date: '2025-03-07',
        sector: 'Healthcare',
        target_allocation_percent: 32,
        notes: `${DEMO_NOTE_PREFIX} Defensive income sleeve.`
      }
    ],
    dividends: [
      {
        symbol: 'PFE',
        dividend_per_share: 0.42,
        shares_held: 210,
        payment_date: '2025-11-28',
        ex_dividend_date: '2025-11-08',
        notes: `${DEMO_NOTE_PREFIX} Synthetic demo dividend.`
      }
    ]
  }
];

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

async function cleanupExistingDemoData(userId) {
  const seededSymbols = PORTFOLIOS.flatMap((portfolio) =>
    portfolio.positions.map((position) => position.symbol)
  );
  const accountIdentifiers = PORTFOLIOS.map((portfolio) => portfolio.account_identifier);

  await db.query(
    `DELETE FROM investment_dividends
     WHERE user_id = $1
       AND notes LIKE $2`,
    [userId, `${DEMO_NOTE_PREFIX}%`]
  );

  await db.query(
    `DELETE FROM investment_lots
     WHERE user_id = $1
       AND (
         notes LIKE $2
         OR account_identifier = ANY($3)
       )`,
    [userId, `${DEMO_NOTE_PREFIX}%`, accountIdentifiers]
  );

  await db.query(
    `DELETE FROM investment_holdings
     WHERE user_id = $1
       AND (
         notes LIKE $2
         OR symbol = ANY($3)
       )`,
    [userId, `${DEMO_NOTE_PREFIX}%`, seededSymbols]
  );

  await db.query(
    `DELETE FROM user_accounts
     WHERE user_id = $1
       AND account_identifier = ANY($2)`,
    [userId, accountIdentifiers]
  );
}

async function userHasPrimaryAccount(userId) {
  const result = await db.query(
    `SELECT 1
     FROM user_accounts
     WHERE user_id = $1
       AND is_primary = true
     LIMIT 1`,
    [userId]
  );

  return result.rows.length > 0;
}

async function insertAccount(userId, portfolio, isPrimaryOverride = null) {
  const isPrimary = isPrimaryOverride === null ? portfolio.is_primary : isPrimaryOverride;

  const result = await db.query(
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      portfolio.account_name,
      portfolio.account_identifier,
      portfolio.broker,
      portfolio.initial_balance,
      portfolio.initial_balance_date,
      isPrimary,
      portfolio.notes
    ]
  );

  return result.rows[0].id;
}

async function insertHolding(userId, portfolio, position) {
  const totalCost = Number(position.shares) * Number(position.cost_per_share);

  const holdingResult = await db.query(
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      position.symbol,
      position.shares,
      position.cost_per_share,
      totalCost,
      position.target_allocation_percent,
      position.notes,
      position.sector
    ]
  );

  const holdingId = holdingResult.rows[0].id;

  await db.query(
    `INSERT INTO investment_lots (
       holding_id,
       user_id,
       shares,
       cost_per_share,
       total_cost,
       purchase_date,
       broker,
       account_identifier,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      holdingId,
      userId,
      position.shares,
      position.cost_per_share,
      totalCost,
      position.purchase_date,
      portfolio.broker,
      portfolio.account_identifier,
      position.notes
    ]
  );

  return holdingId;
}

async function insertDividend(userId, holdingId, symbol, dividend) {
  const totalAmount = Number(dividend.dividend_per_share) * Number(dividend.shares_held);

  await db.query(
    `INSERT INTO investment_dividends (
       holding_id,
       user_id,
       symbol,
       dividend_per_share,
       shares_held,
       total_amount,
       ex_dividend_date,
       payment_date,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      holdingId,
      userId,
      symbol,
      dividend.dividend_per_share,
      dividend.shares_held,
      totalAmount,
      dividend.ex_dividend_date,
      dividend.payment_date,
      dividend.notes
    ]
  );

  await db.query(
    `UPDATE investment_holdings
     SET
       total_dividends_received = COALESCE(total_dividends_received, 0) + $2,
       last_dividend_date = GREATEST(COALESCE(last_dividend_date, $1::date), $1::date),
       dividend_yield_on_cost = CASE
         WHEN total_cost_basis > 0
           THEN ((COALESCE(total_dividends_received, 0) + $2) / total_cost_basis) * 100
         ELSE 0
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [dividend.payment_date, totalAmount, holdingId]
  );
}

async function seedPortfolioComparisonDemo(email) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error(`User not found for email ${email}`);
  }

  await cleanupExistingDemoData(user.id);
  const hasExistingPrimary = await userHasPrimaryAccount(user.id);

  for (const portfolio of PORTFOLIOS) {
    await insertAccount(user.id, portfolio, hasExistingPrimary ? false : portfolio.is_primary);

    const holdingsBySymbol = new Map();
    for (const position of portfolio.positions) {
      const holdingId = await insertHolding(user.id, portfolio, position);
      holdingsBySymbol.set(position.symbol, holdingId);
    }

    for (const dividend of portfolio.dividends) {
      const holdingId = holdingsBySymbol.get(dividend.symbol);
      if (holdingId) {
        await insertDividend(user.id, holdingId, dividend.symbol, dividend);
      }
    }
  }

  await db.query(
    `INSERT INTO portfolio_preferences (
       user_id,
       default_benchmark_symbol,
       drift_threshold_percent,
       drawdown_threshold_percent,
       alerts_enabled
     )
     VALUES ($1, 'SPY', 4.00, 8.00, true)
     ON CONFLICT (user_id) DO UPDATE SET
       default_benchmark_symbol = EXCLUDED.default_benchmark_symbol,
       drift_threshold_percent = EXCLUDED.drift_threshold_percent,
       drawdown_threshold_percent = EXCLUDED.drawdown_threshold_percent,
       alerts_enabled = EXCLUDED.alerts_enabled,
       updated_at = CURRENT_TIMESTAMP`,
    [user.id]
  );

  return {
    user_id: user.id,
    email: user.email,
    accounts_created: PORTFOLIOS.length,
    positions_created: PORTFOLIOS.reduce((sum, portfolio) => sum + portfolio.positions.length, 0)
  };
}

async function main() {
  const email = process.argv[2] || 'demo@example.com';

  try {
    const result = await seedPortfolioComparisonDemo(email);
    console.log('[SUCCESS] Portfolio comparison demo seeded');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[ERROR] Failed to seed portfolio comparison demo:', error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

main();

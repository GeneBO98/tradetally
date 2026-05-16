#!/usr/bin/env node

require('dotenv').config();

const db = require('../src/config/database');
const { findRiskySeqScans } = require('../src/utils/queryPlanGuard');

const SAMPLE_USER_ID = '00000000-0000-0000-0000-000000000000';

const checks = [
  {
    name: 'trade-management:r-performance',
    sql: `
      SELECT
        id, symbol, trade_date, entry_price, exit_price,
        quantity, side, pnl, stop_loss, take_profit,
        take_profit_targets, management_r, risk_level_history,
        manual_target_hit_first, executions,
        commission, fees, instrument_type, contract_size, point_value
      FROM trades
      WHERE user_id = $1
        AND exit_price IS NOT NULL
        AND stop_loss IS NOT NULL
      ORDER BY trade_date ASC, id ASC
      LIMIT 2000
    `,
    values: [SAMPLE_USER_ID]
  },
  {
    name: 'trade-management:selector',
    sql: `
      WITH filtered_trades AS (
        SELECT t.*
        FROM trades t
        WHERE t.user_id = $1
          AND t.exit_price IS NOT NULL
      ),
      numbered_trades AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY trade_date ASC, id ASC) as trade_number
        FROM filtered_trades
        WHERE stop_loss IS NOT NULL
      )
      SELECT t.id, t.symbol, t.trade_date, t.entry_time, t.exit_time, nt.trade_number
      FROM filtered_trades t
      LEFT JOIN numbered_trades nt ON t.id = nt.id
      ORDER BY t.trade_date DESC, t.entry_time DESC
      LIMIT 50 OFFSET 0
    `,
    values: [SAMPLE_USER_ID]
  }
];

async function explain(check) {
  const result = await db.query(`EXPLAIN (FORMAT JSON) ${check.sql}`, check.values);
  return result.rows[0]['QUERY PLAN'];
}

async function main() {
  let failures = 0;

  for (const check of checks) {
    const plan = await explain(check);
    const riskySeqScans = findRiskySeqScans(plan, {
      relationNames: ['trades'],
      minPlanRows: Number(process.env.QUERY_PLAN_SEQ_SCAN_ROW_THRESHOLD || 10000)
    });

    if (riskySeqScans.length > 0) {
      failures++;
      console.error(`[QUERY-PLAN] ${check.name} has risky Seq Scan nodes:`);
      riskySeqScans.forEach(node => {
        console.error(`  relation=${node['Relation Name']} rows=${node['Plan Rows']} filter=${node.Filter || ''}`);
      });
    } else {
      console.log(`[QUERY-PLAN] ${check.name} passed`);
    }
  }

  await db.pool.end();

  if (failures > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('[QUERY-PLAN] Failed:', error.message);
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
}

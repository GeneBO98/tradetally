-- Backfill issue #304 Tradovate broker fee settings onto existing imports.
--
-- Tradovate order exports do not include commission/fee columns. During import,
-- Broker Commission & Fee Settings are applied at the trade level. Existing
-- Tradovate imports that were created before that fix, or edited while the
-- execution-cost regression was live, can have trade-level commission/fees set
-- to zero even though matching broker fee settings exist.
--
-- This mirrors the import-time broker fee calculation for Tradovate trades that
-- currently have zero trade-level costs and zero execution-level costs. It does
-- not touch trades that already have explicit costs.

WITH eligible_trades AS (
  SELECT
    t.id,
    t.user_id,
    UPPER(COALESCE(t.symbol, '')) AS symbol,
    SUBSTRING(UPPER(COALESCE(t.symbol, '')) FROM '^([A-Z]{2,4})[FGHJKMNQUVXZ][0-9]{1,2}$') AS base_symbol,
    ABS(COALESCE(t.quantity, 0)) AS quantity,
    t.exit_price,
    t.pnl
  FROM trades t
  WHERE LOWER(COALESCE(t.broker, '')) IN ('tradovate', 'tradeovate')
    AND COALESCE(t.commission, 0) = 0
    AND COALESCE(t.fees, 0) = 0
    AND t.executions IS NOT NULL
    AND jsonb_typeof(t.executions) = 'array'
    AND jsonb_array_length(t.executions) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(t.executions) AS exec(item)
      WHERE COALESCE(NULLIF(exec.item->>'commission', '')::numeric, 0) <> 0
         OR COALESCE(NULLIF(exec.item->>'fees', '')::numeric, 0) <> 0
    )
),
matched_fee_settings AS (
  SELECT DISTINCT ON (et.id)
    et.id,
    et.quantity,
    et.exit_price,
    et.pnl,
    COALESCE(bfs.commission_per_contract, 0) AS commission_per_contract,
    COALESCE(bfs.commission_per_side, 0) AS commission_per_side,
    COALESCE(bfs.exchange_fee_per_contract, 0) +
      COALESCE(bfs.nfa_fee_per_contract, 0) +
      COALESCE(bfs.clearing_fee_per_contract, 0) +
      COALESCE(bfs.platform_fee_per_contract, 0) AS fees_per_contract
  FROM eligible_trades et
  JOIN broker_fee_settings bfs
    ON bfs.user_id = et.user_id
   AND LOWER(COALESCE(bfs.broker, '')) IN ('tradovate', 'tradeovate')
   AND (
     UPPER(COALESCE(bfs.instrument, '')) = et.symbol
     OR (et.base_symbol IS NOT NULL AND UPPER(COALESCE(bfs.instrument, '')) = et.base_symbol)
     OR COALESCE(bfs.instrument, '') = ''
   )
  WHERE COALESCE(bfs.commission_per_contract, 0) <> 0
     OR COALESCE(bfs.commission_per_side, 0) <> 0
     OR COALESCE(bfs.exchange_fee_per_contract, 0) <> 0
     OR COALESCE(bfs.nfa_fee_per_contract, 0) <> 0
     OR COALESCE(bfs.clearing_fee_per_contract, 0) <> 0
     OR COALESCE(bfs.platform_fee_per_contract, 0) <> 0
  ORDER BY
    et.id,
    CASE
      WHEN UPPER(COALESCE(bfs.instrument, '')) = et.symbol THEN 1
      WHEN et.base_symbol IS NOT NULL AND UPPER(COALESCE(bfs.instrument, '')) = et.base_symbol THEN 2
      ELSE 3
    END
),
calculated_costs AS (
  SELECT
    id,
    ((commission_per_contract * quantity * CASE WHEN exit_price IS NOT NULL THEN 2 ELSE 1 END) +
      (commission_per_side * CASE WHEN exit_price IS NOT NULL THEN 2 ELSE 1 END)) AS total_commission,
    (fees_per_contract * quantity * CASE WHEN exit_price IS NOT NULL THEN 2 ELSE 1 END) AS total_fees,
    ((commission_per_contract * quantity) + commission_per_side) AS entry_commission,
    CASE WHEN exit_price IS NOT NULL THEN ((commission_per_contract * quantity) + commission_per_side) ELSE 0 END AS exit_commission,
    pnl,
    exit_price
  FROM matched_fee_settings
)
UPDATE trades t
SET
  commission = calculated_costs.total_commission,
  entry_commission = calculated_costs.entry_commission,
  exit_commission = calculated_costs.exit_commission,
  fees = calculated_costs.total_fees,
  pnl = CASE
    WHEN calculated_costs.exit_price IS NOT NULL AND calculated_costs.pnl IS NOT NULL
      THEN calculated_costs.pnl - calculated_costs.total_commission - calculated_costs.total_fees
    ELSE t.pnl
  END
FROM calculated_costs
WHERE t.id = calculated_costs.id
  AND (calculated_costs.total_commission <> 0 OR calculated_costs.total_fees <> 0);

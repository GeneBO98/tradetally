-- Migration: Add currency metadata to cached 8-pillars analyses
-- Created: 2026-09-15
-- Purpose: Display-currency conversion needs to know, per cached analysis,
-- which currency the pillar amounts were computed in: the company reporting
-- currency (revenue/FCF/debt figures) and the listing trading currency
-- (market cap / price). Pillar 8 FCF inputs are stored normalized to the
-- trading currency; all other pillar money values remain in reporting
-- currency. Legacy rows without metadata are treated as USD.

ALTER TABLE eight_pillars_analysis
  ADD COLUMN IF NOT EXISTS reporting_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS trading_currency VARCHAR(3);

-- Migration 281: make sure broker_trade_exclusions carries source_trade_id.
--
-- Migration 258 creates the table with this column, but on databases where the
-- table already existed (older cloud builds, or a 258 run whose CREATE TABLE
-- was skipped) the column is missing and every trade delete fails with
--   column "source_trade_id" of relation "broker_trade_exclusions" does not exist
-- Idempotent: safe to run on databases that already have the column.

ALTER TABLE broker_trade_exclusions
  ADD COLUMN IF NOT EXISTS source_trade_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS broker_trade_exclusions_source_trade_idx
  ON broker_trade_exclusions (user_id, source_trade_id);

CREATE INDEX IF NOT EXISTS broker_trade_exclusions_user_broker_idx
  ON broker_trade_exclusions (user_id, broker_type);

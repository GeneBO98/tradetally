-- Keep the scanner list consistent with the live 8 Pillars detail view.
--
-- The scanner list reads pre-computed rows from stock_pillar_results, which are
-- only written when a scan runs (quarterly). The detail view recalculates live
-- via EightPillarsService and invalidates its cache whenever CALCULATION_VERSION
-- changes. That let the two drift apart (e.g. list shows 8/8, detail shows 6/8).
--
-- These columns let the scan rows record which calculation version produced them
-- and when they were last refreshed, so the detail/refresh paths can write fresh
-- results back into the current scan's row (a write-through) and the list can
-- surface staleness.
ALTER TABLE stock_pillar_results
  ADD COLUMN IF NOT EXISTS calculation_version INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

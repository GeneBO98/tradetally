-- Migration: Create fx_daily_rates table for persisted FX conversion rates
-- Created: 2026-09-15
-- Purpose: Currency display conversion should read one daily snapshot of FX
-- rates from the database instead of calling the FX API on every request.
-- Each row stores a full base->quotes rate map for one calendar day, e.g.
-- base_code='USD', rates={"EUR":0.88,"GBP":0.74,...}.

CREATE TABLE IF NOT EXISTS fx_daily_rates (
  base_code VARCHAR(3) NOT NULL,
  rate_date DATE NOT NULL,          -- calendar date the rates serve (request date, not ECB fixing date)
  source_date DATE,                 -- actual fixing date returned by the provider (previous business day for weekends/holidays)
  rates JSONB NOT NULL,             -- map of quote currency -> units of quote per 1 unit of base
  source VARCHAR(30) NOT NULL DEFAULT 'frankfurter',
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_code, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_daily_rates_date ON fx_daily_rates(rate_date DESC);

COMMENT ON TABLE fx_daily_rates IS 'Daily FX rate snapshots (one row per base currency per calendar day) used for display-currency conversion';

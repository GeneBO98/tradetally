-- Support continuous futures markers like "CONT" for TradingView imports
-- and keep instrument templates aligned with the trades schema.

ALTER TABLE trades
ALTER COLUMN contract_month TYPE VARCHAR(10);

ALTER TABLE instrument_templates
ALTER COLUMN contract_month TYPE VARCHAR(10);

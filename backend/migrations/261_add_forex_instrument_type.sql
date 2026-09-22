-- TradingView forex imports need a distinct instrument category so quote
-- currency and market-data behavior are not mistaken for stock behavior.
ALTER TABLE trades
  DROP CONSTRAINT IF EXISTS trades_instrument_type_check;

ALTER TABLE trades
  ADD CONSTRAINT trades_instrument_type_check CHECK (instrument_type IN ('stock', 'option', 'future', 'crypto', 'forex'));

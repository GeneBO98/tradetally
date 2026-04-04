ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS display_currency VARCHAR(10) DEFAULT 'USD';

COMMENT ON COLUMN user_settings.display_currency
  IS 'Currency code for displaying trade values in the UI (e.g., USD, EUR, GBP). Does not affect market data.';

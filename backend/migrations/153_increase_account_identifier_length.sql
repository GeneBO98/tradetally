-- Increase account_identifier from VARCHAR(20) to VARCHAR(50)
-- to accommodate longer broker account identifiers (e.g., Tradovate)
ALTER TABLE trades
ALTER COLUMN account_identifier TYPE VARCHAR(50);

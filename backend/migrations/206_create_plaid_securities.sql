-- Plaid securities reference table
-- Stores security metadata (ticker, name, type) from Plaid investments responses.
-- Global table: Plaid security_ids are not user-scoped, so rows are shared
-- across users and upserted during holdings and investment transaction syncs.

CREATE TABLE IF NOT EXISTS plaid_securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaid_security_id VARCHAR(255) NOT NULL UNIQUE,
    ticker_symbol VARCHAR(50),
    name VARCHAR(255),
    security_type VARCHAR(50),
    is_cash_equivalent BOOLEAN NOT NULL DEFAULT false,
    iso_currency_code VARCHAR(10),
    cusip VARCHAR(20),
    isin VARCHAR(20),
    close_price DECIMAL(20, 6),
    close_price_as_of DATE,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plaid_securities_ticker
    ON plaid_securities(ticker_symbol);

DROP TRIGGER IF EXISTS update_plaid_securities_updated_at ON plaid_securities;
CREATE TRIGGER update_plaid_securities_updated_at
    BEFORE UPDATE ON plaid_securities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

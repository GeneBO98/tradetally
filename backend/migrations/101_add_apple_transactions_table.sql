-- Add apple_transactions table for tracking Apple In-App Purchases
-- Migration: 101_add_apple_transactions_table.sql

CREATE TABLE IF NOT EXISTS apple_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  original_transaction_id VARCHAR(255),
  product_id VARCHAR(255) NOT NULL,
  purchase_date TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_date TIMESTAMP,
  is_trial BOOLEAN DEFAULT FALSE,
  environment VARCHAR(50) DEFAULT 'Production',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_apple_transactions_user_id ON apple_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_apple_transactions_transaction_id ON apple_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_apple_transactions_original_transaction_id ON apple_transactions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_apple_transactions_expires_date ON apple_transactions(expires_date);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_apple_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER apple_transactions_updated_at
  BEFORE UPDATE ON apple_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_apple_transactions_updated_at();

-- Add comments for documentation
COMMENT ON TABLE apple_transactions IS 'Tracks Apple In-App Purchase transactions for subscription verification';
COMMENT ON COLUMN apple_transactions.transaction_id IS 'Unique transaction ID from Apple StoreKit';
COMMENT ON COLUMN apple_transactions.original_transaction_id IS 'Original transaction ID for renewals';
COMMENT ON COLUMN apple_transactions.product_id IS 'Apple product identifier (e.g., com.tradetally.ios.pro.monthly)';
COMMENT ON COLUMN apple_transactions.expires_date IS 'Subscription expiration date (NULL for non-consumables)';
COMMENT ON COLUMN apple_transactions.is_trial IS 'Whether this transaction was from a free trial period';
COMMENT ON COLUMN apple_transactions.environment IS 'Apple environment: Production, Sandbox, or Xcode';

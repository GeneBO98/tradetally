CREATE TABLE IF NOT EXISTS invoice_ninja_revenue_syncs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_invoice_id VARCHAR(255) NOT NULL UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invoice_ninja_client_id VARCHAR(255),
    invoice_ninja_invoice_id VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_ninja_revenue_syncs_user_id
    ON invoice_ninja_revenue_syncs(user_id);

CREATE INDEX IF NOT EXISTS idx_invoice_ninja_revenue_syncs_status
    ON invoice_ninja_revenue_syncs(status);

DROP TRIGGER IF EXISTS update_invoice_ninja_revenue_syncs_updated_at
    ON invoice_ninja_revenue_syncs;

CREATE TRIGGER update_invoice_ninja_revenue_syncs_updated_at
    BEFORE UPDATE ON invoice_ninja_revenue_syncs
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

COMMENT ON TABLE invoice_ninja_revenue_syncs IS
    'Tracks Stripe invoice revenue synced into Invoice Ninja to prevent duplicates and retain error state';

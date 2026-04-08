CREATE TABLE IF NOT EXISTS subscription_cancellation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_subscription_id VARCHAR(255),
    cancellation_reason VARCHAR(100) NOT NULL,
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellation_feedback_user_id
    ON subscription_cancellation_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellation_feedback_subscription_id
    ON subscription_cancellation_feedback(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellation_feedback_reason
    ON subscription_cancellation_feedback(cancellation_reason);

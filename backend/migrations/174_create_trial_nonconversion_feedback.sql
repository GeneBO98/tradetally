CREATE TABLE IF NOT EXISTS trial_nonconversion_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_override_id UUID REFERENCES tier_overrides(id) ON DELETE SET NULL,
    primary_reason VARCHAR(100) NOT NULL,
    feedback_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trial_nonconversion_feedback_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_trial_nonconversion_feedback_reason
    ON trial_nonconversion_feedback(primary_reason);

CREATE INDEX IF NOT EXISTS idx_trial_nonconversion_feedback_tier_override_id
    ON trial_nonconversion_feedback(tier_override_id);

DROP TRIGGER IF EXISTS update_trial_nonconversion_feedback_updated_at
    ON trial_nonconversion_feedback;

CREATE TRIGGER update_trial_nonconversion_feedback_updated_at
    BEFORE UPDATE ON trial_nonconversion_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

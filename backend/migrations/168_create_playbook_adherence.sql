CREATE TABLE IF NOT EXISTS playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    market VARCHAR(50),
    timeframe VARCHAR(20) CHECK (timeframe IN ('scalper', 'day_trading', 'swing', 'position')),
    side VARCHAR(10) DEFAULT 'both' CHECK (side IN ('long', 'short', 'both')),
    required_strategy VARCHAR(100),
    required_setup VARCHAR(100),
    required_tags TEXT[] DEFAULT '{}',
    require_stop_loss BOOLEAN DEFAULT false,
    minimum_target_r NUMERIC(6,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playbook_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    item_order INTEGER NOT NULL DEFAULT 0,
    weight NUMERIC(6,2) NOT NULL DEFAULT 1,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_playbook_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    adherence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    checklist_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    followed_plan BOOLEAN,
    review_notes TEXT,
    checklist_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
    rule_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    violation_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trade_id)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_user_id ON playbooks(user_id);
CREATE INDEX IF NOT EXISTS idx_playbooks_user_active ON playbooks(user_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_playbooks_user_lower_name ON playbooks(user_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_playbook_checklist_playbook_id ON playbook_checklist_items(playbook_id, item_order);
CREATE INDEX IF NOT EXISTS idx_trade_playbook_reviews_user_id ON trade_playbook_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_playbook_reviews_trade_id ON trade_playbook_reviews(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_playbook_reviews_playbook_id ON trade_playbook_reviews(playbook_id);

CREATE OR REPLACE FUNCTION update_playbook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_playbooks_updated_at ON playbooks;
CREATE TRIGGER update_playbooks_updated_at
    BEFORE UPDATE ON playbooks
    FOR EACH ROW
    EXECUTE FUNCTION update_playbook_updated_at();

DROP TRIGGER IF EXISTS update_trade_playbook_reviews_updated_at ON trade_playbook_reviews;
CREATE TRIGGER update_trade_playbook_reviews_updated_at
    BEFORE UPDATE ON trade_playbook_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_playbook_updated_at();

COMMENT ON TABLE playbooks IS 'Structured playbooks used for trade adherence reviews';
COMMENT ON TABLE playbook_checklist_items IS 'Checklist items for structured playbooks';
COMMENT ON TABLE trade_playbook_reviews IS 'Post-trade adherence reviews linked to a structured playbook';

INSERT INTO features (feature_key, feature_name, description, required_tier, is_active)
VALUES ('playbook_adherence', 'Playbook Adherence', 'Structured playbooks, checklist enforcement, and adherence analytics', 'pro', true)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    required_tier = EXCLUDED.required_tier,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

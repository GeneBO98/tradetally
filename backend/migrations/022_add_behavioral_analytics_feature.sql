-- Add behavioral analytics feature to features table
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
    ('behavioral_analytics', 'Behavioral Analytics', 'Advanced behavioral pattern analysis including revenge trading detection', 'pro', true),
    ('revenge_trading_detection', 'Revenge Trading Detection', 'Detect and alert on revenge trading patterns', 'pro', true),
    ('trade_blocking', 'Automatic Trade Blocking', 'Block trades during high-risk emotional periods', 'pro', true)
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    required_tier = EXCLUDED.required_tier,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;
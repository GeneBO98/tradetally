-- Migration: Add automatic strategy classification fields
-- This migration adds fields to support automatic strategy assignment
-- with confidence scores and classification metadata

-- Add strategy classification fields to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS strategy_confidence DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS classification_method VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;

-- Create strategy_classification_history table for tracking changes and learning
CREATE TABLE IF NOT EXISTS strategy_classification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_strategy VARCHAR(100),
    new_strategy VARCHAR(100) NOT NULL,
    classification_method VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(5,2),
    classification_metadata JSONB,
    is_manual_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategy_classification_history_trade_id 
ON strategy_classification_history(trade_id);

CREATE INDEX IF NOT EXISTS idx_strategy_classification_history_user_id 
ON strategy_classification_history(user_id);

CREATE INDEX IF NOT EXISTS idx_strategy_classification_history_created_at 
ON strategy_classification_history(created_at);

CREATE INDEX IF NOT EXISTS idx_trades_strategy_confidence 
ON trades(strategy, strategy_confidence) WHERE strategy IS NOT NULL;

-- Create function to automatically log strategy changes
CREATE OR REPLACE FUNCTION log_strategy_classification_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if strategy actually changed or if it's a new assignment
    IF (OLD.strategy IS DISTINCT FROM NEW.strategy) OR 
       (OLD.strategy IS NULL AND NEW.strategy IS NOT NULL) THEN
        
        INSERT INTO strategy_classification_history (
            trade_id,
            user_id,
            previous_strategy,
            new_strategy,
            classification_method,
            confidence_score,
            classification_metadata,
            is_manual_override
        ) VALUES (
            NEW.id,
            NEW.user_id,
            OLD.strategy,
            NEW.strategy,
            NEW.classification_method,
            NEW.strategy_confidence,
            NEW.classification_metadata,
            NEW.manual_override
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically log strategy changes
DROP TRIGGER IF EXISTS trigger_log_strategy_classification ON trades;
CREATE TRIGGER trigger_log_strategy_classification
    AFTER UPDATE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION log_strategy_classification_change();

-- Add comment to document the new fields
COMMENT ON COLUMN trades.strategy_confidence IS 'Confidence score (0-100) for automatic strategy classification';
COMMENT ON COLUMN trades.classification_method IS 'Method used for classification (time_based, technical_analysis, manual)';
COMMENT ON COLUMN trades.classification_metadata IS 'JSON metadata about classification process and signals';
COMMENT ON COLUMN trades.manual_override IS 'Whether strategy was manually set by user';

COMMENT ON TABLE strategy_classification_history IS 'Tracks strategy classification changes for learning and audit purposes';
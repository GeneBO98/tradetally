-- Fix strategy classification trigger to handle null classification_method
-- Migration 057: Fix classification trigger

DO $$
BEGIN
    -- First, create the strategy_classification_history table if it doesn't exist
    CREATE TABLE IF NOT EXISTS strategy_classification_history (
        id SERIAL PRIMARY KEY,
        trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        previous_strategy VARCHAR(100),
        new_strategy VARCHAR(100),
        classification_method VARCHAR(50) DEFAULT 'manual',
        confidence_score DECIMAL(3,2),
        classification_metadata JSONB,
        is_manual_override BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_strategy_classification_trade_id ON strategy_classification_history (trade_id);
    CREATE INDEX IF NOT EXISTS idx_strategy_classification_user_id ON strategy_classification_history (user_id);
    CREATE INDEX IF NOT EXISTS idx_strategy_classification_created_at ON strategy_classification_history (created_at);

    -- Add missing columns to trades table if they don't exist
    ALTER TABLE trades ADD COLUMN IF NOT EXISTS classification_method VARCHAR(50);
    ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_confidence DECIMAL(3,2);
    ALTER TABLE trades ADD COLUMN IF NOT EXISTS classification_metadata JSONB;
    ALTER TABLE trades ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT true;
END $$;

-- Create the trigger function (must be outside DO block)
CREATE OR REPLACE FUNCTION log_strategy_classification()
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
            COALESCE(NEW.classification_method, 'manual'), -- Default to 'manual' if null
            NEW.strategy_confidence,
            NEW.classification_metadata,
            COALESCE(NEW.manual_override, true) -- Default to true if null (manual edit)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger and update existing records in another DO block
DO $$
BEGIN
    -- Create or replace the trigger
    DROP TRIGGER IF EXISTS strategy_classification_trigger ON trades;
    
    CREATE TRIGGER strategy_classification_trigger
        AFTER UPDATE ON trades
        FOR EACH ROW
        EXECUTE FUNCTION log_strategy_classification();

    -- Update any existing records in strategy_classification_history that have null classification_method
    UPDATE strategy_classification_history 
    SET classification_method = 'manual' 
    WHERE classification_method IS NULL;
END $$;
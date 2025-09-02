-- Fix strategy classification trigger to handle null classification_method
-- Migration 057: Fix classification trigger

-- First, let's modify the trigger function to provide a default classification_method
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

-- Update any existing records in strategy_classification_history that have null classification_method
UPDATE strategy_classification_history 
SET classification_method = 'manual' 
WHERE classification_method IS NULL;
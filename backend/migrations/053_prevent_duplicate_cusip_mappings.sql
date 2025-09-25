-- Prevent duplicate CUSIP-to-symbol mappings
-- Each ticker should only map to ONE CUSIP globally, with user overrides allowed

-- First, create a function to validate CUSIP-ticker uniqueness
CREATE OR REPLACE FUNCTION validate_cusip_ticker_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this ticker is already mapped to a different CUSIP
    -- Allow the same mapping (idempotent updates)
    -- Allow user-specific overrides (user_id IS NOT NULL)
    IF EXISTS (
        SELECT 1 FROM cusip_mappings 
        WHERE ticker = NEW.ticker 
        AND cusip != NEW.cusip
        AND user_id IS NULL  -- Only check global mappings
        AND NEW.user_id IS NULL  -- Only apply to global mappings
    ) THEN
        RAISE EXCEPTION 'Ticker % is already mapped to a different CUSIP. Each ticker can only map to one CUSIP globally.', NEW.ticker;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce uniqueness
DROP TRIGGER IF EXISTS trigger_validate_cusip_ticker_uniqueness ON cusip_mappings;
CREATE TRIGGER trigger_validate_cusip_ticker_uniqueness
    BEFORE INSERT OR UPDATE ON cusip_mappings
    FOR EACH ROW
    EXECUTE FUNCTION validate_cusip_ticker_uniqueness();

-- Add a unique constraint for global mappings (user_id IS NULL)
-- This prevents the same ticker from being mapped to multiple CUSIPs globally
-- Note: Cannot use CONCURRENTLY in migration transactions, so using regular CREATE INDEX
CREATE UNIQUE INDEX IF NOT EXISTS idx_cusip_mappings_unique_global_ticker 
ON cusip_mappings (ticker) 
WHERE user_id IS NULL;

-- Create a function to help resolve conflicts when inserting new mappings
CREATE OR REPLACE FUNCTION resolve_cusip_mapping_conflict(
    p_cusip VARCHAR(9),
    p_ticker VARCHAR(10),
    p_resolution_source VARCHAR(20),
    p_user_id UUID DEFAULT NULL,
    p_confidence_score INTEGER DEFAULT 100
)
RETURNS BOOLEAN AS $$
DECLARE
    existing_mapping RECORD;
    conflict_count INTEGER;
BEGIN
    -- Check if there's already a global mapping for this ticker to a different CUSIP
    SELECT cusip, ticker, resolution_source, confidence_score INTO existing_mapping
    FROM cusip_mappings 
    WHERE ticker = p_ticker 
    AND cusip != p_cusip
    AND user_id IS NULL;
    
    IF FOUND THEN
        -- Log the conflict
        RAISE NOTICE 'CONFLICT: Ticker % already mapped to CUSIP % (source: %, confidence: %), attempted new mapping to CUSIP % (source: %, confidence: %)', 
            p_ticker, existing_mapping.cusip, existing_mapping.resolution_source, existing_mapping.confidence_score,
            p_cusip, p_resolution_source, p_confidence_score;
        
        -- If the new mapping has higher confidence, replace the old one
        IF p_confidence_score > existing_mapping.confidence_score THEN
            RAISE NOTICE 'Replacing lower confidence mapping: % → % (confidence %) with % → % (confidence %)',
                existing_mapping.cusip, p_ticker, existing_mapping.confidence_score,
                p_cusip, p_ticker, p_confidence_score;
            
            -- Delete the old mapping
            DELETE FROM cusip_mappings 
            WHERE ticker = p_ticker 
            AND cusip = existing_mapping.cusip
            AND user_id IS NULL;
            
            RETURN TRUE; -- Allow the insert
        ELSE
            RAISE NOTICE 'Rejecting lower confidence mapping: % → % (confidence %) vs existing % → % (confidence %)',
                p_cusip, p_ticker, p_confidence_score,
                existing_mapping.cusip, p_ticker, existing_mapping.confidence_score;
            
            RETURN FALSE; -- Reject the insert
        END IF;
    END IF;
    
    RETURN TRUE; -- No conflict, allow the insert
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION validate_cusip_ticker_uniqueness() IS 'Prevents duplicate ticker symbols from being mapped to different CUSIPs globally';
COMMENT ON FUNCTION resolve_cusip_mapping_conflict(VARCHAR, VARCHAR, VARCHAR, UUID, INTEGER) IS 'Helps resolve conflicts when inserting new CUSIP mappings by comparing confidence scores';
COMMENT ON INDEX idx_cusip_mappings_unique_global_ticker IS 'Ensures each ticker maps to only one CUSIP globally (user overrides allowed)';
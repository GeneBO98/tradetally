-- Migration to add proper foreign key relationship between job_queue and trades
-- This ensures that when a trade is deleted, its associated jobs are also deleted

-- First, check if we need to add a trade_id column to job_queue
-- (some jobs may not be trade-specific, so we'll keep the existing data structure)

-- Add index for better performance on trade-related job queries
CREATE INDEX IF NOT EXISTS idx_job_queue_trade_id 
ON job_queue USING gin ((data->'tradeId')) 
WHERE data ? 'tradeId';

-- Create a function to automatically clean up jobs when trades are deleted
CREATE OR REPLACE FUNCTION cleanup_trade_jobs()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete jobs that reference the deleted trade
    DELETE FROM job_queue 
    WHERE data->>'tradeId' = OLD.id::text
    OR (data->'tradeIds' ? OLD.id::text);
    
    -- Log the cleanup for debugging
    RAISE NOTICE 'Cleaned up jobs for deleted trade %', OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically clean up jobs when trades are deleted
DROP TRIGGER IF EXISTS trigger_cleanup_trade_jobs ON trades;
CREATE TRIGGER trigger_cleanup_trade_jobs
    AFTER DELETE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_trade_jobs();

-- Clean up any existing orphaned jobs (one-time cleanup)
DELETE FROM job_queue 
WHERE data->>'tradeId' IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM trades t 
    WHERE t.id = (job_queue.data->>'tradeId')::uuid
);

-- Log how many orphaned jobs were cleaned up
DO $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % orphaned jobs during migration', cleanup_count;
END $$;
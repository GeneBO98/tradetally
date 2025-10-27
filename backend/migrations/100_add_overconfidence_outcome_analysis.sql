-- Add outcome trade analysis column to overconfidence_events
-- This stores detailed price analysis to determine if the outcome trade was truly due to overconfidence

ALTER TABLE overconfidence_events
ADD COLUMN IF NOT EXISTS outcome_analysis JSONB;

COMMENT ON COLUMN overconfidence_events.outcome_analysis IS 'Detailed analysis of the outcome trade including entry/exit timing, price movement, stop loss adherence, and whether it was truly overconfidence or prudent trading';

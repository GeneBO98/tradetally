-- Add AI recommendations columns to overconfidence_events table
ALTER TABLE overconfidence_events 
ADD COLUMN ai_recommendations JSONB,
ADD COLUMN ai_provider VARCHAR(50),
ADD COLUMN ai_generated_at TIMESTAMP;

-- Add index for querying AI recommendations
CREATE INDEX idx_overconfidence_events_ai_provider ON overconfidence_events(ai_provider);
CREATE INDEX idx_overconfidence_events_ai_generated_at ON overconfidence_events(ai_generated_at);

-- Add comment explaining the columns
COMMENT ON COLUMN overconfidence_events.ai_recommendations IS 'AI-generated recommendations stored as JSON array';
COMMENT ON COLUMN overconfidence_events.ai_provider IS 'AI provider used (gemini, claude, openai, etc.)';
COMMENT ON COLUMN overconfidence_events.ai_generated_at IS 'Timestamp when AI recommendations were generated';
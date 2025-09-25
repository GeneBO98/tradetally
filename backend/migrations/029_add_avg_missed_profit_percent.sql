-- Add avg_missed_profit_percent column to loss_aversion_events table
ALTER TABLE loss_aversion_events 
ADD COLUMN IF NOT EXISTS avg_missed_profit_percent DECIMAL(5,2) DEFAULT 0;
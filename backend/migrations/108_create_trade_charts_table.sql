-- Migration 108: Create trade_charts table for multiple TradingView chart URLs per trade
-- This replaces the single chart_url field with a many-to-many relationship

-- Create trade_charts table
CREATE TABLE IF NOT EXISTS trade_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  chart_url VARCHAR(1000) NOT NULL,
  chart_title VARCHAR(255),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_trade_charts_trade_id ON trade_charts(trade_id);

-- Migrate existing chart_url data to trade_charts table
INSERT INTO trade_charts (trade_id, chart_url)
SELECT id, chart_url
FROM trades
WHERE chart_url IS NOT NULL AND chart_url != '';

-- Add comment
COMMENT ON TABLE trade_charts IS 'Stores multiple TradingView chart URLs per trade';
COMMENT ON COLUMN trade_charts.chart_url IS 'TradingView or other chart URL (e.g., snapshot link)';
COMMENT ON COLUMN trade_charts.chart_title IS 'Optional title/description for the chart';

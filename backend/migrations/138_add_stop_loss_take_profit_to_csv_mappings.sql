-- Add stop loss and take profit column support to custom CSV mappings
-- This allows users to map CSV columns that contain stop loss and take profit values

ALTER TABLE custom_csv_mappings
ADD COLUMN IF NOT EXISTS stop_loss_column VARCHAR(255),
ADD COLUMN IF NOT EXISTS take_profit_column VARCHAR(255);

COMMENT ON COLUMN custom_csv_mappings.stop_loss_column IS 'CSV column name containing stop loss price values';
COMMENT ON COLUMN custom_csv_mappings.take_profit_column IS 'CSV column name containing take profit price values';

-- Allow entry_price, quantity, trade_date, and entry_time to be nullable
-- This supports "shell trades" that are created as placeholders before fills are added
ALTER TABLE trades ALTER COLUMN entry_price DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN trade_date DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN entry_time DROP NOT NULL;

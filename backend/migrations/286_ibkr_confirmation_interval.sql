-- Preserve the existing polling cadence while allowing each IBKR connection
-- to choose a slower interval independently of its Activity schedule.
ALTER TABLE broker_connections
  ADD COLUMN IF NOT EXISTS ibkr_confirmation_interval_minutes INTEGER NOT NULL DEFAULT 15
  CHECK (ibkr_confirmation_interval_minutes BETWEEN 15 AND 1440
    AND ibkr_confirmation_interval_minutes % 15 = 0);

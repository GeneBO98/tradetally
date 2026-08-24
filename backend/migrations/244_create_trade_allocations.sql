-- Optional proportional allocation of a trade across user-defined accounting groups.
-- This is intentionally separate from tags: tags continue to describe a whole trade,
-- while allocation groups divide quantities and financial results.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS trade_allocations_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS allocation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#64748B',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (name <> ''),
  CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_allocation_groups_user_name_active
  ON allocation_groups (user_id, LOWER(name))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocation_groups_user_sort
  ON allocation_groups (user_id, archived_at, sort_order, name);

CREATE TABLE IF NOT EXISTS trade_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  allocation_group_id UUID NOT NULL REFERENCES allocation_groups(id) ON DELETE RESTRICT,
  allocation_ratio NUMERIC(12,10) NOT NULL,
  input_method VARCHAR(20) NOT NULL DEFAULT 'percentage',
  original_quantity_snapshot NUMERIC(20,8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id, allocation_group_id),
  CHECK (allocation_ratio > 0 AND allocation_ratio <= 1),
  CHECK (input_method IN ('percentage', 'quantity')),
  CHECK (original_quantity_snapshot IS NULL OR original_quantity_snapshot >= 0)
);

CREATE INDEX IF NOT EXISTS idx_trade_allocations_group
  ON trade_allocations (allocation_group_id, trade_id);

CREATE INDEX IF NOT EXISTS idx_trade_allocations_trade
  ON trade_allocations (trade_id);

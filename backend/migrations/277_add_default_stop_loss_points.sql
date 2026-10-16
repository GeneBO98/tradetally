ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS default_stop_loss_points NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS default_stop_loss_points_by_underlying JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN user_settings.default_stop_loss_points IS
  'Price distance from entry when default_stop_loss_type is points; independent of quantity and point value';
COMMENT ON COLUMN user_settings.default_stop_loss_points_by_underlying IS
  'Per-instrument point distances keyed by futures root (ES, MES, NQ) or symbol';

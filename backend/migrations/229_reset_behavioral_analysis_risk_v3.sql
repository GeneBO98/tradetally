DELETE FROM revenge_trading_events;

DELETE FROM behavioral_patterns
WHERE pattern_type IN (
  'same_symbol_revenge',
  'emotional_reactive_trading',
  'revenge_trading',
  'overconfidence_bias'
);

DELETE FROM overconfidence_events;

UPDATE win_loss_streaks
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;

DELETE FROM analytics_cache;

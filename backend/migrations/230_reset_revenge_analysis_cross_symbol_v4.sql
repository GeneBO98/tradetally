DELETE FROM revenge_trading_events;

DELETE FROM behavioral_patterns
WHERE pattern_type IN (
  'same_symbol_revenge',
  'emotional_reactive_trading',
  'revenge_trading'
);

DELETE FROM analytics_cache;

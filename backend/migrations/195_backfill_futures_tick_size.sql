-- Backfill tick_size (and point_value where missing) for existing futures
-- trades so the breakeven tolerance feature works on historical data.
--
-- Until now, point_value was auto-populated on trade creation but tick_size was
-- not, so most imported/synced futures trades have a NULL tick_size. The
-- breakeven tolerance scales by tick_size * point_value, so a NULL tick_size
-- makes the tolerance a no-op. This sets both from the contract's underlying,
-- mirroring the lookup maps in src/utils/futuresUtils.js.
--
-- Only known contracts are filled (ELSE NULL), and only rows where the value is
-- currently NULL are touched, so this is safe and idempotent.

WITH resolved AS (
  SELECT
    id,
    UPPER(COALESCE(
      underlying_asset,
      substring(UPPER(symbol) FROM '^([A-Z]{1,4})[FGHJKMNQUVXZ][0-9]{1,2}$')
    )) AS underlying
  FROM trades
  WHERE instrument_type = 'future'
    AND (tick_size IS NULL OR point_value IS NULL)
)
UPDATE trades t
SET
  tick_size = COALESCE(t.tick_size, CASE r.underlying
    WHEN 'ES' THEN 0.25
    WHEN 'NQ' THEN 0.25
    WHEN 'YM' THEN 1
    WHEN 'RTY' THEN 0.1
    WHEN 'MES' THEN 0.25
    WHEN 'MNQ' THEN 0.25
    WHEN 'MYM' THEN 1
    WHEN 'M2K' THEN 0.1
    WHEN 'CL' THEN 0.01
    WHEN 'MCL' THEN 0.01
    WHEN 'NG' THEN 0.001
    WHEN 'MNG' THEN 0.001
    WHEN 'QG' THEN 0.005
    WHEN 'GC' THEN 0.1
    WHEN 'MGC' THEN 0.1
    WHEN 'SI' THEN 0.005
    WHEN 'SIL' THEN 0.005
    WHEN 'HG' THEN 0.0005
    WHEN 'ZB' THEN 0.03125
    WHEN 'ZN' THEN 0.015625
    WHEN 'ZF' THEN 0.0078125
    WHEN 'ZT' THEN 0.00390625
    ELSE NULL
  END),
  point_value = COALESCE(t.point_value, CASE r.underlying
    WHEN 'ES' THEN 50
    WHEN 'NQ' THEN 20
    WHEN 'YM' THEN 5
    WHEN 'RTY' THEN 50
    WHEN 'MES' THEN 5
    WHEN 'MNQ' THEN 2
    WHEN 'MYM' THEN 0.5
    WHEN 'M2K' THEN 5
    WHEN 'CL' THEN 1000
    WHEN 'MCL' THEN 100
    WHEN 'NG' THEN 10000
    WHEN 'MNG' THEN 1000
    WHEN 'QG' THEN 2500
    WHEN 'GC' THEN 100
    WHEN 'MGC' THEN 10
    WHEN 'SI' THEN 5000
    WHEN 'SIL' THEN 1000
    WHEN 'HG' THEN 12500
    WHEN 'ZB' THEN 1000
    WHEN 'ZN' THEN 1000
    WHEN 'ZF' THEN 1000
    WHEN 'ZT' THEN 2000
    ELSE NULL
  END)
FROM resolved r
WHERE t.id = r.id
  AND r.underlying IS NOT NULL;

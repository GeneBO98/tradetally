-- Backfill missing option metadata from OCC-format symbols (any broker) and
-- normalize underlying_symbol casing so open-position grouping keys are
-- stable (issue #339). The check_options_fields constraint (migration 056)
-- keeps these columns NOT NULL on standard installs, but underlying_symbol
-- can still be an empty/whitespace string, which the grouping code treats as
-- missing; the NULL checks also cover self-hosted databases where the
-- constraint was removed. Fill-missing-only; never rewrites symbol.

WITH parsed AS (
  SELECT
    t.id,
    m.parts[1] AS underlying_symbol,
    to_date(m.parts[2], 'YYMMDD') AS expiration_date,
    CASE WHEN m.parts[3] = 'C' THEN 'call' ELSE 'put' END AS option_type,
    (m.parts[4]::numeric / 1000) AS strike_price
  FROM trades t
  CROSS JOIN LATERAL regexp_match(
    upper(regexp_replace(t.symbol, '\s+', '', 'g')),
    '^([A-Z]{1,6})([0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01]))([CP])([0-9]{8})$'
  ) AS m(parts)
  WHERE t.instrument_type = 'option'
    AND (t.underlying_symbol IS NULL OR TRIM(t.underlying_symbol) = ''
         OR t.strike_price IS NULL OR t.expiration_date IS NULL
         OR t.option_type IS NULL)
    -- regexp_match yields a NULL array (not zero rows) for non-matching
    -- symbols; without this filter the UPDATE would null out fields.
    AND m.parts IS NOT NULL
)
UPDATE trades t
SET underlying_symbol = COALESCE(NULLIF(TRIM(t.underlying_symbol), ''), p.underlying_symbol),
    expiration_date   = COALESCE(t.expiration_date, p.expiration_date),
    option_type       = COALESCE(t.option_type, p.option_type),
    strike_price      = COALESCE(t.strike_price, p.strike_price),
    updated_at        = NOW()
FROM parsed p
WHERE t.id = p.id;

UPDATE trades
SET underlying_symbol = UPPER(TRIM(underlying_symbol)),
    updated_at = NOW()
WHERE instrument_type = 'option'
  AND underlying_symbol IS NOT NULL
  AND underlying_symbol <> UPPER(TRIM(underlying_symbol));

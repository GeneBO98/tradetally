-- Normalize Schwab API option symbols that were previously stored as full OCC
-- contracts (for example, "SPY 260527C00753000") instead of the underlying.

WITH parsed_options AS (
  SELECT
    t.id,
    option_match.parts[1] AS underlying_symbol,
    option_match.parts[2] AS expiration_code,
    option_match.parts[3] AS call_put,
    (option_match.parts[4]::numeric / 1000) AS strike_price
  FROM trades t
  CROSS JOIN LATERAL regexp_match(
    upper(regexp_replace(t.symbol, '\s+', '', 'g')),
    '^([A-Z]{1,6})([0-9]{6})([CP])([0-9]{8})$'
  ) AS option_match(parts)
  WHERE lower(COALESCE(t.broker, '')) = 'schwab'
    AND t.instrument_type = 'option'
)
UPDATE trades t
SET
  symbol = p.underlying_symbol,
  underlying_symbol = COALESCE(t.underlying_symbol, p.underlying_symbol),
  expiration_date = COALESCE(t.expiration_date, to_date(p.expiration_code, 'YYMMDD')),
  option_type = COALESCE(t.option_type, CASE WHEN p.call_put = 'C' THEN 'call' ELSE 'put' END),
  strike_price = COALESCE(t.strike_price, p.strike_price),
  updated_at = NOW()
FROM parsed_options p
WHERE t.id = p.id
  AND t.symbol <> p.underlying_symbol;

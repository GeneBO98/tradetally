function getTradeDirectionPnlSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';

  return `(
    CASE
      WHEN ${prefix}side = 'short' THEN (${prefix}entry_price - ${prefix}exit_price) * ${prefix}quantity
      ELSE (${prefix}exit_price - ${prefix}entry_price) * ${prefix}quantity
    END
  )`;
}

function getTradeOutcomePnlSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const directionPnlSql = getTradeDirectionPnlSql(alias);

  return `
    CASE
      WHEN ${prefix}broker = 'bitunix'
        AND ${prefix}entry_price IS NOT NULL
        AND ${prefix}exit_price IS NOT NULL
        AND ${prefix}quantity IS NOT NULL
      THEN CASE
        WHEN ${directionPnlSql} >= 0
          AND ABS(COALESCE(${prefix}pnl, 0)) <= (COALESCE(${prefix}fees, 0) + 0.00000001)
        THEN 0
        ELSE ${prefix}pnl
      END
      ELSE ${prefix}pnl
    END
  `;
}

module.exports = {
  getTradeDirectionPnlSql,
  getTradeOutcomePnlSql
};

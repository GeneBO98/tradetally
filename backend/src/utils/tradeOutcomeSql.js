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
  const feeToleranceSql = `(COALESCE(${prefix}fees, 0) + 0.00000001)`;
  const flatPriceMoveSql = `ABS(${directionPnlSql}) <= 0.00000001`;

  return `
    CASE
      WHEN ${prefix}broker = 'bitunix'
        AND ${prefix}entry_price IS NOT NULL
        AND ${prefix}exit_price IS NOT NULL
        AND ${prefix}quantity IS NOT NULL
      THEN CASE
        WHEN ${flatPriceMoveSql}
          AND COALESCE(${prefix}pnl, 0) <= 0
          AND ABS(COALESCE(${prefix}pnl, 0)) <= ${feeToleranceSql}
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

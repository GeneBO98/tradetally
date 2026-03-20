function buildSymbolFilterClause(tradeFilters = {}, queryParams = [], paramCount = 1, tableAlias = '') {
  const symbol = tradeFilters.symbol?.trim();
  if (!symbol) {
    return { sql: '', queryParams, paramCount };
  }

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const operator = tradeFilters.symbolExact ? '=' : 'LIKE';
  const value = tradeFilters.symbolExact ? symbol : `${symbol}%`;

  queryParams.push(value);

  return {
    sql: ` AND UPPER(${prefix}symbol) ${operator} UPPER($${paramCount})`,
    queryParams,
    paramCount: paramCount + 1,
  };
}

module.exports = buildSymbolFilterClause;

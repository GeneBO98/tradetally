const FOREX_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNH', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HUF', 'ILS', 'INR', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'RUB',
  'SEK', 'SGD', 'THB', 'TRY', 'USD', 'XAG', 'XAU', 'ZAR'
]);

function parseForexPair(symbol) {
  const qualified = String(symbol || '').trim().toUpperCase();
  const contract = qualified.includes(':')
    ? qualified.slice(qualified.lastIndexOf(':') + 1)
    : qualified;
  const compact = contract.replace(/[\/_-]/g, '');
  const match = compact.match(/^([A-Z]{3})([A-Z]{3})$/);
  if (!match || match[1] === match[2]
      || !FOREX_CURRENCIES.has(match[1]) || !FOREX_CURRENCIES.has(match[2])) {
    const error = new Error(`Could not determine a forex pair from ${symbol || 'the empty symbol'}`);
    error.statusCode = 422;
    throw error;
  }
  return { base: match[1], quote: match[2], pair: `${match[1]}${match[2]}` };
}

function toFinnhubForexSymbol(symbol) {
  const { base, quote } = parseForexPair(symbol);
  return `OANDA:${base}_${quote}`;
}

function toYahooForexSymbol(symbol) {
  return `${parseForexPair(symbol).pair}=X`;
}

module.exports = { parseForexPair, toFinnhubForexSymbol, toYahooForexSymbol };

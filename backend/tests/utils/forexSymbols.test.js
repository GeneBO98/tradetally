const { parseForexPair, toFinnhubForexSymbol, toYahooForexSymbol } = require('../../src/utils/forexSymbols');

describe('forex symbol normalization', () => {
  test.each([
    ['BLACKBULL:EURUSD', 'OANDA:EUR_USD'],
    ['FX_IDC:EURUSD', 'OANDA:EUR_USD'],
    ['EUR/USD', 'OANDA:EUR_USD'],
    ['OANDA:EUR_USD', 'OANDA:EUR_USD'],
    ['OANDA:XAU_USD', 'OANDA:XAU_USD']
  ])('maps %s to Finnhub symbol %s', (input, expected) => {
    expect(toFinnhubForexSymbol(input)).toBe(expected);
  });

  test('maps a broker-qualified pair to Yahoo notation', () => {
    expect(toYahooForexSymbol('BLACKBULL:EURUSD')).toBe('EURUSD=X');
  });

  test.each(['', 'AAPL', 'BLACKBULL:EURUS', 'BLACKBULL:ABCXYZ', 'EUR/EUR'])('rejects invalid pair %s', input => {
    expect(() => parseForexPair(input)).toThrow('Could not determine a forex pair');
  });
});

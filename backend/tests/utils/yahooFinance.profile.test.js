jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true)
}));

const axios = require('axios');
const yahooFinance = require('../../src/utils/yahooFinance');

function searchResponse(quotes) {
  return { data: { quotes } };
}

describe('Yahoo Finance symbol profiles', () => {
  let originalEnabled;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = originalEnabled;
  });

  test('returns industry and name for a listing the US-only provider cannot cover', async () => {
    axios.get.mockResolvedValue(searchResponse([
      { symbol: 'EXCO.DE', quoteType: 'EQUITY', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', longname: 'Example Company AG', exchDisp: 'XETRA' }
    ]));

    const profile = await yahooFinance.getSymbolProfile('EXCO.DE');

    expect(profile.industry).toBe('Auto Manufacturers');
    expect(profile.name).toContain('Example Company');
    expect(profile.exchange).toBe('XETRA');
  });

  test('reports a null industry for an ETF rather than inventing one', async () => {
    axios.get.mockResolvedValue(searchResponse([
      { symbol: 'EXETF.L', quoteType: 'ETF', sector: null, industry: null, shortname: 'EXAMPLE PHYSICAL GOLD' }
    ]));

    const profile = await yahooFinance.getSymbolProfile('EXETF.L');

    expect(profile.industry).toBeNull();
    expect(profile.name).toBe('EXAMPLE PHYSICAL GOLD');
  });

  test('ignores a fuzzy match on a different ticker', async () => {
    axios.get.mockResolvedValue(searchResponse([
      { symbol: 'EXCO.F', quoteType: 'EQUITY', sector: 'Consumer Cyclical', shortname: 'Example Co Frankfurt' }
    ]));

    expect(await yahooFinance.getSymbolProfile('EXCO.DE')).toBeNull();
  });

  test('translates the symbol before searching', async () => {
    axios.get.mockResolvedValue(searchResponse([
      { symbol: '^XSP', quoteType: 'INDEX', shortname: 'Mini SPX' }
    ]));

    await yahooFinance.getSymbolProfile('XSP');

    expect(axios.get.mock.calls[0][1].params.q).toBe('^XSP');
  });

  test('never throws when the search fails', async () => {
    axios.get.mockRejectedValue(new Error('network down'));
    expect(await yahooFinance.getSymbolProfile('EXCO.DE')).toBeNull();
  });

  test('returns null when nothing matches', async () => {
    axios.get.mockResolvedValue(searchResponse([]));
    expect(await yahooFinance.getSymbolProfile('NOPE.ZZ')).toBeNull();
  });
});

describe('Yahoo Finance profile caching', () => {
  const cache = require('../../src/utils/cache');

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    process.env.YAHOO_FINANCE_ENABLED = 'true';
  });

  test('records a miss so an unknown symbol is not re-queried every time', async () => {
    axios.get.mockResolvedValue(searchResponse([]));

    expect(await yahooFinance.getSymbolProfile('NOSUCH.L')).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'yahoo_symbol_profile', 'NOSUCH.L', { miss: true }
    );
  });

  test('reads a recorded miss without calling the provider again', async () => {
    cache.get.mockResolvedValue({ miss: true });

    expect(await yahooFinance.getSymbolProfile('NOSUCH.L')).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('records a miss when the chart carries no name', async () => {
    axios.get.mockResolvedValue({ data: { chart: { result: [{ meta: {} }] } } });

    expect(await yahooFinance.getSymbolName('NONAME.L')).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'yahoo_symbol_name', 'NONAME.L', { miss: true }
    );
  });

  test('reads a recorded name miss without calling the provider again', async () => {
    cache.get.mockResolvedValue({ miss: true });

    expect(await yahooFinance.getSymbolName('NONAME.L')).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('still returns a cached name', async () => {
    cache.get.mockResolvedValue('Example Company AG');

    expect(await yahooFinance.getSymbolName('EXCO.DE')).toBe('Example Company AG');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('does not cache a transient name lookup failure', async () => {
    axios.get.mockRejectedValue(new Error('network down'));

    expect(await yahooFinance.getSymbolName('EXCO.DE')).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  test('still returns a cached hit', async () => {
    cache.get.mockResolvedValue({ symbol: 'EXCO.DE', name: 'Example Company AG', industry: 'Auto Manufacturers' });

    const profile = await yahooFinance.getSymbolProfile('EXCO.DE');
    expect(profile.name).toBe('Example Company AG');
    expect(axios.get).not.toHaveBeenCalled();
  });
});

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({ getCompanyProfile: jest.fn() }));
jest.mock('../../src/utils/symbolCategories', () => ({ getSymbolCategories: jest.fn() }));
jest.mock('../../src/utils/yahooFinance', () => ({
  isEnabled: jest.fn(() => true),
  getSymbolName: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({ isBillingEnabled: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(() => null), set: jest.fn() }));

const db = require('../../src/config/database');
const symbolCategories = require('../../src/utils/symbolCategories');
const yahooFinance = require('../../src/utils/yahooFinance');
const TierService = require('../../src/services/tierService');
const symbolsController = require('../../src/controllers/symbols.controller');

function createRequest(symbols, host = 'journal.example.internal') {
  return { query: { symbols }, headers: { host } };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

async function getMetadata(req) {
  const res = createResponse();
  await symbolsController.getSymbolMetadata(req, res, (error) => { if (error) throw error; });
  return res;
}

describe('symbol metadata name fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    symbolCategories.getSymbolCategories.mockResolvedValue(new Map());
    yahooFinance.isEnabled.mockReturnValue(true);
    TierService.isBillingEnabled.mockResolvedValue(false);
  });

  test('backfills a name on a self-hosted instance', async () => {
    yahooFinance.getSymbolName.mockResolvedValue('Example Company AG');

    const res = await getMetadata(createRequest('EXCO.DE'));

    expect(yahooFinance.getSymbolName).toHaveBeenCalledWith('EXCO.DE');
    expect(res.payload.metadata['EXCO.DE'].companyName).toBe('Example Company AG');
  });

  test('does not call Yahoo when billing is enabled', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);

    const res = await getMetadata(createRequest('EXCO.DE', 'tradetally.io'));

    expect(yahooFinance.getSymbolName).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.payload.metadata['EXCO.DE'].companyName).toBeNull();
  });

  test('does not call Yahoo when the fallback is disabled', async () => {
    yahooFinance.isEnabled.mockReturnValue(false);

    const res = await getMetadata(createRequest('EXCO.DE'));

    expect(yahooFinance.getSymbolName).not.toHaveBeenCalled();
    expect(res.payload.metadata['EXCO.DE'].companyName).toBeNull();
  });

  test('skips the fallback rather than failing when the billing check throws', async () => {
    TierService.isBillingEnabled.mockRejectedValue(new Error('instance_config unavailable'));

    const res = await getMetadata(createRequest('EXCO.DE'));

    expect(yahooFinance.getSymbolName).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.payload.metadata['EXCO.DE'].companyName).toBeNull();
  });

  test('returns the response when the provider call fails', async () => {
    yahooFinance.getSymbolName.mockRejectedValue(new Error('network down'));

    const res = await getMetadata(createRequest('EXCO.DE'));

    expect(res.statusCode).toBe(200);
    expect(res.payload.metadata['EXCO.DE']).toEqual({
      symbol: 'EXCO.DE', companyName: null, exchange: null, logo: null
    });
  });

  test('one symbol failing does not cost the others their name', async () => {
    yahooFinance.getSymbolName.mockImplementation(async (symbol) => {
      if (symbol === 'BAD.DE') throw new Error('network down');
      return `${symbol} plc`;
    });

    const res = await getMetadata(createRequest('BAD.DE,EXCO.L'));

    expect(res.payload.metadata['BAD.DE'].companyName).toBeNull();
    expect(res.payload.metadata['EXCO.L'].companyName).toBe('EXCO.L plc');
  });

  test('leaves a symbol alone when the provider knows no name', async () => {
    yahooFinance.getSymbolName.mockResolvedValue(null);

    const res = await getMetadata(createRequest('EXCO.DE'));

    expect(res.payload.metadata['EXCO.DE'].companyName).toBeNull();
  });

  test('does not spend a request on an option contract symbol', async () => {
    yahooFinance.getSymbolName.mockResolvedValue('Should not be asked');

    await getMetadata(createRequest('SPY   260618P00350000'));

    expect(yahooFinance.getSymbolName).not.toHaveBeenCalled();
  });

  test('does not re-query a symbol that already has a name', async () => {
    db.query.mockResolvedValue({
      rows: [{ symbol: 'AAPL', company_name: 'Apple Inc', exchange: 'NASDAQ', logo: 'https://logo.example/aapl.png' }]
    });

    const res = await getMetadata(createRequest('AAPL'));

    expect(yahooFinance.getSymbolName).not.toHaveBeenCalled();
    expect(res.payload.metadata.AAPL.companyName).toBe('Apple Inc');
  });

  test('requests in bounded batches rather than one call per symbol at once', async () => {
    const symbols = Array.from({ length: 12 }, (_, i) => `SYM${i}.L`);
    let inFlight = 0;
    let peakInFlight = 0;
    yahooFinance.getSymbolName.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise(resolve => setImmediate(resolve));
      inFlight -= 1;
      return null;
    });

    await getMetadata(createRequest(symbols.join(',')));

    expect(yahooFinance.getSymbolName).toHaveBeenCalledTimes(12);
    expect(peakInFlight).toBeLessThanOrEqual(5);
  });
});

const mockDb = {
  query: jest.fn()
};

const mockFinnhub = {
  isConfigured: jest.fn(() => true),
  symbolSearch: jest.fn(),
  getQuote: jest.fn(),
  isFinnhub: true,
  providerName: 'finnhub'
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn()
};

const mockSymbolCategories = {
  getSymbolCategories: jest.fn()
};

jest.mock('../../src/config/database', () => mockDb);
jest.mock('../../src/utils/finnhub', () => mockFinnhub);
jest.mock('../../src/utils/cache', () => mockCache);
jest.mock('../../src/utils/symbolCategories', () => mockSymbolCategories);

const symbolsController = require('../../src/controllers/symbols.controller');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('symbols controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockReturnValue(null);
    mockSymbolCategories.getSymbolCategories.mockResolvedValue(new Map());
  });

  test('getSymbolMetadata hydrates missing metadata from symbol categories on demand', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{
        symbol: 'NVDA',
        company_name: null,
        exchange: null,
        logo: null
      }]
    });

    mockSymbolCategories.getSymbolCategories.mockResolvedValue(new Map([
      ['NVDA', {
        symbol: 'NVDA',
        company_name: 'NVIDIA Corporation',
        exchange: 'NASDAQ',
        logo: 'https://logo.test/nvda.png'
      }]
    ]));

    const req = {
      query: { symbols: 'NVDA' }
    };
    const res = createRes();

    await symbolsController.getSymbolMetadata(req, res);

    expect(mockSymbolCategories.getSymbolCategories).toHaveBeenCalledWith(['NVDA']);
    expect(res.json).toHaveBeenCalledWith({
      metadata: {
        NVDA: {
          symbol: 'NVDA',
          companyName: 'NVIDIA Corporation',
          exchange: 'NASDAQ',
          logo: 'https://logo.test/nvda.png'
        }
      }
    });
  });

  test('searchSymbols hydrates traded symbols that are missing local metadata', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          symbol: 'AMD',
          company_name: null,
          exchange: null,
          logo: null
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    mockSymbolCategories.getSymbolCategories.mockResolvedValue(new Map([
      ['AMD', {
        symbol: 'AMD',
        company_name: 'Advanced Micro Devices',
        exchange: 'NASDAQ',
        logo: 'https://logo.test/amd.png'
      }]
    ]));

    const req = {
      user: { id: 'user-1' },
      query: { q: 'AMD' }
    };
    const res = createRes();

    await symbolsController.searchSymbols(req, res);

    expect(mockSymbolCategories.getSymbolCategories).toHaveBeenCalledWith(['AMD']);
    expect(res.json).toHaveBeenCalledWith({
      results: [
        {
          symbol: 'AMD',
          company_name: 'Advanced Micro Devices',
          exchange: 'NASDAQ',
          logo: 'https://logo.test/amd.png',
          source: 'user_trades'
        }
      ]
    });
  });

  test('getSymbolQuote returns a normalized current quote', async () => {
    mockFinnhub.getQuote.mockResolvedValue({
      c: 213.55,
      pc: 211.22,
      d: 2.33,
      dp: 1.1031,
      t: 1783708200
    });

    const req = {
      user: { id: 'user-1' },
      query: { symbol: ' aapl ' }
    };
    const res = createRes();

    await symbolsController.getSymbolQuote(req, res);

    expect(mockFinnhub.getQuote).toHaveBeenCalledWith('AAPL', 'user-1');
    expect(res.json).toHaveBeenCalledWith({
      symbol: 'AAPL',
      current_price: 213.55,
      previous_close: 211.22,
      change: 2.33,
      change_percent: 1.1031,
      timestamp: 1783708200
    });
  });

  test('searchSymbols excludes option contracts and non-equity provider results', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockFinnhub.symbolSearch.mockResolvedValue({
      result: [
        { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
        { symbol: 'AAPL260117C00200000', description: 'AAPL call', type: 'Option' },
        { symbol: 'AAPLW', description: 'Apple warrant', type: 'Warrant' },
        { symbol: 'AAXJ', description: 'iShares MSCI All Country Asia ETF', type: 'ETP' }
      ]
    });

    const req = {
      user: { id: 'user-1' },
      query: { q: 'AA' }
    };
    const res = createRes();

    await symbolsController.searchSymbols(req, res);

    expect(res.json).toHaveBeenCalledWith({
      results: [
        {
          symbol: 'AAPL',
          company_name: 'Apple Inc',
          exchange: null,
          logo: null,
          source: 'finnhub'
        },
        {
          symbol: 'AAXJ',
          company_name: 'iShares MSCI All Country Asia ETF',
          exchange: null,
          logo: null,
          source: 'finnhub'
        }
      ]
    });
  });
});

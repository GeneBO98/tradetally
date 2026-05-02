const mockDb = {
  query: jest.fn()
};

const mockFinnhub = {
  getCompanyProfile: jest.fn()
};

const mockCache = {
  data: {},
  del: jest.fn()
};

jest.mock('../../src/config/database', () => mockDb);
jest.mock('../../src/utils/finnhub', () => mockFinnhub);
jest.mock('../../src/utils/cache', () => mockCache);

const symbolCategories = require('../../src/utils/symbolCategories');

describe('symbolCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.data = {};
    symbolCategories.inFlightLookups.clear();
  });

  test('refetches fresh but empty symbol rows and returns normalized metadata', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          symbol: 'NVDA',
          company_name: null,
          logo: null,
          finnhub_industry: null,
          exchange: null,
          weburl: null,
          updated_at: new Date().toISOString()
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    mockFinnhub.getCompanyProfile.mockResolvedValue({
      name: 'NVIDIA Corporation',
      logo: 'https://logo.test/nvda.png',
      exchange: 'NASDAQ',
      finnhubIndustry: 'Semiconductors',
      ticker: 'NVDA'
    });

    const category = await symbolCategories.getSymbolCategory('NVDA');

    expect(mockFinnhub.getCompanyProfile).toHaveBeenCalledWith('NVDA');
    expect(category).toEqual(expect.objectContaining({
      symbol: 'NVDA',
      company_name: 'NVIDIA Corporation',
      exchange: 'NASDAQ',
      logo: 'https://logo.test/nvda.png'
    }));
    expect(mockCache.del).toHaveBeenCalledWith('company_profile', 'NVDA');
  });

  test('getSymbolCategories fetches missing symbols and normalizes the response shape', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockFinnhub.getCompanyProfile.mockResolvedValue({
      name: 'Advanced Micro Devices',
      logo: 'https://logo.test/amd.png',
      exchange: 'NASDAQ',
      finnhubIndustry: 'Semiconductors',
      ticker: 'AMD'
    });

    const results = await symbolCategories.getSymbolCategories(['AMD']);
    const amd = results.get('AMD');

    expect(mockFinnhub.getCompanyProfile).toHaveBeenCalledWith('AMD');
    expect(amd).toEqual(expect.objectContaining({
      symbol: 'AMD',
      company_name: 'Advanced Micro Devices',
      exchange: 'NASDAQ',
      logo: 'https://logo.test/amd.png'
    }));
  });
});

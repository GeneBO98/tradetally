jest.mock('axios', () => ({
  get: jest.fn()
}));

const axios = require('axios');
const yahooFinance = require('../../src/utils/yahooFinance');

function yahooResponse(interval = '5m') {
  return {
    data: {
      chart: {
        error: null,
        result: [{
          meta: { symbol: 'ES=F', instrumentType: 'FUTURE' },
          timestamp: [1_700_000_000, 1_700_000_300],
          indicators: {
            quote: [{
              open: [5000, 5001],
              high: [5002, 5003],
              low: [4999, 5000],
              close: [5001, 5002],
              volume: [100, 120]
            }]
          },
          interval
        }]
      }
    }
  };
}

describe('Yahoo Finance futures fallback', () => {
  let originalEnabled;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'true';
    axios.get.mockResolvedValue(yahooResponse());
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = originalEnabled;
  });

  it('maps a futures root to Yahoo continuous data without an API key', async () => {
    const recentEntry = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const trade = {
      symbol: 'ESU26',
      entry_time: recentEntry,
      exit_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
    };

    const chartData = await yahooFinance.getFuturesTradeChartData('ES', trade, '5');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/ES%3DF'),
      expect.objectContaining({
        params: expect.objectContaining({ interval: '5m' })
      })
    );
    expect(chartData).toMatchObject({
      source: 'yahoo',
      chart_symbol: 'ES=F',
      futures_continuous: true,
      interval: '5min',
      fallback: false
    });
    expect(chartData.candles).toHaveLength(2);
  });

  it('degrades an unavailable intraday request to daily candles', async () => {
    const recentEntry = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    axios.get
      .mockRejectedValueOnce(new Error('1m data not available'))
      .mockResolvedValueOnce(yahooResponse('1d'));

    const chartData = await yahooFinance.getFuturesTradeChartData('ES', {
      symbol: 'ESU26',
      entry_time: recentEntry
    }, '1');

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls[1][1].params.interval).toBe('1d');
    expect(chartData).toMatchObject({
      interval: 'daily',
      fallback: true,
      fallback_reason: '1m data not available'
    });
  });

  it('can be disabled by a self-hosted operator', async () => {
    process.env.YAHOO_FINANCE_ENABLED = 'false';

    await expect(yahooFinance.getFuturesTradeChartData('ES', {
      symbol: 'ESU26',
      entry_time: new Date().toISOString()
    }, '1')).rejects.toThrow(/disabled/);
  });
});

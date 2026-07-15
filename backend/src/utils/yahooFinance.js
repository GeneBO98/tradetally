const axios = require('axios');
const { getFuturesPointValue, getFuturesTickSize } = require('./futuresUtils');

const DAY_MS = 24 * 60 * 60 * 1000;
const RESOLUTIONS = {
  '1': { yahoo_interval: '1m', interval: '1min' },
  '5': { yahoo_interval: '5m', interval: '5min' },
  '15': { yahoo_interval: '15m', interval: '15min' },
  '60': { yahoo_interval: '60m', interval: '1hour' },
  D: { yahoo_interval: '1d', interval: 'daily' }
};

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

class YahooFinanceClient {
  isEnabled() {
    return process.env.YAHOO_FINANCE_ENABLED !== 'false';
  }

  getContinuousSymbol(root) {
    return `${String(root).trim().toUpperCase()}=F`;
  }

  availableResolutions(entryDate) {
    const entryTime = toDate(entryDate);
    if (!entryTime) return ['D'];
    const ageDays = Math.max(0, (Date.now() - entryTime.getTime()) / DAY_MS);
    if (ageDays <= 30) return ['1', '5', '15', '60', 'D'];
    if (ageDays <= 60) return ['5', '15', '60', 'D'];
    return ['D'];
  }

  effectiveResolution(requestedResolution, entryDate) {
    const requested = Object.hasOwn(RESOLUTIONS, requestedResolution) ? requestedResolution : '1';
    const available = this.availableResolutions(entryDate);
    if (available.includes(requested)) return requested;
    if (requested === '1' && available.includes('5')) return '5';
    return 'D';
  }

  chartWindow(entryDate, exitDate, resolution) {
    const entryTime = toDate(entryDate);
    if (!entryTime) throw new Error('Trade is missing entry time information');
    const exitTime = toDate(exitDate) || entryTime;

    if (resolution === 'D') {
      return {
        period1: Math.floor((entryTime.getTime() - 30 * DAY_MS) / 1000),
        period2: Math.floor(Math.min(Date.now(), Math.max(entryTime, exitTime) + 10 * DAY_MS) / 1000)
      };
    }

    // A 24-hour window centered on entry covers a complete futures session
    // without requesting excessive minute data from the no-cost endpoint.
    return {
      period1: Math.floor((entryTime.getTime() - 12 * 60 * 60 * 1000) / 1000),
      period2: Math.floor(Math.min(Date.now(), entryTime.getTime() + 12 * 60 * 60 * 1000) / 1000)
    };
  }

  async fetchCandles(yahooSymbol, entryDate, exitDate, resolution) {
    const config = RESOLUTIONS[resolution];
    const window = this.chartWindow(entryDate, exitDate, resolution);
    if (window.period2 <= window.period1) {
      throw new Error('Yahoo Finance chart window is not available yet');
    }

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`,
      {
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TradeTally/2.8'
        },
        params: {
          interval: config.yahoo_interval,
          period1: window.period1,
          period2: window.period2,
          includePrePost: true,
          events: 'history'
        }
      }
    );

    const result = response.data?.chart?.result?.[0];
    const providerError = response.data?.chart?.error;
    if (!result || providerError) {
      throw new Error(providerError?.description || `No Yahoo Finance data available for ${yahooSymbol}`);
    }
    if (result.meta?.instrumentType && result.meta.instrumentType !== 'FUTURE') {
      throw new Error(`${yahooSymbol} did not resolve to a futures instrument`);
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const candles = timestamps.map((time, index) => ({
      time: Number(time),
      open: asNumber(quote.open?.[index]),
      high: asNumber(quote.high?.[index]),
      low: asNumber(quote.low?.[index]),
      close: asNumber(quote.close?.[index]),
      volume: asNumber(quote.volume?.[index])
    })).filter((candle) => (
      Number.isFinite(candle.time) &&
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    ));

    if (!candles.length) {
      throw new Error(`No Yahoo Finance candles available for ${yahooSymbol}`);
    }
    return candles;
  }

  async getFuturesTradeChartData(root, trade, requestedResolution = '1') {
    if (!this.isEnabled()) {
      throw new Error('Yahoo Finance futures fallback is disabled');
    }

    const yahooSymbol = this.getContinuousSymbol(root);
    const entryDate = trade.entry_time || trade.trade_date;
    const exitDate = trade.exit_time || null;
    let resolution = this.effectiveResolution(requestedResolution, entryDate);
    let fallbackReason = resolution !== requestedResolution
      ? `${requestedResolution}-minute data is outside Yahoo Finance retention`
      : null;
    let candles;

    try {
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution);
    } catch (error) {
      if (resolution === 'D') throw error;
      fallbackReason = error.message;
      resolution = 'D';
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution);
    }

    return {
      type: resolution === 'D' ? 'daily' : 'intraday',
      interval: RESOLUTIONS[resolution].interval,
      candles,
      source: 'yahoo',
      symbol: trade.symbol,
      chart_symbol: yahooSymbol,
      futures_continuous: true,
      tick_size: asNumber(trade.tick_size) ?? getFuturesTickSize(root),
      point_value: asNumber(trade.point_value) ?? getFuturesPointValue(root),
      available_resolutions: this.availableResolutions(entryDate),
      fallback: resolution !== requestedResolution,
      fallback_reason: fallbackReason
    };
  }
}

module.exports = new YahooFinanceClient();

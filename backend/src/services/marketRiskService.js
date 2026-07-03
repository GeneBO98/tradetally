/**
 * Market Risk Service
 * Computes macro market-risk indicators for the dashboard widget and public page.
 *
 * Data sources (no API key required):
 * - FRED public CSV endpoint (fredgraph.csv) for yield curve, VIX, high-yield
 *   spread, S&P 500, M2, corporate equities market value, GDP, and corporate
 *   net worth (Z.1 flow of funds series)
 * - multpl.com for the Shiller CAPE ratio
 *
 * Results are cached in the market_risk_cache table and refreshed at most
 * every CACHE_MAX_AGE_MS. Stale cache is served immediately while a
 * background refresh runs (stale-while-revalidate).
 */

const axios = require('axios');
const db = require('../config/database');

const LOG_PREFIX = '[MARKET-RISK]';

const CACHE_KEY = 'latest';
// Underlying series update daily at most; refresh twice a day
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// If a refresh failed, don't hammer sources on every request
const REFRESH_RETRY_MS = 15 * 60 * 1000;

const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const MULTPL_CAPE_URL = 'https://www.multpl.com/shiller-pe';
const HTTP_TIMEOUT_MS = 15000;
const USER_AGENT = 'TradeTally/market-risk (+https://tradetally.io)';

class MarketRiskService {
  constructor() {
    this.refreshing = false;
    this.lastFailedRefreshAt = 0;
  }

  /**
   * Public entry point: serve cached indicators, refreshing when stale.
   */
  async getIndicators() {
    const cached = await this.getCached();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      if (ageMs > CACHE_MAX_AGE_MS) {
        // Serve stale data immediately, refresh in the background
        this.refreshInBackground();
      }
      return cached.payload;
    }

    // No cache yet (first request after install) - fetch synchronously
    const payload = await this.refresh();
    return payload;
  }

  async getCached() {
    try {
      const result = await db.query(
        `SELECT payload, fetched_at FROM market_risk_cache WHERE cache_key = $1`,
        [CACHE_KEY]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to read cache:`, error.message);
      return null;
    }
  }

  refreshInBackground() {
    if (this.refreshing) return;
    if (Date.now() - this.lastFailedRefreshAt < REFRESH_RETRY_MS) return;
    this.refresh().catch(error => {
      this.lastFailedRefreshAt = Date.now();
      console.error(`${LOG_PREFIX} Background refresh failed:`, error.message);
    });
  }

  /**
   * Fetch all sources, compute indicators, and upsert the cache.
   */
  async refresh() {
    if (this.refreshing) {
      // Another request already triggered a refresh; serve whatever exists
      const cached = await this.getCached();
      if (cached) return cached.payload;
    }

    this.refreshing = true;
    try {
      const indicators = await this.computeIndicators();
      const available = indicators.filter(i => i.value !== null);

      if (available.length === 0) {
        this.lastFailedRefreshAt = Date.now();
        throw new Error('All market risk indicator sources failed');
      }

      const payload = {
        as_of: new Date().toISOString(),
        summary: this.buildSummary(available),
        indicators
      };

      await db.query(
        `INSERT INTO market_risk_cache (cache_key, payload, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key)
         DO UPDATE SET payload = $2, fetched_at = NOW()`,
        [CACHE_KEY, JSON.stringify(payload)]
      );

      console.log(`${LOG_PREFIX} Refreshed ${available.length}/${indicators.length} indicators`);
      return payload;
    } finally {
      this.refreshing = false;
    }
  }

  buildSummary(indicators) {
    const counts = { red: 0, amber: 0, green: 0 };
    for (const ind of indicators) {
      if (counts[ind.status] !== undefined) counts[ind.status]++;
    }

    let level;
    let headline;
    if (counts.red >= 4) {
      level = 'elevated';
      headline = 'Elevated risk: valuations stretched across multiple measures';
    } else if (counts.red >= 2 || counts.amber >= 4) {
      level = 'caution';
      headline = 'Caution: several measures are stretched';
    } else if (counts.red >= 1 || counts.amber >= 2) {
      level = 'mixed';
      headline = 'Mixed signals: a few measures warrant attention';
    } else {
      level = 'normal';
      headline = 'No major stress signals across tracked measures';
    }

    return { ...counts, level, headline };
  }

  /**
   * Compute all indicators independently so one failing source
   * doesn't take down the rest.
   */
  async computeIndicators() {
    const results = await Promise.allSettled([
      this.getShillerCape(),
      this.getBuffettIndicator(),
      this.getTobinsQ(),
      this.getYieldCurve(),
      this.getSp500ToM2(),
      this.getVix(),
      this.getHighYieldSpread()
    ]);

    const placeholders = [
      this.unavailable('shiller_cape', 'Shiller CAPE ratio'),
      this.unavailable('buffett_indicator', 'Buffett Indicator'),
      this.unavailable('tobins_q', "Tobin's Q"),
      this.unavailable('yield_curve', 'Yield curve (10y-2y)'),
      this.unavailable('sp500_m2', 'S&P 500 / M2'),
      this.unavailable('vix', 'VIX (volatility)'),
      this.unavailable('hy_spread', 'High-yield credit spread')
    ];

    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      console.error(`${LOG_PREFIX} ${placeholders[i].key} failed:`, result.reason?.message);
      return placeholders[i];
    });
  }

  unavailable(key, name) {
    return {
      key,
      name,
      value: null,
      unit: null,
      display_value: null,
      status: 'unknown',
      status_label: 'Unavailable',
      detail: 'Data source temporarily unavailable',
      description: null,
      as_of: null
    };
  }

  // ==========================================================================
  // Indicators
  // ==========================================================================

  async getShillerCape() {
    const html = await this.fetchText(MULTPL_CAPE_URL);
    const match = html.match(/Current Shiller PE Ratio is ([\d.]+)/i);
    if (!match) throw new Error('Could not parse Shiller CAPE from multpl.com');
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value)) throw new Error('Invalid Shiller CAPE value');

    let status, statusLabel;
    if (value >= 30) {
      status = 'red';
      statusLabel = 'Overvalued';
    } else if (value >= 25) {
      status = 'amber';
      statusLabel = 'Elevated';
    } else {
      status = 'green';
      statusLabel = 'Normal';
    }

    return {
      key: 'shiller_cape',
      name: 'Shiller CAPE ratio',
      value,
      unit: 'x',
      display_value: value.toFixed(1),
      status,
      status_label: statusLabel,
      detail: `${value.toFixed(1)}x vs ~17 long-term avg`,
      description: 'Cyclically-adjusted P/E for the S&P 500. Readings above ~30 have historically preceded weak decade-ahead returns.',
      as_of: new Date().toISOString().slice(0, 10)
    };
  }

  async getBuffettIndicator() {
    const [equities, gdp] = await Promise.all([
      this.fetchFredSeries('NCBEILQ027S', this.yearsAgo(3)),
      this.fetchFredSeries('GDP', this.yearsAgo(3))
    ]);
    const latestEquities = this.latest(equities); // millions of dollars
    const latestGdp = this.latest(gdp); // billions of dollars
    const value = Math.round((latestEquities.value / 1000 / latestGdp.value) * 100);

    let status, statusLabel;
    if (value >= 150) {
      status = 'red';
      statusLabel = 'Overvalued';
    } else if (value >= 100) {
      status = 'amber';
      statusLabel = 'Elevated';
    } else {
      status = 'green';
      statusLabel = 'Normal';
    }

    return {
      key: 'buffett_indicator',
      name: 'Buffett Indicator',
      value,
      unit: '% GDP',
      display_value: String(value),
      status,
      status_label: statusLabel,
      detail: `${value}% of GDP`,
      description: "Total US equity market value divided by GDP. Warren Buffett called the 150-200% zone 'playing with fire'.",
      as_of: latestEquities.date
    };
  }

  async getTobinsQ() {
    const [equities, netWorth] = await Promise.all([
      this.fetchFredSeries('NCBEILQ027S', this.yearsAgo(3)),
      this.fetchFredSeries('TNWMVBSNNCB', this.yearsAgo(3))
    ]);
    const latestEquities = this.latest(equities);
    const latestNetWorth = this.latest(netWorth);
    const value = latestEquities.value / latestNetWorth.value;

    let status, statusLabel;
    if (value >= 1.25) {
      status = 'red';
      statusLabel = 'Overvalued';
    } else if (value >= 1.0) {
      status = 'amber';
      statusLabel = 'Elevated';
    } else {
      status = 'green';
      statusLabel = 'Normal';
    }

    return {
      key: 'tobins_q',
      name: "Tobin's Q",
      value: Math.round(value * 100) / 100,
      unit: null,
      display_value: value.toFixed(2),
      status,
      status_label: statusLabel,
      detail: `${value.toFixed(2)} vs ~0.75 long-run mean`,
      description: 'Corporate market value divided by the replacement cost of assets. The long-run mean is ~0.75; above 1 suggests overvaluation.',
      as_of: latestEquities.date
    };
  }

  async getYieldCurve() {
    const series = await this.fetchFredSeries('T10Y2Y', this.yearsAgo(6));
    const latest = this.latest(series);
    const value = latest.value;

    // Find the most recent inversion (negative spread) to detect the
    // post-un-inversion window where recessions have historically started
    let lastInversionDate = null;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].value < 0) {
        lastInversionDate = series[i].date;
        break;
      }
    }
    const monthsSinceInversion = lastInversionDate
      ? Math.round((new Date(latest.date) - new Date(lastInversionDate)) / (30.44 * 24 * 60 * 60 * 1000))
      : null;

    let status, statusLabel, description;
    if (value < 0) {
      status = 'red';
      statusLabel = 'Inverted';
      description = 'The 10y-2y Treasury spread is inverted. Inversions have preceded every US recession since the 1970s.';
    } else if (monthsSinceInversion !== null && monthsSinceInversion <= 24) {
      status = 'amber';
      statusLabel = 'Caution';
      description = `Un-inverted ~${monthsSinceInversion} months ago. Recessions historically strike 6-24 months AFTER un-inversion, so we're in that window.`;
    } else {
      status = 'green';
      statusLabel = 'Normal';
      description = 'The 10y-2y Treasury spread is positive and outside the historical post-inversion risk window.';
    }

    return {
      key: 'yield_curve',
      name: 'Yield curve (10y-2y)',
      value,
      unit: 'pp',
      display_value: value.toFixed(2),
      status,
      status_label: statusLabel,
      detail: `${value >= 0 ? '+' : ''}${value.toFixed(2)} spread`,
      description,
      as_of: latest.date
    };
  }

  async getSp500ToM2() {
    const [sp500, m2] = await Promise.all([
      this.fetchFredSeries('SP500', this.yearsAgo(10)),
      this.fetchFredSeries('M2SL', this.yearsAgo(11))
    ]);
    if (m2.length === 0 || sp500.length === 0) throw new Error('Empty SP500/M2 series');

    // For each S&P observation use the most recent M2 print on/before it
    const ratios = [];
    let m2Index = 0;
    for (const obs of sp500) {
      while (m2Index + 1 < m2.length && m2[m2Index + 1].date <= obs.date) m2Index++;
      if (m2[m2Index].date <= obs.date) {
        ratios.push({ date: obs.date, value: obs.value / m2[m2Index].value });
      }
    }
    if (ratios.length === 0) throw new Error('Could not align SP500 and M2 series');

    const current = ratios[ratios.length - 1];
    const below = ratios.filter(r => r.value <= current.value).length;
    const percentile = Math.round((below / ratios.length) * 100);

    let status, statusLabel;
    if (percentile >= 90) {
      status = 'red';
      statusLabel = 'Overvalued';
    } else if (percentile >= 75) {
      status = 'amber';
      statusLabel = 'Elevated';
    } else {
      status = 'green';
      statusLabel = 'Normal';
    }

    return {
      key: 'sp500_m2',
      name: 'S&P 500 / M2',
      value: Math.round(current.value * 1000) / 1000,
      unit: null,
      display_value: current.value.toFixed(3),
      status,
      status_label: statusLabel,
      detail: `${this.ordinal(percentile)} percentile of its ~10y range`,
      description: "The index relative to the money supply, which strips monetary inflation out of nominal 'record highs'.",
      as_of: current.date
    };
  }

  async getVix() {
    const series = await this.fetchFredSeries('VIXCLS', this.monthsAgo(2));
    const latest = this.latest(series);
    const value = latest.value;

    let status, statusLabel, detailNote;
    if (value >= 35) {
      status = 'red';
      statusLabel = 'Stress';
      detailNote = 'market stress';
    } else if (value >= 25) {
      status = 'amber';
      statusLabel = 'Elevated';
      detailNote = 'elevated volatility';
    } else if (value >= 17) {
      status = 'green';
      statusLabel = 'Normal';
      detailNote = 'normal range';
    } else if (value >= 12) {
      status = 'amber';
      statusLabel = 'Caution';
      detailNote = 'low - complacency risk';
    } else {
      status = 'red';
      statusLabel = 'Complacent';
      detailNote = 'extreme complacency';
    }

    return {
      key: 'vix',
      name: 'VIX (volatility)',
      value,
      unit: null,
      display_value: value.toFixed(1),
      status,
      status_label: statusLabel,
      detail: `${value.toFixed(1)} (${detailNote})`,
      description: "The 'fear index'. Very LOW readings signal complacency, a classic late-bubble tell; spikes signal fear.",
      as_of: latest.date
    };
  }

  async getHighYieldSpread() {
    const series = await this.fetchFredSeries('BAMLH0A0HYM2', this.monthsAgo(2));
    const latest = this.latest(series);
    const value = latest.value;

    let status, statusLabel;
    if (value < 3) {
      status = 'red';
      statusLabel = 'Very tight';
    } else if (value < 4) {
      status = 'amber';
      statusLabel = 'Tight';
    } else if (value <= 7) {
      status = 'green';
      statusLabel = 'Normal';
    } else if (value <= 10) {
      status = 'amber';
      statusLabel = 'Widening';
    } else {
      status = 'red';
      statusLabel = 'Stress';
    }

    return {
      key: 'hy_spread',
      name: 'High-yield credit spread',
      value,
      unit: 'pp',
      display_value: value.toFixed(2),
      status,
      status_label: statusLabel,
      detail: `${value.toFixed(2)}% over Treasuries`,
      description: 'Junk-bond risk premium. Very tight = investors pricing in near-zero risk (froth); widening = stress.',
      as_of: latest.date
    };
  }

  // ==========================================================================
  // Data source helpers
  // ==========================================================================

  /**
   * Fetch a FRED series via the public fredgraph.csv endpoint (no API key).
   * Returns [{ date: 'YYYY-MM-DD', value: number }] in ascending date order.
   */
  async fetchFredSeries(seriesId, startDate) {
    const csv = await this.fetchText(`${FRED_CSV_URL}?id=${seriesId}&cosd=${startDate}`);
    const lines = csv.trim().split('\n');
    const observations = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, raw] = lines[i].split(',');
      const value = parseFloat(raw);
      if (date && Number.isFinite(value)) {
        observations.push({ date: date.trim(), value });
      }
    }
    if (observations.length === 0) throw new Error(`FRED series ${seriesId} returned no data`);
    return observations;
  }

  async fetchText(url) {
    const response = await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      responseType: 'text',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv,text/html,*/*' }
    });
    if (typeof response.data !== 'string') return String(response.data);
    return response.data;
  }

  latest(series) {
    return series[series.length - 1];
  }

  yearsAgo(years) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  }

  monthsAgo(months) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }

  ordinal(n) {
    const rem10 = n % 10;
    const rem100 = n % 100;
    if (rem10 === 1 && rem100 !== 11) return `${n}st`;
    if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
    if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
    return `${n}th`;
  }
}

module.exports = new MarketRiskService();

const fetch = require('node-fetch');

const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const CPI_SERIES_ID = 'CUUR0000SA0';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_COVERAGE_PERCENT = 80;

let cachedRange = null;
let cachedAt = 0;
let cachedErrorAt = 0;

function round(value, decimals = 3) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function toDateString(value) {
  return String(value || '').split('T')[0];
}

function monthDifference(startDate, endDate) {
  const start = new Date(`${toDateString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toDateString(endDate)}T00:00:00.000Z`);
  return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12)
    + (end.getUTCMonth() - start.getUTCMonth());
}

function normalizeBlsPoint(item) {
  if (!item?.period?.startsWith('M')) return null;
  const month = Number(item.period.slice(1));
  const value = Number(item.value);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    date: `${item.year}-${String(month).padStart(2, '0')}-01`,
    value
  };
}

async function requestBlsRange(startYear, endYear) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(BLS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: [CPI_SERIES_ID],
        startyear: String(startYear),
        endyear: String(endYear)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`BLS API returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.status !== 'REQUEST_SUCCEEDED') {
      throw new Error(payload.message?.join('; ') || 'BLS API request failed');
    }

    return (payload.Results?.series?.[0]?.data || [])
      .map(normalizeBlsPoint)
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCpiPoints(startYear, endYear) {
  const now = Date.now();
  if (
    cachedRange
    && cachedRange.start_year <= startYear
    && cachedRange.end_year >= endYear
    && now - cachedAt < CACHE_TTL_MS
  ) {
    return cachedRange.points;
  }

  if (cachedErrorAt && now - cachedErrorAt < ERROR_CACHE_TTL_MS) {
    throw new Error('Historical inflation data is temporarily unavailable');
  }

  try {
    const requests = [];
    for (let chunkStart = startYear; chunkStart <= endYear; chunkStart += 10) {
      const chunkEnd = Math.min(chunkStart + 9, endYear);
      requests.push(requestBlsRange(chunkStart, chunkEnd));
    }
    const chunks = await Promise.all(requests);
    const byDate = new Map();
    chunks.flat().forEach(point => byDate.set(point.date, point));
    const points = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));

    if (points.length < 2) {
      throw new Error('BLS CPI-U response did not contain enough monthly observations');
    }

    cachedRange = {
      start_year: startYear,
      end_year: endYear,
      points
    };
    cachedAt = now;
    cachedErrorAt = 0;
    return points;
  } catch (error) {
    cachedErrorAt = now;
    throw error;
  }
}

function calculateHistoricalInflation(points, scenario) {
  const requestedStart = toDateString(scenario.data_start);
  const requestedEnd = toDateString(scenario.data_end);
  const periodYears = Number(scenario.period_years);
  if (!requestedStart || !requestedEnd || !Number.isFinite(periodYears) || periodYears <= 0) {
    return null;
  }

  const startPoint = [...points]
    .reverse()
    .find(point => point.date <= requestedStart);
  const endPoint = [...points]
    .reverse()
    .find(point => point.date <= requestedEnd);
  if (!startPoint || !endPoint || endPoint.date <= startPoint.date) {
    return null;
  }

  const elapsedMonths = monthDifference(startPoint.date, endPoint.date);
  if (elapsedMonths <= 0) return null;

  const observations = points.filter(point => (
    point.date >= startPoint.date && point.date <= endPoint.date
  )).length;
  const expectedObservations = elapsedMonths + 1;
  const spanCoverage = (elapsedMonths / (periodYears * 12)) * 100;
  const observationCoverage = (observations / expectedObservations) * 100;
  const coveragePercent = Math.min(100, spanCoverage, observationCoverage);
  if (coveragePercent < MIN_COVERAGE_PERCENT) {
    return null;
  }

  const annualInflation = (
    (endPoint.value / startPoint.value) ** (12 / elapsedMonths)
  ) - 1;
  if (!Number.isFinite(annualInflation) || annualInflation <= -1) {
    return null;
  }

  return {
    inflation_rate_percent: round(annualInflation * 100),
    inflation_source: 'historical_us_cpi_u',
    inflation_series_id: CPI_SERIES_ID,
    inflation_data_start: startPoint.date,
    inflation_data_end: endPoint.date,
    inflation_time_coverage_percent: round(coveragePercent, 2)
  };
}

async function enrichScenarios(scenarios = []) {
  if (scenarios.length === 0) {
    return {
      scenarios: [],
      source: 'historical_us_cpi_u',
      series_id: CPI_SERIES_ID,
      unavailable: false,
      message: null
    };
  }

  const startYear = Math.min(...scenarios.map(scenario => Number(toDateString(scenario.data_start).slice(0, 4))));
  const endYear = Math.max(...scenarios.map(scenario => Number(toDateString(scenario.data_end).slice(0, 4))));

  try {
    const points = await fetchCpiPoints(startYear, endYear);
    const enrichedScenarios = scenarios
      .map(scenario => {
        const inflation = calculateHistoricalInflation(points, scenario);
        return inflation ? { ...scenario, ...inflation } : null;
      })
      .filter(Boolean);

    return {
      scenarios: enrichedScenarios,
      source: 'historical_us_cpi_u',
      series_id: CPI_SERIES_ID,
      unavailable: enrichedScenarios.length === 0,
      message: enrichedScenarios.length === 0
        ? 'Historical portfolio periods did not have sufficient matching CPI-U coverage.'
        : null
    };
  } catch (error) {
    console.warn(`[RETIREMENT] Historical CPI-U data unavailable: ${error.message}`);
    return {
      scenarios: [],
      source: 'historical_us_cpi_u',
      series_id: CPI_SERIES_ID,
      unavailable: true,
      message: 'Historical inflation data is temporarily unavailable.'
    };
  }
}

function resetCacheForTests() {
  cachedRange = null;
  cachedAt = 0;
  cachedErrorAt = 0;
}

module.exports = {
  CPI_SERIES_ID,
  calculateHistoricalInflation,
  enrichScenarios,
  resetCacheForTests
};

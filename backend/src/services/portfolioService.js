const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const historicalPriceCache = require('../utils/historicalPriceCache');
const HoldingsService = require('./holdingsService');
const NotificationService = require('./notificationService');

const UNSORTED_ACCOUNT = '__unsorted__';
const DEFAULT_BENCHMARK = 'SPY';
const DEFAULT_PERIOD = '6M';
// A cached quote newer than this is considered "fresh". Older (or missing)
// quotes are still shown to the user, but the position is flagged stale and a
// background refresh is triggered so the UI can stream in the new price.
const PRICE_FRESH_MS = 10 * 60 * 1000;
// Symbols currently being fetched in the background. Shared across all
// concurrent requests so the overview/positions/rebalance endpoints (which all
// fire at once on page load) don't each kick off duplicate Finnhub calls for
// the same symbol.
const inFlightPriceSymbols = new Set();
const DEFAULT_PREFERENCES = {
  defaultBenchmarkSymbol: DEFAULT_BENCHMARK,
  driftThresholdPercent: 5,
  drawdownThresholdPercent: 10,
  alertsEnabled: true
};

async function notificationsTableExists() {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'notifications'
     ) AS exists`
  );

  return result.rows[0]?.exists === true;
}

async function portfolioTargetsTableExists() {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'portfolio_targets'
     ) AS exists`
  );

  return result.rows[0]?.exists === true;
}

function round(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function roundNullable(value, decimals = 2) {
  return value === null || value === undefined ? null : round(value, decimals);
}

function normalizeAccounts(accounts) {
  if (!accounts) return [];

  const rawValues = Array.isArray(accounts) ? accounts : String(accounts).split(',');
  return rawValues
    .map(value => String(value).trim())
    .filter(Boolean);
}

function normalizeSymbol(symbol) {
  return String(symbol || DEFAULT_BENCHMARK).trim().toUpperCase();
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function getPeriodRange(period = DEFAULT_PERIOD) {
  const end = new Date();
  const start = new Date(end);
  const normalized = String(period || DEFAULT_PERIOD).toUpperCase();
  const dynamicDayMatch = normalized.match(/^(\d+)D_INTERNAL$/);

  if (dynamicDayMatch) {
    const days = Math.max(1, parseInt(dynamicDayMatch[1], 10) || 1);
    start.setDate(start.getDate() - (days - 1));
    return {
      period: normalized,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }

  switch (normalized) {
    case '1M':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '5Y':
      start.setFullYear(start.getFullYear() - 5);
      break;
    case '10Y':
      start.setFullYear(start.getFullYear() - 10);
      break;
    case '1Y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'YTD':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case '6M':
    default:
      start.setMonth(start.getMonth() - 6);
      break;
  }

  return {
    period: normalized,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

function buildAccountFilter(column, accounts, values, startingParamIndex) {
  if (!accounts || accounts.length === 0) {
    return {
      clause: '',
      nextParamIndex: startingParamIndex
    };
  }

  const concreteAccounts = accounts.filter(account => account !== UNSORTED_ACCOUNT);
  const includeUnsorted = accounts.includes(UNSORTED_ACCOUNT);
  const conditions = [];
  let paramIndex = startingParamIndex;

  if (concreteAccounts.length > 0) {
    const placeholders = concreteAccounts.map(() => `$${paramIndex++}`).join(',');
    conditions.push(`${column} IN (${placeholders})`);
    values.push(...concreteAccounts);
  }

  if (includeUnsorted) {
    conditions.push(`(${column} IS NULL OR ${column} = '')`);
  }

  if (conditions.length === 0) {
    return {
      clause: '',
      nextParamIndex: paramIndex
    };
  }

  return {
    clause: ` AND (${conditions.join(' OR ')})`,
    nextParamIndex: paramIndex
  };
}

function annualizeReturn(totalReturnDecimal, observationCount) {
  if (!Number.isFinite(totalReturnDecimal) || observationCount <= 1) {
    return 0;
  }

  const years = observationCount / 252;
  if (years <= 0 || 1 + totalReturnDecimal <= 0) {
    return 0;
  }

  return (1 + totalReturnDecimal) ** (1 / years) - 1;
}

function calculateAnnualizedVolatility(returns) {
  if (!returns || returns.length < 2) {
    return 0;
  }

  const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function calculateBeta(portfolioReturns, benchmarkReturns) {
  if (!portfolioReturns || !benchmarkReturns || portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) {
    return 0;
  }

  const benchmarkMean = benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length;
  const portfolioMean = portfolioReturns.reduce((sum, value) => sum + value, 0) / portfolioReturns.length;

  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < portfolioReturns.length; index += 1) {
    covariance += (portfolioReturns[index] - portfolioMean) * (benchmarkReturns[index] - benchmarkMean);
    variance += (benchmarkReturns[index] - benchmarkMean) ** 2;
  }

  if (variance === 0) {
    return 0;
  }

  return covariance / variance;
}

function calculateMaxDrawdown(values) {
  if (!values || values.length === 0) {
    return 0;
  }

  let peak = values[0];
  let maxDrawdown = 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }

    if (peak <= 0) {
      continue;
    }

    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

class PortfolioService {
  static async getPreferences(userId) {
    const result = await db.query(
      `SELECT *
       FROM portfolio_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        ...DEFAULT_PREFERENCES
      };
    }

    const row = result.rows[0];
    return {
      defaultBenchmarkSymbol: row.default_benchmark_symbol || DEFAULT_PREFERENCES.defaultBenchmarkSymbol,
      driftThresholdPercent: parseFloat(row.drift_threshold_percent) || DEFAULT_PREFERENCES.driftThresholdPercent,
      drawdownThresholdPercent: parseFloat(row.drawdown_threshold_percent) || DEFAULT_PREFERENCES.drawdownThresholdPercent,
      alertsEnabled: row.alerts_enabled ?? DEFAULT_PREFERENCES.alertsEnabled
    };
  }

  static async updatePreferences(userId, data) {
    const payload = {
      defaultBenchmarkSymbol: normalizeSymbol(data.defaultBenchmarkSymbol || DEFAULT_PREFERENCES.defaultBenchmarkSymbol),
      driftThresholdPercent: Number.isFinite(Number(data.driftThresholdPercent))
        ? Number(data.driftThresholdPercent)
        : DEFAULT_PREFERENCES.driftThresholdPercent,
      drawdownThresholdPercent: Number.isFinite(Number(data.drawdownThresholdPercent))
        ? Number(data.drawdownThresholdPercent)
        : DEFAULT_PREFERENCES.drawdownThresholdPercent,
      alertsEnabled: parseBoolean(data.alertsEnabled, DEFAULT_PREFERENCES.alertsEnabled)
    };

    const result = await db.query(
      `INSERT INTO portfolio_preferences (
         user_id,
         default_benchmark_symbol,
         drift_threshold_percent,
         drawdown_threshold_percent,
         alerts_enabled
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         default_benchmark_symbol = EXCLUDED.default_benchmark_symbol,
         drift_threshold_percent = EXCLUDED.drift_threshold_percent,
         drawdown_threshold_percent = EXCLUDED.drawdown_threshold_percent,
         alerts_enabled = EXCLUDED.alerts_enabled,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        payload.defaultBenchmarkSymbol,
        payload.driftThresholdPercent,
        payload.drawdownThresholdPercent,
        payload.alertsEnabled
      ]
    );

    const row = result.rows[0];
    return {
      defaultBenchmarkSymbol: row.default_benchmark_symbol,
      driftThresholdPercent: parseFloat(row.drift_threshold_percent),
      drawdownThresholdPercent: parseFloat(row.drawdown_threshold_percent),
      alertsEnabled: row.alerts_enabled
    };
  }

  static async getOverview(userId, options = {}) {
    const positions = await this.getPositions(userId, options);
    const totals = this._buildTotals(positions);
    const allocation = positions.map(position => ({
      symbol: position.symbol,
      value: round(position.currentValue || 0),
      percent: round(position.allocationPercent || 0)
    }));

    return {
      positionCount: positions.length,
      totalValue: round(totals.totalValue),
      totalCostBasis: round(totals.totalCostBasis),
      unrealizedPnL: round(totals.unrealizedPnL),
      unrealizedPnLPercent: round(totals.unrealizedPnLPercent),
      totalDividends: round(totals.totalDividends),
      totalReturn: round(totals.totalReturn),
      totalReturnPercent: round(totals.totalReturnPercent),
      targetCoveragePercent: round(totals.targetCoveragePercent),
      allocation
    };
  }

  static async getPositions(userId, options = {}) {
    const accounts = normalizeAccounts(options.accounts);
    const [manualPositions, tradePositions, tradeDividendsBySymbol] = await Promise.all([
      this._getManualPositions(userId, accounts),
      this._getTradePositions(userId, accounts),
      accounts.length === 0 ? this._getTradeDividendsBySymbol(userId) : Promise.resolve({})
    ]);

    const mergedPositions = this._mergePositions(manualPositions, tradePositions, tradeDividendsBySymbol);
    await this._applyCurrentPrices(userId, mergedPositions);

    const totals = this._buildTotals(mergedPositions);

    // Targets are keyed by symbol (portfolio_targets), so they apply to any
    // position regardless of whether it came from a manual holding or open
    // trades. The symbol-keyed value is authoritative; fall back to a legacy
    // value carried on the holding row only when no symbol target exists.
    const targetsBySymbol = await this._getTargetsBySymbol(userId);

    const positions = mergedPositions.map(position => ({
      ...position,
      currentValue: roundNullable(position.currentValue),
      currentPrice: roundNullable(position.currentPrice, 4),
      totalCostBasis: round(position.totalCostBasis || 0),
      averageCostBasis: roundNullable(position.averageCostBasis, 4),
      totalDividendsReceived: round(position.totalDividendsReceived || 0),
      dividendYieldOnCost: roundNullable(position.dividendYieldOnCost, 2),
      unrealizedPnL: roundNullable(position.unrealizedPnL),
      unrealizedPnLPercent: roundNullable(position.unrealizedPnLPercent),
      allocationPercent: roundNullable(
        totals.totalValue > 0 && position.currentValue !== null
          ? (position.currentValue / totals.totalValue) * 100
          : 0
      ),
      targetAllocationPercent: roundNullable(
        targetsBySymbol.has(position.symbol)
          ? targetsBySymbol.get(position.symbol)
          : position.targetAllocationPercent,
        2
      )
    }));

    positions.sort((left, right) => {
      const rightValue = right.currentValue || 0;
      const leftValue = left.currentValue || 0;

      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }

      return left.symbol.localeCompare(right.symbol);
    });

    return positions;
  }

  static async getRebalancePlan(userId, options = {}) {
    const positions = await this.getPositions(userId, options);
    const preferences = await this.getPreferences(userId);
    const totalValue = positions.reduce((sum, position) => sum + (position.currentValue || 0), 0);
    const targetPositions = positions.filter(position => position.targetAllocationPercent !== null && position.targetAllocationPercent !== undefined);
    const rawTargetPercent = targetPositions.reduce((sum, position) => sum + (position.targetAllocationPercent || 0), 0);

    const rebalancePositions = positions.map(position => {
      const actualPercent = totalValue > 0 && position.currentValue !== null
        ? (position.currentValue / totalValue) * 100
        : 0;

      let normalizedTargetPercent = null;
      let driftPercent = null;
      let targetValue = null;
      let valueDelta = null;
      let shareDelta = null;
      let action = 'hold';

      if (position.targetAllocationPercent !== null && position.targetAllocationPercent !== undefined && rawTargetPercent > 0) {
        normalizedTargetPercent = (position.targetAllocationPercent / rawTargetPercent) * 100;
        targetValue = (normalizedTargetPercent / 100) * totalValue;
        valueDelta = targetValue - (position.currentValue || 0);
        driftPercent = actualPercent - normalizedTargetPercent;

        if (position.currentPrice && position.currentPrice > 0) {
          shareDelta = valueDelta / position.currentPrice;
        }

        if (valueDelta > 0.01) {
          action = 'buy';
        } else if (valueDelta < -0.01) {
          action = 'sell';
        }
      }

      return {
        ...position,
        actualAllocationPercent: round(actualPercent),
        normalizedTargetPercent: roundNullable(normalizedTargetPercent),
        driftPercent: roundNullable(driftPercent),
        targetValue: roundNullable(targetValue),
        valueDelta: roundNullable(valueDelta),
        shareDelta: roundNullable(shareDelta, 4),
        action
      };
    });

    rebalancePositions.sort((left, right) => {
      return Math.abs(right.driftPercent || 0) - Math.abs(left.driftPercent || 0);
    });

    const targetedValue = rebalancePositions
      .filter(position => position.normalizedTargetPercent !== null)
      .reduce((sum, position) => sum + (position.currentValue || 0), 0);

    return {
      totalValue: round(totalValue),
      targetCoveragePercent: round(totalValue > 0 ? (targetedValue / totalValue) * 100 : 0),
      targetTotalPercent: round(rawTargetPercent),
      driftThresholdPercent: preferences.driftThresholdPercent,
      positions: rebalancePositions
    };
  }

  static async getPerformance(userId, options = {}) {
    const preferences = await this.getPreferences(userId);
    const benchmark = normalizeSymbol(options.benchmark || preferences.defaultBenchmarkSymbol);
    const accounts = normalizeAccounts(options.accounts);
    const { period, startDate, endDate } = getPeriodRange(options.period);
    const components = await this._getPositionComponents(userId, accounts);
    const symbols = [...new Set(components.map(component => component.symbol))];

    const [benchmarkCandles, priceSeriesMap] = await Promise.all([
      this._getDailySeries(benchmark, startDate, endDate, userId),
      this._getPriceSeriesMap(symbols, startDate, endDate, userId)
    ]);

    const canonicalDates = benchmarkCandles.length > 0
      ? benchmarkCandles.map(candle => this._toDateString(candle.time))
      : this._buildDateUnion(priceSeriesMap);

    const priceIndexMap = new Map();
    for (const [symbol, candles] of priceSeriesMap.entries()) {
      priceIndexMap.set(symbol, this._buildSeriesIndex(candles));
    }

    const benchmarkIndex = this._buildSeriesIndex(benchmarkCandles);

    const series = [];
    let firstPortfolioValue = null;
    let firstBenchmarkClose = null;
    let previousPortfolioIndex = null;
    let previousBenchmarkIndex = null;

    for (const date of canonicalDates) {
      let portfolioValue = 0;

      for (const component of components) {
        if (component.effectiveDate > date) {
          continue;
        }

        const candleValue = this._getIndexedClose(priceIndexMap.get(component.symbol), date);
        if (candleValue === null) {
          continue;
        }

        portfolioValue += component.shares * candleValue * component.valueMultiplier;
      }

      const benchmarkClose = this._getIndexedClose(benchmarkIndex, date);

      if (portfolioValue > 0 && firstPortfolioValue === null) {
        firstPortfolioValue = portfolioValue;
      }

      if (benchmarkClose !== null && firstBenchmarkClose === null) {
        firstBenchmarkClose = benchmarkClose;
      }

      if (firstPortfolioValue === null || firstBenchmarkClose === null) {
        continue;
      }

      const portfolioIndex = (portfolioValue / firstPortfolioValue) * 100;
      const benchmarkIndexed = (benchmarkClose / firstBenchmarkClose) * 100;
      const portfolioReturnPercent = ((portfolioIndex / 100) - 1) * 100;
      const benchmarkReturnPercent = ((benchmarkIndexed / 100) - 1) * 100;

      const entry = {
        date,
        portfolioValue: round(portfolioValue),
        benchmarkValue: roundNullable(benchmarkClose),
        portfolioIndex: round(portfolioIndex),
        benchmarkIndex: roundNullable(benchmarkIndexed),
        portfolioReturnPercent: round(portfolioReturnPercent),
        benchmarkReturnPercent: roundNullable(benchmarkReturnPercent),
        relativeReturnPercent: roundNullable(portfolioReturnPercent - benchmarkReturnPercent)
      };

      if (previousPortfolioIndex !== null && previousPortfolioIndex > 0) {
        entry.portfolioDailyReturn = (portfolioIndex - previousPortfolioIndex) / previousPortfolioIndex;
      }

      if (previousBenchmarkIndex !== null && previousBenchmarkIndex > 0) {
        entry.benchmarkDailyReturn = (benchmarkIndexed - previousBenchmarkIndex) / previousBenchmarkIndex;
      }

      previousPortfolioIndex = portfolioIndex;
      previousBenchmarkIndex = benchmarkIndexed;
      series.push(entry);
    }

    const portfolioReturns = series
      .map(point => point.portfolioDailyReturn)
      .filter(value => Number.isFinite(value));
    const benchmarkReturns = series
      .map(point => point.benchmarkDailyReturn)
      .filter(value => Number.isFinite(value));

    const alignedReturnsLength = Math.min(portfolioReturns.length, benchmarkReturns.length);
    const alignedPortfolioReturns = portfolioReturns.slice(-alignedReturnsLength);
    const alignedBenchmarkReturns = benchmarkReturns.slice(-alignedReturnsLength);

    const totalReturnDecimal = series.length > 0
      ? (series[series.length - 1].portfolioIndex / 100) - 1
      : 0;
    const benchmarkReturnDecimal = series.length > 0
      ? (series[series.length - 1].benchmarkIndex / 100) - 1
      : 0;
    const annualizedReturn = annualizeReturn(totalReturnDecimal, series.length);
    const benchmarkAnnualizedReturn = annualizeReturn(benchmarkReturnDecimal, series.length);
    const volatility = calculateAnnualizedVolatility(portfolioReturns);
    const benchmarkVolatility = calculateAnnualizedVolatility(benchmarkReturns);
    const sharpeRatio = volatility > 0 ? annualizedReturn / volatility : 0;
    const beta = calculateBeta(alignedPortfolioReturns, alignedBenchmarkReturns);
    const alpha = annualizedReturn - (beta * benchmarkAnnualizedReturn);
    const maxDrawdown = calculateMaxDrawdown(series.map(point => point.portfolioIndex));

    return {
      period,
      startDate,
      endDate,
      benchmark,
      metrics: {
        totalReturnPercent: round(totalReturnDecimal * 100),
        benchmarkReturnPercent: round(benchmarkReturnDecimal * 100),
        annualizedReturnPercent: round(annualizedReturn * 100),
        benchmarkAnnualizedReturnPercent: round(benchmarkAnnualizedReturn * 100),
        volatilityPercent: round(volatility * 100),
        benchmarkVolatilityPercent: round(benchmarkVolatility * 100),
        sharpeRatio: round(sharpeRatio, 3),
        beta: round(beta, 3),
        alphaPercent: round(alpha * 100),
        maxDrawdownPercent: round(maxDrawdown * 100)
      },
      series
    };
  }

  static async getAlertSummary(userId, options = {}) {
    const preferences = await this.getPreferences(userId);
    const [rebalance, performance, recentAlerts] = await Promise.all([
      this.getRebalancePlan(userId, options),
      this.getPerformance(userId, { ...options, period: '6M' }),
      this._getRecentPortfolioAlerts(userId)
    ]);

    const activeConditions = [];

    for (const position of rebalance.positions) {
      if (position.driftPercent === null || Math.abs(position.driftPercent) < preferences.driftThresholdPercent) {
        continue;
      }

      activeConditions.push({
        category: 'allocation_drift',
        symbol: position.symbol,
        message: `${position.symbol} is ${Math.abs(position.driftPercent).toFixed(2)}% ${position.driftPercent > 0 ? 'above' : 'below'} target.`,
        driftPercent: round(position.driftPercent),
        targetAllocationPercent: roundNullable(position.normalizedTargetPercent),
        actualAllocationPercent: roundNullable(position.actualAllocationPercent),
        thresholdPercent: round(preferences.driftThresholdPercent),
        action: position.action
      });
    }

    if (performance.metrics.maxDrawdownPercent >= preferences.drawdownThresholdPercent) {
      activeConditions.push({
        category: 'drawdown',
        symbol: 'Portfolio',
        message: `Drawdown is ${performance.metrics.maxDrawdownPercent.toFixed(2)}% over the last 6 months.`,
        maxDrawdownPercent: round(performance.metrics.maxDrawdownPercent),
        thresholdPercent: round(preferences.drawdownThresholdPercent)
      });
    }

    return {
      alertsEnabled: preferences.alertsEnabled,
      driftThresholdPercent: round(preferences.driftThresholdPercent),
      drawdownThresholdPercent: round(preferences.drawdownThresholdPercent),
      activeConditions,
      recentAlerts,
      lastEvaluatedAt: new Date().toISOString()
    };
  }

  static async createDailySnapshotsForUser(userId, snapshotDate = null) {
    const effectiveDate = snapshotDate || new Date().toISOString().split('T')[0];
    const accountsResult = await db.query(
      `SELECT account_identifier
       FROM user_accounts
       WHERE user_id = $1
         AND account_identifier IS NOT NULL
         AND account_identifier != ''
       ORDER BY is_primary DESC, account_name ASC`,
      [userId]
    );

    const snapshots = [];
    const allAccountsOverview = await this.getOverview(userId, {});
    await this._upsertSnapshotRow(userId, null, effectiveDate, allAccountsOverview);
    snapshots.push({ accountIdentifier: null, snapshotDate: effectiveDate });

    for (const row of accountsResult.rows) {
      const accountIdentifier = row.account_identifier;
      const overview = await this.getOverview(userId, { accounts: accountIdentifier });
      await this._upsertSnapshotRow(userId, accountIdentifier, effectiveDate, overview);
      snapshots.push({ accountIdentifier, snapshotDate: effectiveDate });
    }

    return {
      userId,
      snapshotDate: effectiveDate,
      snapshotsCreated: snapshots.length,
      snapshots
    };
  }

  static async createDailySnapshotsForAllUsers(snapshotDate = null) {
    const effectiveDate = snapshotDate || new Date().toISOString().split('T')[0];
    const usersResult = await db.query(
      `SELECT id
       FROM users
       ORDER BY created_at ASC`,
    );

    const results = [];
    for (const row of usersResult.rows) {
      try {
        results.push(await this.createDailySnapshotsForUser(row.id, effectiveDate));
      } catch (error) {
        results.push({
          userId: row.id,
          snapshotDate: effectiveDate,
          error: error.message
        });
      }
    }

    return {
      snapshotDate: effectiveDate,
      usersProcessed: results.length,
      results
    };
  }

  static async backfillSnapshotsForUser(userId, options = {}) {
    const days = Math.max(1, Math.min(Number(options.days) || 365, 3650));
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));

    const accountsResult = await db.query(
      `SELECT account_identifier
       FROM user_accounts
       WHERE user_id = $1
         AND account_identifier IS NOT NULL
         AND account_identifier != ''
       ORDER BY is_primary DESC, account_name ASC`,
      [userId]
    );

    const snapshotsCreated = [];
    const accountIdentifiers = [null, ...accountsResult.rows.map(row => row.account_identifier)];

    for (const accountIdentifier of accountIdentifiers) {
      const performance = await this.getPerformance(userId, {
        accounts: accountIdentifier || undefined,
        period: `${days}D_INTERNAL`
      });
      const currentOverview = await this.getOverview(userId, {
        accounts: accountIdentifier || undefined
      });

      const latestPoint = performance.series[performance.series.length - 1];
      if (!latestPoint || !latestPoint.portfolioIndex || !currentOverview.totalValue) {
        continue;
      }

      const latestIndex = latestPoint.portfolioIndex;
      const currentValue = currentOverview.totalValue;

      for (const point of performance.series) {
        if (!point.date || !point.portfolioIndex) {
          continue;
        }

        const inferredValue = latestIndex > 0
          ? (currentValue * point.portfolioIndex) / latestIndex
          : currentValue;

        await this._upsertSnapshotRow(userId, accountIdentifier, point.date, {
          totalValue: inferredValue,
          totalCostBasis: currentOverview.totalCostBasis,
          positionCount: currentOverview.positionCount
        });

        snapshotsCreated.push({
          accountIdentifier,
          snapshotDate: point.date
        });
      }
    }

    return {
      userId,
      days,
      snapshotsCreated: snapshotsCreated.length
    };
  }

  static async evaluateAlerts(userId, options = {}) {
    const preferences = await this.getPreferences(userId);
    if (!preferences.alertsEnabled) {
      return [];
    }

    const [rebalance, performance] = await Promise.all([
      this.getRebalancePlan(userId, options),
      this.getPerformance(userId, { ...options, period: '6M' })
    ]);

    const alerts = [];

    for (const position of rebalance.positions) {
      if (position.driftPercent === null || Math.abs(position.driftPercent) < preferences.driftThresholdPercent) {
        continue;
      }

      const direction = position.driftPercent > 0 ? 'above' : 'below';
      const message = `${position.symbol} drifted ${Math.abs(position.driftPercent).toFixed(2)}% ${direction} target allocation.`;
      const alertKey = `drift:${position.symbol}:${preferences.driftThresholdPercent}`;
      const created = await this._createPortfolioAlert(userId, alertKey, position.symbol, message, {
        alert_key: alertKey,
        category: 'allocation_drift',
        drift_percent: position.driftPercent,
        target_allocation_percent: position.normalizedTargetPercent,
        actual_allocation_percent: position.actualAllocationPercent
      });

      if (created) {
        alerts.push(created);
      }
    }

    if (performance.metrics.maxDrawdownPercent >= preferences.drawdownThresholdPercent) {
      const alertKey = `drawdown:${preferences.drawdownThresholdPercent}`;
      const message = `Portfolio drawdown reached ${performance.metrics.maxDrawdownPercent.toFixed(2)}% over the last 6 months.`;
      const created = await this._createPortfolioAlert(userId, alertKey, 'Portfolio', message, {
        alert_key: alertKey,
        category: 'drawdown',
        max_drawdown_percent: performance.metrics.maxDrawdownPercent,
        threshold_percent: preferences.drawdownThresholdPercent
      });

      if (created) {
        alerts.push(created);
      }
    }

    return alerts;
  }

  static async _createPortfolioAlert(userId, alertKey, symbol, message, metadata) {
    if (await notificationsTableExists()) {
      const existing = await db.query(
        `SELECT id
         FROM notifications
         WHERE user_id = $1
           AND type = 'portfolio_alert'
           AND data->>'alert_key' = $2
           AND created_at > NOW() - INTERVAL '1 day'
         LIMIT 1`,
        [userId, alertKey]
      );

      if (existing.rows.length > 0) {
        return null;
      }
    }

    const payload = {
      symbol,
      message,
      ...metadata
    };

    await NotificationService.sendSSENotification(userId, {
      type: 'portfolio_alert',
      data: payload,
      timestamp: new Date().toISOString()
    });
    await NotificationService.saveNotification(userId, 'portfolio_alert', payload);

    return payload;
  }

  static async _getRecentPortfolioAlerts(userId, limit = 5) {
    if (!await notificationsTableExists()) {
      return [];
    }

    const result = await db.query(
      `SELECT
         id,
         read,
         created_at,
         COALESCE(data->>'category', 'portfolio') AS category,
         COALESCE(data->>'symbol', 'Portfolio') AS symbol,
         COALESCE(data->>'message', 'Portfolio alert') AS message,
         data->>'drift_percent' AS drift_percent,
         data->>'max_drawdown_percent' AS max_drawdown_percent,
         data->>'threshold_percent' AS threshold_percent
       FROM notifications
       WHERE user_id = $1
         AND type = 'portfolio_alert'
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      isRead: row.read === true,
      createdAt: row.created_at,
      category: row.category,
      symbol: row.symbol,
      message: row.message,
      driftPercent: row.drift_percent !== null ? parseFloat(row.drift_percent) : null,
      maxDrawdownPercent: row.max_drawdown_percent !== null ? parseFloat(row.max_drawdown_percent) : null,
      thresholdPercent: row.threshold_percent !== null ? parseFloat(row.threshold_percent) : null
    }));
  }

  static async _upsertSnapshotRow(userId, accountIdentifier, snapshotDate, overview) {
    const normalizedAccount = accountIdentifier || null;
    const params = [
      userId,
      snapshotDate,
      round(overview.totalValue || 0) || 0,
      round(overview.totalCostBasis || 0) || 0,
      parseInt(overview.positionCount || 0, 10) || 0
    ];

    if (normalizedAccount === null) {
      await db.query(
        `INSERT INTO portfolio_snapshots (
           user_id,
           account_identifier,
           snapshot_date,
           portfolio_value,
           cost_basis,
           position_count,
           updated_at
         )
         VALUES ($1, NULL, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, snapshot_date) WHERE account_identifier IS NULL
         DO UPDATE SET
           portfolio_value = EXCLUDED.portfolio_value,
           cost_basis = EXCLUDED.cost_basis,
           position_count = EXCLUDED.position_count,
           updated_at = CURRENT_TIMESTAMP`,
        params
      );
      return;
    }

    await db.query(
      `INSERT INTO portfolio_snapshots (
         user_id,
         account_identifier,
         snapshot_date,
         portfolio_value,
         cost_basis,
         position_count,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, account_identifier, snapshot_date) WHERE account_identifier IS NOT NULL
       DO UPDATE SET
         portfolio_value = EXCLUDED.portfolio_value,
         cost_basis = EXCLUDED.cost_basis,
         position_count = EXCLUDED.position_count,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, normalizedAccount, snapshotDate, params[2], params[3], params[4]]
    );
  }

  static async _getTradeDividendsBySymbol(userId) {
    const result = await db.query(
      `SELECT
         symbol,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         MAX(payment_date) AS last_dividend_date
       FROM trade_dividends
       WHERE user_id = $1
       GROUP BY symbol`,
      [userId]
    );

    return result.rows.reduce((accumulator, row) => {
      accumulator[row.symbol] = {
        totalAmount: parseFloat(row.total_amount) || 0,
        lastDividendDate: row.last_dividend_date || null
      };
      return accumulator;
    }, {});
  }

  static async _getTargetsBySymbol(userId) {
    const map = new Map();
    if (!await portfolioTargetsTableExists()) {
      return map;
    }
    const result = await db.query(
      'SELECT symbol, target_allocation_percent FROM portfolio_targets WHERE user_id = $1',
      [userId]
    );
    for (const row of result.rows) {
      map.set(
        row.symbol,
        row.target_allocation_percent !== null ? parseFloat(row.target_allocation_percent) : null
      );
    }
    return map;
  }

  // Upsert (or clear, when percent is null/empty) the target allocation for a
  // symbol. Works for any position the user can see, not just manual holdings.
  static async setTarget(userId, symbol, targetAllocationPercent) {
    const normalizedSymbol = String(symbol || '').trim();
    if (!normalizedSymbol) {
      throw new Error('Symbol is required');
    }

    let percent = null;
    if (targetAllocationPercent !== null && targetAllocationPercent !== undefined && targetAllocationPercent !== '') {
      percent = parseFloat(targetAllocationPercent);
      if (Number.isNaN(percent) || percent < 0 || percent > 100) {
        throw new Error('Target allocation must be between 0 and 100');
      }
    }

    if (percent === null) {
      await db.query(
        'DELETE FROM portfolio_targets WHERE user_id = $1 AND symbol = $2',
        [userId, normalizedSymbol]
      );
    } else {
      await db.query(
        `INSERT INTO portfolio_targets (user_id, symbol, target_allocation_percent)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, symbol)
         DO UPDATE SET target_allocation_percent = EXCLUDED.target_allocation_percent, updated_at = NOW()`,
        [userId, normalizedSymbol, percent]
      );
    }

    // Keep the legacy holding column in sync so the holding detail view stays
    // consistent. No-op when the user has no holding row for this symbol.
    await db.query(
      'UPDATE investment_holdings SET target_allocation_percent = $3, updated_at = NOW() WHERE user_id = $1 AND symbol = $2',
      [userId, normalizedSymbol, percent]
    );

    return { symbol: normalizedSymbol, targetAllocationPercent: percent };
  }

  static async _getManualPositions(userId, accounts) {
    const params = [userId];
    const { clause } = buildAccountFilter('l.account_identifier', accounts, params, 2);
    const query = `
      SELECT
        h.id AS holding_id,
        h.symbol,
        h.notes,
        h.sector,
        h.target_allocation_percent,
        h.total_dividends_received,
        h.dividend_yield_on_cost,
        h.last_dividend_date,
        COALESCE(SUM(l.shares), 0) AS total_shares,
        COALESCE(SUM(l.total_cost), 0) AS total_cost_basis,
        CASE
          WHEN COALESCE(SUM(l.shares), 0) > 0 THEN COALESCE(SUM(l.total_cost), 0) / SUM(l.shares)
          ELSE NULL
        END AS average_cost_basis,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT l.account_identifier), NULL) AS account_identifiers,
        COUNT(l.id) AS lot_count,
        MIN(l.purchase_date) AS opened_at,
        BOOL_OR(l.source = 'plaid') AS has_plaid_lots
      FROM investment_holdings h
      JOIN investment_lots l
        ON l.holding_id = h.id
       AND l.user_id = h.user_id
      WHERE h.user_id = $1
      ${clause}
      GROUP BY
        h.id,
        h.symbol,
        h.notes,
        h.sector,
        h.target_allocation_percent,
        h.total_dividends_received,
        h.dividend_yield_on_cost,
        h.last_dividend_date
      HAVING COALESCE(SUM(l.shares), 0) > 0
    `;

    const result = await db.query(query, params);
    return result.rows.map(row => ({
      symbol: row.symbol,
      holdingId: row.holding_id,
      source: 'investment',
      notes: row.notes,
      sector: row.sector,
      targetAllocationPercent: row.target_allocation_percent !== null ? parseFloat(row.target_allocation_percent) : null,
      totalShares: parseFloat(row.total_shares) || 0,
      totalCostBasis: parseFloat(row.total_cost_basis) || 0,
      averageCostBasis: row.average_cost_basis !== null ? parseFloat(row.average_cost_basis) : null,
      totalDividendsReceived: parseFloat(row.total_dividends_received) || 0,
      dividendYieldOnCost: row.dividend_yield_on_cost !== null ? parseFloat(row.dividend_yield_on_cost) : null,
      lastDividendDate: row.last_dividend_date || null,
      accountIdentifiers: row.account_identifiers || [],
      lotCount: parseInt(row.lot_count, 10) || 0,
      openedAt: row.opened_at,
      hasPlaidLots: Boolean(row.has_plaid_lots)
    }));
  }

  static async _getTradePositions(userId, accounts) {
    const params = [userId];
    const { clause } = buildAccountFilter('t.account_identifier', accounts, params, 2);
    const query = `
      WITH trade_executions AS (
        SELECT
          t.id AS trade_id,
          t.symbol,
          t.side,
          t.quantity AS trade_quantity,
          t.entry_price,
          t.entry_time,
          t.account_identifier,
          t.broker,
          t.executions,
          t.instrument_type,
          t.contract_size,
          t.point_value,
          CASE
            WHEN t.instrument_type = 'future' THEN COALESCE(t.point_value, 1)
            WHEN t.instrument_type = 'option' THEN COALESCE(t.contract_size, 100)
            ELSE 1
          END AS cost_multiplier,
          COALESCE(
            (
              SELECT SUM(
                CASE
                  WHEN exec->>'entryPrice' IS NOT NULL OR exec->>'exitPrice' IS NOT NULL OR exec->>'entryTime' IS NOT NULL THEN
                    CASE
                      WHEN exec->>'exitPrice' IS NULL THEN
                        CASE WHEN t.side = 'long' THEN (exec->>'quantity')::numeric ELSE -(exec->>'quantity')::numeric END
                      ELSE 0
                    END
                  WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('buy', 'long') THEN (exec->>'quantity')::numeric
                  WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('sell', 'short') THEN -(exec->>'quantity')::numeric
                  ELSE 0
                END
              )
              FROM jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb)) AS exec
              WHERE exec->>'quantity' IS NOT NULL
            ),
            t.quantity
          ) AS net_position
        FROM trades t
        WHERE t.user_id = $1
          AND t.exit_price IS NULL
          AND t.side = 'long'
          ${clause}
      )
      SELECT
        symbol,
        COALESCE(SUM(net_position), 0) AS total_shares,
        COALESCE(SUM(net_position * COALESCE(entry_price, 0) * cost_multiplier), 0) AS total_cost_basis,
        CASE
          WHEN COALESCE(SUM(net_position), 0) > 0 THEN COALESCE(SUM(net_position * COALESCE(entry_price, 0) * cost_multiplier), 0) / SUM(net_position)
          ELSE NULL
        END AS average_cost_basis,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT account_identifier), NULL) AS account_identifiers,
        STRING_AGG(DISTINCT broker, ', ') AS brokers,
        COUNT(*) AS trade_count,
        MIN(entry_time) AS opened_at,
        MAX(instrument_type) AS instrument_type,
        MAX(contract_size) AS contract_size,
        MAX(point_value) AS point_value
      FROM trade_executions
      GROUP BY symbol
      HAVING COALESCE(SUM(net_position), 0) > 0
    `;

    const result = await db.query(query, params);
    return result.rows.map(row => ({
      symbol: row.symbol,
      holdingId: null,
      source: 'trades',
      notes: null,
      sector: null,
      targetAllocationPercent: null,
      totalShares: parseFloat(row.total_shares) || 0,
      totalCostBasis: parseFloat(row.total_cost_basis) || 0,
      averageCostBasis: row.average_cost_basis !== null ? parseFloat(row.average_cost_basis) : null,
      totalDividendsReceived: 0,
      dividendYieldOnCost: null,
      lastDividendDate: null,
      accountIdentifiers: row.account_identifiers || [],
      lotCount: parseInt(row.trade_count, 10) || 0,
      openedAt: row.opened_at,
      brokers: row.brokers,
      instrumentType: row.instrument_type || 'stock',
      contractSize: row.contract_size !== null ? parseFloat(row.contract_size) : null,
      pointValue: row.point_value !== null ? parseFloat(row.point_value) : null
    }));
  }

  static _mergePositions(manualPositions, tradePositions, tradeDividendsBySymbol) {
    const bySymbol = new Map();

    const upsert = (position) => {
      const existing = bySymbol.get(position.symbol);
      if (!existing) {
        bySymbol.set(position.symbol, {
          ...position,
          accountIdentifiers: [...new Set(position.accountIdentifiers || [])],
          instrumentType: position.instrumentType || 'stock',
          contractSize: position.contractSize || null,
          pointValue: position.pointValue || null
        });
        return;
      }

      existing.totalShares += position.totalShares;
      existing.totalCostBasis += position.totalCostBasis;
      existing.averageCostBasis = existing.totalShares > 0
        ? existing.totalCostBasis / existing.totalShares
        : null;
      existing.totalDividendsReceived += position.totalDividendsReceived || 0;
      existing.dividendYieldOnCost = existing.totalCostBasis > 0
        ? (existing.totalDividendsReceived / existing.totalCostBasis) * 100
        : null;
      existing.accountIdentifiers = [...new Set([...(existing.accountIdentifiers || []), ...(position.accountIdentifiers || [])])];
      existing.lotCount += position.lotCount || 0;
      existing.openedAt = [existing.openedAt, position.openedAt].filter(Boolean).sort()[0] || existing.openedAt;
      existing.source = existing.source === position.source ? existing.source : 'mixed';
      existing.brokers = [existing.brokers, position.brokers].filter(Boolean).join(', ') || null;
      existing.includesOpenTrades = existing.includesOpenTrades || position.source === 'trades';
      existing.hasPlaidLots = existing.hasPlaidLots || Boolean(position.hasPlaidLots);

      if (!existing.holdingId && position.holdingId) {
        existing.holdingId = position.holdingId;
      }
      if (!existing.sector && position.sector) {
        existing.sector = position.sector;
      }
      if (existing.targetAllocationPercent === null && position.targetAllocationPercent !== null) {
        existing.targetAllocationPercent = position.targetAllocationPercent;
      }
    };

    for (const manualPosition of manualPositions) {
      upsert({
        ...manualPosition,
        includesOpenTrades: false
      });
    }

    for (const tradePosition of tradePositions) {
      const dividendData = tradeDividendsBySymbol[tradePosition.symbol];
      upsert({
        ...tradePosition,
        totalDividendsReceived: (tradePosition.totalDividendsReceived || 0) + (dividendData?.totalAmount || 0),
        lastDividendDate: dividendData?.lastDividendDate || tradePosition.lastDividendDate,
        dividendYieldOnCost: tradePosition.totalCostBasis > 0 && dividendData?.totalAmount
          ? (dividendData.totalAmount / tradePosition.totalCostBasis) * 100
          : tradePosition.dividendYieldOnCost,
        includesOpenTrades: true
      });
    }

    return Array.from(bySymbol.values());
  }

  // Applies cached prices to positions WITHOUT blocking on the market-data
  // API. We read whatever is already in price_monitoring (regardless of age)
  // so the page can render immediately, flag any position whose quote is
  // missing or stale, and kick off a non-blocking background refresh for those
  // symbols. The frontend polls afterward to stream in the updated prices.
  // This is what keeps the Holdings tab fast even for large portfolios that
  // would otherwise serialize behind Finnhub's rate limit.
  static async _applyCurrentPrices(userId, positions) {
    if (!positions || positions.length === 0) {
      return;
    }

    const symbols = [...new Set(positions.map(position => position.symbol))];
    const cacheResult = await db.query(
      `SELECT symbol, current_price, last_updated
       FROM price_monitoring
       WHERE symbol = ANY($1)`,
      [symbols]
    );

    const now = Date.now();
    const cachedPrices = new Map();
    for (const row of cacheResult.rows) {
      const price = parseFloat(row.current_price);
      cachedPrices.set(row.symbol, {
        price: Number.isFinite(price) ? price : null,
        updatedAt: row.last_updated ? new Date(row.last_updated) : null
      });
    }

    const symbolsNeedingRefresh = new Set();

    for (const position of positions) {
      const cached = cachedPrices.get(position.symbol);
      const currentPrice = cached && cached.price !== null ? cached.price : null;
      const ageMs = cached?.updatedAt ? now - cached.updatedAt.getTime() : Infinity;
      const priceStale = currentPrice === null || ageMs > PRICE_FRESH_MS;

      if (priceStale) {
        symbolsNeedingRefresh.add(position.symbol);
      }

      const valueMultiplier = position.source === 'trades'
        ? (position.instrumentType === 'future'
          ? (position.pointValue || 1)
          : (position.instrumentType === 'option'
            ? (position.contractSize || 100)
            : 1))
        : 1;

      position.currentPrice = currentPrice;
      position.currentValue = currentPrice !== null
        ? position.totalShares * currentPrice * valueMultiplier
        : null;
      position.unrealizedPnL = position.currentValue !== null
        ? position.currentValue - position.totalCostBasis
        : null;
      position.unrealizedPnLPercent = position.currentValue !== null && position.totalCostBasis > 0
        ? (position.unrealizedPnL / position.totalCostBasis) * 100
        : null;
      position.dividendYieldOnCost = position.totalCostBasis > 0 && position.totalDividendsReceived > 0
        ? (position.totalDividendsReceived / position.totalCostBasis) * 100
        : position.dividendYieldOnCost;
      position.priceAsOf = cached?.updatedAt ? cached.updatedAt.toISOString() : null;
      position.priceStale = priceStale;
    }

    // Fire-and-forget: refresh stale/missing quotes in the background and let
    // the client poll for the results. Intentionally NOT awaited.
    if (symbolsNeedingRefresh.size > 0) {
      this._refreshPricesInBackground([...symbolsNeedingRefresh]);
    }
  }

  // Fetches fresh quotes for the given symbols off the request path and writes
  // them to price_monitoring. Deduplicated via inFlightPriceSymbols so the
  // several endpoints that load on the Holdings tab don't fetch the same
  // symbol multiple times concurrently. Chunked to respect the API rate limit.
  static _refreshPricesInBackground(symbols) {
    const toFetch = symbols.filter(symbol => !inFlightPriceSymbols.has(symbol));
    if (toFetch.length === 0) {
      return;
    }

    toFetch.forEach(symbol => inFlightPriceSymbols.add(symbol));

    // Detach from the caller so the HTTP response returns immediately.
    (async () => {
      // Lazy require avoids a circular dependency at module load time.
      const priceMonitoringService = require('./priceMonitoringService');
      const chunkSize = finnhub.maxCallsPerSecond || 1;

      try {
        for (let i = 0; i < toFetch.length; i += chunkSize) {
          const chunk = toFetch.slice(i, i + chunkSize);
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1050));
          }
          await Promise.allSettled(
            chunk.map(symbol => priceMonitoringService.updateSymbolPrice(symbol))
          );
        }
      } catch (error) {
        console.error(`[PORTFOLIO] Background price refresh failed: ${error.message}`);
      } finally {
        toFetch.forEach(symbol => inFlightPriceSymbols.delete(symbol));
      }
    })();
  }

  static _buildTotals(positions) {
    const totals = positions.reduce((accumulator, position) => {
      accumulator.totalValue += position.currentValue || 0;
      accumulator.totalCostBasis += position.totalCostBasis || 0;
      accumulator.totalDividends += position.totalDividendsReceived || 0;
      if (position.targetAllocationPercent !== null && position.targetAllocationPercent !== undefined) {
        accumulator.targetedValue += position.currentValue || 0;
      }
      return accumulator;
    }, {
      totalValue: 0,
      totalCostBasis: 0,
      totalDividends: 0,
      targetedValue: 0
    });

    totals.unrealizedPnL = totals.totalValue - totals.totalCostBasis;
    totals.unrealizedPnLPercent = totals.totalCostBasis > 0
      ? (totals.unrealizedPnL / totals.totalCostBasis) * 100
      : 0;
    totals.totalReturn = totals.unrealizedPnL + totals.totalDividends;
    totals.totalReturnPercent = totals.totalCostBasis > 0
      ? (totals.totalReturn / totals.totalCostBasis) * 100
      : 0;
    totals.targetCoveragePercent = totals.totalValue > 0
      ? (totals.targetedValue / totals.totalValue) * 100
      : 0;

    return totals;
  }

  static async _getPositionComponents(userId, accounts) {
    const [lotComponents, tradeComponents] = await Promise.all([
      this._getLotComponents(userId, accounts),
      this._getOpenTradeComponents(userId, accounts)
    ]);

    return [...lotComponents, ...tradeComponents].sort((left, right) => {
      return this._normalizeDateValue(left.effectiveDate).localeCompare(
        this._normalizeDateValue(right.effectiveDate)
      );
    });
  }

  static async _getLotComponents(userId, accounts) {
    const params = [userId];
    const { clause } = buildAccountFilter('l.account_identifier', accounts, params, 2);
    const result = await db.query(
      `SELECT
         h.symbol,
         l.shares,
         l.purchase_date
       FROM investment_lots l
       JOIN investment_holdings h
         ON h.id = l.holding_id
       WHERE l.user_id = $1
       ${clause}`,
      params
    );

    return result.rows.map(row => ({
      symbol: row.symbol,
      shares: parseFloat(row.shares) || 0,
      effectiveDate: this._normalizeDateValue(row.purchase_date),
      valueMultiplier: 1
    }));
  }

  static async _getOpenTradeComponents(userId, accounts) {
    const params = [userId];
    const { clause } = buildAccountFilter('t.account_identifier', accounts, params, 2);
    const result = await db.query(
      `WITH trade_executions AS (
         SELECT
           t.symbol,
           t.entry_time,
           t.instrument_type,
           t.contract_size,
           t.point_value,
           COALESCE(
             (
               SELECT SUM(
                 CASE
                   WHEN exec->>'entryPrice' IS NOT NULL OR exec->>'exitPrice' IS NOT NULL OR exec->>'entryTime' IS NOT NULL THEN
                     CASE
                       WHEN exec->>'exitPrice' IS NULL THEN
                         CASE WHEN t.side = 'long' THEN (exec->>'quantity')::numeric ELSE -(exec->>'quantity')::numeric END
                       ELSE 0
                     END
                   WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('buy', 'long') THEN (exec->>'quantity')::numeric
                   WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('sell', 'short') THEN -(exec->>'quantity')::numeric
                   ELSE 0
                 END
               )
               FROM jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb)) AS exec
               WHERE exec->>'quantity' IS NOT NULL
             ),
             t.quantity
           ) AS net_position
         FROM trades t
         WHERE t.user_id = $1
           AND t.exit_price IS NULL
           AND t.side = 'long'
           ${clause}
       )
       SELECT *
       FROM trade_executions
       WHERE net_position > 0`,
      params
    );

    return result.rows.map(row => ({
      symbol: row.symbol,
      shares: parseFloat(row.net_position) || 0,
      effectiveDate: this._normalizeDateValue(row.entry_time),
      valueMultiplier: row.instrument_type === 'future'
        ? (parseFloat(row.point_value) || 1)
        : row.instrument_type === 'option'
          ? (parseFloat(row.contract_size) || 100)
          : 1
    }));
  }

  static async _getPriceSeriesMap(symbols, startDate, endDate, userId) {
    const entries = await Promise.all(
      symbols.map(async symbol => {
        const candles = await this._getDailySeries(symbol, startDate, endDate, userId);
        return [symbol, candles];
      })
    );

    return new Map(entries);
  }

  static async _getDailySeries(symbol, startDate, endDate, userId) {
    const cachedCandles = await historicalPriceCache.getRange(symbol, startDate, endDate);
    if (cachedCandles.length > 0 && await historicalPriceCache.hasRange(symbol, startDate, endDate)) {
      return cachedCandles;
    }

    if (alphaVantage.isConfigured()) {
      try {
        const candles = await alphaVantage.getDailyData(symbol, 'compact');
        return candles.filter(candle => {
          const date = this._toDateString(candle.time);
          return date >= startDate && date <= endDate;
        });
      } catch (error) {
        // Fall through to configured market data provider.
      }
    }

    try {
      const from = Math.floor(new Date(`${startDate}T00:00:00.000Z`).getTime() / 1000);
      const to = Math.floor(new Date(`${endDate}T23:59:59.999Z`).getTime() / 1000);
      const candles = await finnhub.getStockCandles(symbol, 'D', from, to, userId);
      await historicalPriceCache.insertCandles(symbol, candles, finnhub.providerName || 'finnhub');
      return candles;
    } catch (error) {
      return [];
    }
  }

  static _buildDateUnion(priceSeriesMap) {
    const dates = new Set();
    for (const candles of priceSeriesMap.values()) {
      for (const candle of candles) {
        dates.add(this._toDateString(candle.time));
      }
    }
    return [...dates].sort();
  }

  static _buildSeriesIndex(candles) {
    const sorted = [...candles].sort((left, right) => left.time - right.time);
    return {
      candles: sorted,
      pointer: 0,
      lastClose: null
    };
  }

  static _getIndexedClose(indexedSeries, date) {
    if (!indexedSeries) {
      return null;
    }

    const targetTime = new Date(`${date}T00:00:00.000Z`).getTime() / 1000;
    while (indexedSeries.pointer < indexedSeries.candles.length && indexedSeries.candles[indexedSeries.pointer].time <= targetTime) {
      indexedSeries.lastClose = indexedSeries.candles[indexedSeries.pointer].close;
      indexedSeries.pointer += 1;
    }

    return indexedSeries.lastClose;
  }

  static _normalizeDateValue(value) {
    if (!value) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    if (typeof value === 'number') {
      return this._toDateString(value);
    }

    if (typeof value === 'string') {
      return value.includes('T') ? value.split('T')[0] : value;
    }

    return String(value);
  }

  static _toDateString(unixTime) {
    return new Date(unixTime * 1000).toISOString().split('T')[0];
  }
}

module.exports = PortfolioService;

/**
 * Performance score: one 0-100 number summarising the quality of a trader's
 * results over the filtered period, built only from figures the analytics
 * summary already calculates. Pure and dependency-free so it can be attached
 * to cached analytics payloads at response time.
 *
 * Every input is a ratio, so the score is independent of account size and of
 * the display currency.
 */

// Closed trades needed before a score is shown. Below this the ratios swing
// too much on a single trade to mean anything.
const MIN_TRADES = 20;

// Trading days needed before the profitable-day share counts as a factor.
const MIN_DAYS_FOR_CONSISTENCY = 5;

// Each factor maps its raw value onto 0-100 through these [value, score]
// anchor points (linear between anchors, clamped at the ends).
const FACTORS = [
  {
    key: 'profitFactor',
    label: 'Profit factor',
    description: 'Gross profit divided by gross loss.',
    weight: 25,
    curve: [[0.5, 0], [1, 35], [1.5, 65], [2, 82], [3, 100]]
  },
  {
    key: 'expectancy',
    label: 'Expectancy',
    description: 'Average result per trade, measured in units of your average loss.',
    weight: 20,
    curve: [[-0.25, 0], [0, 40], [0.25, 70], [0.6, 100]]
  },
  {
    key: 'drawdown',
    label: 'Drawdown control',
    description: 'Net profit divided by your largest drawdown.',
    weight: 20,
    curve: [[0, 0], [1, 40], [3, 75], [6, 100]]
  },
  {
    key: 'consistency',
    label: 'Consistency',
    description: 'Share of trading days that finished positive.',
    weight: 15,
    curve: [[30, 0], [50, 50], [65, 85], [75, 100]]
  },
  {
    key: 'winRate',
    label: 'Win rate',
    description: 'Winning trades as a share of winners and losers.',
    weight: 10,
    curve: [[25, 0], [40, 45], [50, 65], [60, 85], [70, 100]]
  },
  {
    key: 'riskAdjusted',
    label: 'Risk-adjusted return',
    description: 'Average trade result divided by how much your results vary.',
    weight: 10,
    curve: [[-0.1, 0], [0, 25], [0.1, 55], [0.25, 85], [0.4, 100]]
  }
];

const BANDS = [
  { min: 80, key: 'strong', label: 'Strong' },
  { min: 65, key: 'solid', label: 'Solid' },
  { min: 50, key: 'developing', label: 'Developing' },
  { min: 35, key: 'fragile', label: 'Fragile' },
  { min: 0, key: 'weak', label: 'Weak' }
];

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function interpolate(curve, value) {
  if (value <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (value <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * Raw value per factor, or null when the period has no basis for it. A null
 * factor is left out and the remaining weights are rescaled.
 */
function rawFactorValues(summary, dailyPnL) {
  const wins = num(summary.winningTrades);
  const losses = num(summary.losingTrades);
  const decided = wins + losses;
  const avgWin = Math.abs(num(summary.avgWin));
  const avgLoss = Math.abs(num(summary.avgLoss));
  const netPnL = num(summary.totalNetPnL ?? summary.totalPnL);
  const maxDrawdown = Math.abs(num(summary.maxDrawdown));

  const values = {
    profitFactor: decided > 0 ? num(summary.profitFactor) : null,
    expectancy: null,
    drawdown: null,
    consistency: null,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    riskAdjusted: decided > 0 ? num(summary.sharpeRatio) : null
  };

  if (decided > 0) {
    const winShare = wins / decided;
    if (avgLoss > 0) {
      values.expectancy = winShare * (avgWin / avgLoss) - (1 - winShare);
    } else if (losses === 0 && wins > 0) {
      // No losing trades: there is no average loss to measure against.
      values.expectancy = Infinity;
    }
  }

  if (maxDrawdown > 0) {
    values.drawdown = netPnL / maxDrawdown;
  } else if (netPnL > 0) {
    // Profitable with no drawdown recorded.
    values.drawdown = Infinity;
  } else {
    values.drawdown = 0;
  }

  const days = (Array.isArray(dailyPnL) ? dailyPnL : [])
    .map((row) => num(row?.daily_pnl ?? row?.dailyPnl ?? row?.pnl))
    .filter((pnl) => pnl !== 0);
  if (days.length >= MIN_DAYS_FOR_CONSISTENCY) {
    values.consistency = (days.filter((pnl) => pnl > 0).length / days.length) * 100;
  }

  return values;
}

function bandFor(score) {
  return BANDS.find((band) => score >= band.min) || BANDS[BANDS.length - 1];
}

/**
 * @param {{summary?: object, dailyPnL?: Array}} analytics - the /trades/analytics payload
 * @returns {{ready: boolean, score: number|null, band: string|null, bandLabel: string|null,
 *   tradesCounted: number, minTrades: number, factors: Array}}
 */
function computePerformanceScore(analytics) {
  const summary = analytics?.summary || {};
  const tradesCounted = num(summary.winningTrades) + num(summary.losingTrades) + num(summary.breakevenTrades);
  const base = { ready: false, score: null, band: null, bandLabel: null, tradesCounted, minTrades: MIN_TRADES, factors: [] };

  if (tradesCounted < MIN_TRADES) return base;

  const raw = rawFactorValues(summary, analytics?.dailyPnL);
  const scored = FACTORS
    .filter((factor) => raw[factor.key] !== null && raw[factor.key] !== undefined)
    .map((factor) => ({
      key: factor.key,
      label: factor.label,
      description: factor.description,
      weight: factor.weight,
      // Infinity (no losses, no drawdown) is not valid JSON; the score still
      // reflects it, the raw value is reported as null.
      value: Number.isFinite(raw[factor.key]) ? Math.round(raw[factor.key] * 100) / 100 : null,
      score: Math.round(interpolate(factor.curve, raw[factor.key]))
    }));

  const totalWeight = scored.reduce((sum, factor) => sum + factor.weight, 0);
  if (totalWeight === 0) return base;

  const score = Math.round(scored.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight);
  const band = bandFor(score);

  return { ...base, ready: true, score, band: band.key, bandLabel: band.label, factors: scored };
}

module.exports = { computePerformanceScore, MIN_TRADES, FACTORS };

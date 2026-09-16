const User = require('../models/User');
const currencyConverter = require('./currencyConverter');

/**
 * Shared helpers for converting monetary API values from a source currency
 * (company reporting currency, symbol trading currency, ...) to the user's
 * configured display currency. Rates come from the daily FX store
 * (fx_daily_rates), so at most one FX API call per day per base currency.
 */

async function resolveDisplayCurrency(userId) {
  try {
    const settings = await User.getSettings(userId);
    return (settings?.display_currency || 'USD').toUpperCase();
  } catch (error) {
    console.warn(`[CURRENCY] Could not read display currency, assuming USD: ${error.message}`);
    return 'USD';
  }
}

/**
 * Build a source-currency -> display-currency rate map.
 * A null rate means no conversion is possible; callers must leave those
 * rows in their source currency and report the effective currency instead
 * of fabricating a converted value.
 * @param {Iterable<string>} sourceCurrencies
 * @param {string} displayCurrency
 * @returns {Promise<Object<string, number|null>>}
 */
async function getRatesToDisplay(sourceCurrencies, displayCurrency) {
  const rates = {};
  for (const currency of new Set([...sourceCurrencies].filter(Boolean).map(c => String(c).toUpperCase()))) {
    if (currency === displayCurrency) {
      rates[currency] = 1;
      continue;
    }
    try {
      rates[currency] = await currencyConverter.getDailyCrossRate(currency, displayCurrency);
    } catch (error) {
      console.warn(`[CURRENCY] No ${currency}/${displayCurrency} rate: ${error.message}`);
      rates[currency] = null;
    }
  }
  return rates;
}

/**
 * Multiply the listed monetary keys of an object by a rate (in place-safe:
 * returns the same object mutated, or a converted copy when copy=true).
 * Values are only scaled when finite numbers; share counts and ratios must
 * not be included in moneyKeys.
 */
function scaleMoneyFields(target, rate, moneyKeys, { copy = false } = {}) {
  const out = copy ? { ...target } : target;
  if (!Number.isFinite(rate) || rate === 1 || !target) return out;
  for (const key of moneyKeys) {
    const value = target[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value * rate;
    }
  }
  return out;
}

/**
 * Monetary fields on standardized financial periods (reporting currency).
 * Share counts and ratios must never appear here - scaling them would
 * corrupt derived per-share math.
 */
const FINANCIAL_MONEY_KEYS = [
  'revenue', 'costOfRevenue', 'grossProfit', 'operatingExpenses', 'operatingIncome',
  'incomeBeforeTax', 'incomeTaxExpense', 'ebit', 'ebitda', 'interestExpense',
  'netIncome', 'eps',
  'totalAssets', 'cashAndEquivalents', 'currentAssets', 'totalLiabilities',
  'currentLiabilities', 'longTermDebt', 'shortTermDebt', 'totalDebt', 'totalEquity',
  'retainedEarnings', 'accountsPayable',
  'freeCashFlow', 'operatingCashFlow', 'capitalExpenditures', 'dividendsPaid',
  'depreciationAmortization', 'investingCashFlow', 'financingCashFlow', 'stockRepurchases'
];

/**
 * Money-key detection for the trades domain. Everything stored/aggregated
 * by the trades subsystem is USD-normalized at import (see
 * convertTradeToUSD), so a single USD->display rate scales every monetary
 * value consistently across lists, detail views and analytics aggregates.
 * Counts/ratios (r_value, win_rate, quantity, pl_ratio, ...), share/contract
 * quantities and time durations are preserved.
 */

// Keys that share money names but are counts/ratios/time/contract specs -
// never scaled. point_value/tick_size/contract_size are multipliers applied
// to prices: scaling them alongside prices would double-convert (a $50 move
// at 0.8 becoming $32 instead of $40).
const TRADE_MONEY_NONAMES = /(^r_|_r$|r_value|percent|_pct|_rate$|rate_|ratio|_count$|^count$|quantity|volume|shares|streak|minutes|hours|days|periods|score|_size|^size$|ticks?$|confidence|_id$|^id$|^trades$|^wins$|^losses$|^breakeven$|^win_rate$|^winrate$|profit_factor|sharpe|drawdown_duration|point_value|contract_multiplier|multiplier)/i;

// Exact money names the suffix heuristics below would miss. NOTE: bare
// `value` is deliberately excluded - chart series sometimes use {x,value}
// for counts, so endpoints needing it must scale it explicitly.
const TRADE_MONEY_EXACT = new Set([
  'pnl', 'price', 'cost', 'cost_basis', 'fee', 'fees', 'commission', 'commissions',
  'equity', 'amount', 'mae', 'mfe', 'strike', 'market_value', 'marketValue',
  'bestTrade', 'worstTrade', 'avgWin', 'avgLoss', 'avg_win', 'avg_loss',
  'best_trade', 'worst_trade', 'stop_loss', 'take_profit', 'takeProfit', 'stopLoss',
  'max_drawdown', 'maxDrawdown', 'current_drawdown', 'today_pnl', 'todayPnl',
  'maxDailyGain', 'maxDailyLoss', 'max_daily_gain', 'max_daily_loss',
  'pnl_std_dev', 'avg_per_share_pnl', 'avg_win_per_trade', 'avg_loss_per_trade',
  'dividends', 'dividends_earned', 'net_sales_proceeds', 'net_purchase_cost',
  'expectancy', 'netAmount', 'tradeValue', 'positionValue', 'unrealizedPnl',
  'totalCosts', 'total_costs', 'total_commissions', 'total_fees', 'gross', 'net',
  'entry_price', 'exit_price', 'entryPrice', 'exitPrice', 'netPnl', 'grossPnl',
  'realizedPnl', 'notional',
  // candlestick OHLC (chart payloads) - never appears with another meaning
  // in trades-domain responses, and price axis must scale with the markers
  'open', 'high', 'low', 'close'
]);

function isTradeMoneyKey(key, parentKey) {
  const k = String(key);
  if (TRADE_MONEY_NONAMES.test(k)) return false;
  if (TRADE_MONEY_EXACT.has(k)) return true;
  if (parentKey === 'pnl' || parentKey === 'totals') return true;
  if (/(^|_)pnl($|_)|PnL|pnl$/.test(k)) return true;            // avg_daily_pnl, total_pnl...
  if (/(_|^)price(s)?$/i.test(k) || /price_per|per_share_price/i.test(k)) return true;
  if (/(_|^)(cost|costs|commission|commissions|fee|fees)$/i.test(k)) return true;
  if (/(_|^)(amount|drawdown|profit|loss)$/i.test(k) || /_value$/i.test(k)) return true;
  if (/(_|^)(mae|mfe)$/i.test(k)) return true;                  // avg_mae, post_exit_mfe...
  if (/profit_left|missed_after/i.test(k)) return true;        // $ profit left on the table
  if (/cumulative_?(pnl|profit|equity)/i.test(k)) return true;
  return false;
}

/**
 * Currency symbol for a code ('USD' -> '$'), falling back to the code itself
 * when the runtime has no symbol for it.
 */
function currencySymbolFor(code) {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code })
      .formatToParts(0);
    return parts.find(part => part.type === 'currency')?.value || code;
  } catch {
    return code;
  }
}

// Bucket labels carry their boundaries as text ('$5-9.99', '$1K-$2K'). Only
// the first bound usually wears the symbol, so a label is treated as monetary
// as a whole and every number in it is converted.
const LABEL_NUMBER_PATTERN = /(\d+(?:\.\d+)?)\s?([KMB])?/g;
const LABEL_MAGNITUDES = { K: 1e3, M: 1e6, B: 1e9 };

function formatLabelAmount(value) {
  const abs = Math.abs(value);
  const trim = (n) => String(Number(n.toFixed(2)));
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  return trim(value);
}

/**
 * Rewrite the amounts inside one bucket label. The buckets are defined by USD
 * thresholds in SQL, so a reader in another currency needs those same
 * boundaries expressed in their units - otherwise a chart pairs converted
 * bars with dollar axis labels. Labels with no currency marker (share-count
 * and hold-time buckets) are returned untouched.
 */
function scaleMoneyLabel(label, rate, symbol) {
  if (typeof label !== 'string' || !label.includes('$')) return label;
  if (!Number.isFinite(rate) || rate === 1) return label;

  const converted = label.replace(LABEL_NUMBER_PATTERN, (match, digits, suffix) => {
    const value = Number(digits) * (LABEL_MAGNITUDES[suffix] || 1) * rate;
    return Number.isFinite(value) ? formatLabelAmount(value) : match;
  });
  return converted.split('$').join(symbol);
}

/**
 * Deep-walk an API payload and multiply every money field by rate. Field
 * names follow the trades-domain USD naming conventions; counts, ratios
 * (R-multiples, win rates, percentages), share/contract quantities,
 * contract multipliers and time durations are preserved.
 *
 * options.rateFor(row): per-row currency resolver. Objects carrying an
 * `original_currency` field alongside money fields are stored trade rows;
 * rateFor returns { rate, currency } - the rate that scales the row AND its
 * nested objects (executions etc. share the parent's currency), and the
 * currency the numbers are in (written to node.effective_currency). Native
 * rows must convert from their own currency, not from USD.
 * options.relabel: display currency written over `currency` fields when a
 * row's rate differs from 1.
 * options.moneyArrayKeys: explicit keys whose primitive arrays are monetary.
 * options.skipKeys: object keys (with their subtrees) never scaled here -
 * callers that need a different source currency (chart candles) handle them.
 */
function scaleMoneyInPayload(payload, rate, { maxDepth = 10, rateFor = null, relabel = null, moneyArrayKeys = null, moneyLabelKeys = null, labelSymbol = '$', skipKeys = null } = {}) {
  if (!Number.isFinite(rate) || (rate === 1 && typeof rateFor !== 'function') || payload === null || typeof payload !== 'object') {
    return payload;
  }

  const scaleNumberString = (value, mult) => {
    const decimals = (String(value).split('.')[1] || '').length;
    const scaled = Number(value) * mult;
    return Number.isFinite(scaled) ? scaled.toFixed(decimals) : value;
  };

  const scaleNumeric = (value, mult) => (typeof value === 'number' && Number.isFinite(value) ? value * mult : null);

  const scaleList = (arr, mult) => {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v === 'number' && Number.isFinite(v)) arr[i] = v * mult;
      else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) arr[i] = Number(scaleNumberString(v, mult));
    }
  };

  const walk = (node, parentKey, depth, inherited) => {
    if (depth > maxDepth || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      // Arrays of primitives (chart series) scale under a money-named key,
      // handled by the parent; nested object/array members keep walking.
      for (const item of node) {
        if (item !== null && typeof item === 'object') walk(item, parentKey, depth + 1, inherited);
      }
      return;
    }

    // Row-level currency override for stored trade rows. Children inherit the
    // resolved rate - nested executions are denominated like their trade.
    let effRate = inherited ?? rate;
    if (typeof rateFor === 'function') {
      const orig = node.original_currency ?? node.originalCurrency;
      const hasMoneyMeta = node.pnl !== undefined || node.entry_price !== undefined
        || node.entryPrice !== undefined || node.trade_pnl !== undefined;
      if (orig !== undefined && hasMoneyMeta) {
        const resolved = rateFor(node);
        if (resolved && Number.isFinite(resolved.rate)) {
          effRate = resolved.rate;
        } else {
          effRate = 1; // no rate for this base: numbers stay native...
        }
        const label = (resolved && resolved.currency) ? resolved.currency : null;
        if (label) {
          node.effective_currency = label;
          if (relabel && effRate !== 1) {
            if (typeof node.currency === 'string' && node.currency) node.currency = relabel;
            if (typeof node.display_currency === 'string' && node.display_currency) node.display_currency = relabel;
          }
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (skipKeys && skipKeys.has(key) && value !== null && typeof value === 'object') continue;
      const isMoney = isTradeMoneyKey(key, parentKey);
      const direct = scaleNumeric(value, effRate);
      if (direct !== null) {
        if (isMoney) node[key] = direct;
        continue;
      }
      if (typeof value === 'string' && isMoney && /^-?\d+(\.\d+)?$/.test(value)) {
        // pg NUMERIC columns arrive as strings ("13.850000") - keep the shape
        node[key] = scaleNumberString(value, effRate);
        continue;
      }
      if (moneyLabelKeys && moneyLabelKeys.has(key) && effRate !== 1) {
        if (typeof value === 'string') {
          node[key] = scaleMoneyLabel(value, effRate, labelSymbol);
          continue;
        }
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
          node[key] = value.map(item => scaleMoneyLabel(item, effRate, labelSymbol));
          continue;
        }
      }
      const explicitArray = moneyArrayKeys && moneyArrayKeys.has(key);
      if (Array.isArray(value) && (isMoney || explicitArray) && value.length > 0
          && value.every((v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)))) {
        // Monetary series (USD-normalized at the SQL base layer). Endpoints
        // whose dollar arrays carry non-money names (e.g. performanceByVolume
        // holding P&L) opt in via moneyArrayKeys; counts/R-value siblings
        // deliberately are not in that set.
        scaleList(value, effRate);
        continue;
      }
      if (value !== null && typeof value === 'object') {
        walk(value, key, depth + 1, effRate);
      }
    }
  };

  walk(payload, '', 0, null);
  return payload;
}

/**
 * Controller-boundary helper: scale a USD-base response payload to the
 * requesting user's display currency and label it. Clone cached payloads
 * before scaling - shared cache objects must stay in USD.
 *
 * rowCurrency:true additionally honors per-row base currencies: stored trade
 * rows that were never converted to USD (native EUR manual trades) scale by
 * their own currency's rate instead of the USD rate, and their `currency`
 * metadata is relabeled to the effective display currency.
 * @returns {Promise<object>} the (possibly cloned) payload with display_currency set
 */
async function convertForDisplay(req, payload, { clone = true, raw = false, skip = false, rowCurrency = false, moneyArrayKeys = null, moneyLabelKeys = null, skipKeys = null } = {}) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return payload;
  }
  if (raw || skip) {
    // Edit-form prefill: return exactly the stored numbers so an edited
    // value round-trips back to storage unchanged.
    payload.display_currency = 'USD';
    return payload;
  }
  const displayCurrency = await resolveDisplayCurrency(req.user.id);
  if (displayCurrency === 'USD' && !rowCurrency) {
    payload.display_currency = 'USD';
    return payload;
  }
  const rates = await getRatesToDisplay(['USD'], displayCurrency);
  const rate = rates.USD;
  if (!rate && !rowCurrency) {
    // No rate available: keep USD base and label it honestly.
    payload.display_currency = 'USD';
    return payload;
  }
  let out = payload;
  if (clone) {
    try {
      out = structuredClone(payload);
    } catch {
      out = JSON.parse(JSON.stringify(payload));
    }
  }

  let rateFor = null;
  let relabel = null;
  if (rowCurrency) {
    const { tradeBaseCurrency } = require('./tradeFx');
    const baseRateCache = new Map([[displayCurrency, 1], ['USD', rate]]);
    relabel = displayCurrency;

    // Prefetch every base currency present in the payload (rows are rare in
    // non-USD; this loop normally finds USD only and costs nothing).
    const bases = new Set();
    const collect = (node, depth) => {
      if (node === null || typeof node !== 'object' || depth > 8) return;
      if (Array.isArray(node)) { node.forEach(n => collect(n, depth + 1)); return; }
      const orig = node.original_currency ?? node.originalCurrency;
      if (orig !== undefined && (node.pnl !== undefined || node.entry_price !== undefined || node.entryPrice !== undefined)) {
        bases.add(String(orig || 'USD').toUpperCase());
      }
      for (const v of Object.values(node)) collect(v, depth + 1);
    };
    collect(out, 0);
    bases.delete('USD');
    bases.delete(displayCurrency);
    if (bases.size > 0) {
      const extra = await getRatesToDisplay([...bases], displayCurrency);
      for (const [ccy, r] of Object.entries(extra)) {
        if (r) baseRateCache.set(ccy, r);
      }
      for (const ccy of bases) if (!baseRateCache.has(ccy)) baseRateCache.set(ccy, null);
    }
    rateFor = (row) => {
      const base = tradeBaseCurrency(row);
      const r = baseRateCache.get(base);
      if (r === undefined || r === null) {
        // No rate for this row's base: numbers stay native and the row is
        // labelled with its own currency, never the display currency.
        return { rate: 1, currency: base };
      }
      return { rate: r, currency: displayCurrency };
    };
  }

  // Even when USD conversion fails, resolve each row independently: a native
  // row may already be in the requested currency or have a usable cross rate.
  scaleMoneyInPayload(out, rate || 1, {
    rateFor,
    relabel,
    moneyArrayKeys,
    moneyLabelKeys,
    labelSymbol: currencySymbolFor(displayCurrency),
    skipKeys
  });
  out.display_currency = rate ? displayCurrency : 'USD';
  return out;
}

module.exports = {
  resolveDisplayCurrency,
  currencySymbolFor,
  scaleMoneyLabel,
  getRatesToDisplay,
  scaleMoneyFields,
  scaleMoneyInPayload,
  convertForDisplay,
  isTradeMoneyKey,
  FINANCIAL_MONEY_KEYS
};

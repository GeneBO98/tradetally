const {
  resolveDisplayCurrency,
  getRatesToDisplay,
  currencySymbolFor,
  scaleMoneyInPayload
} = require('../utils/displayCurrency');
const { tradeBaseCurrency } = require('../utils/tradeFx');

/**
 * Currency handling for AI prompts. Journal amounts are converted to the
 * user's display currency with the same rules the API uses (USD-normalized
 * storage, per-row base currency for unconverted rows, daily FX store), so
 * the AI quotes the numbers the user sees in the app. Market data (quotes,
 * EPS, revenue) stays in the instrument's own currency and is labeled.
 */
class AICurrency {
  constructor(code, rates = {}) {
    this.code = code;
    this.symbol = currencySymbolFor(code);
    this.rates = rates;
  }

  /**
   * Falls back to USD when no USD -> display rate is available, so the
   * prompt never labels unconverted dollars as another currency.
   */
  static async forUser(userId) {
    const code = await resolveDisplayCurrency(userId);
    if (code === 'USD') return new AICurrency('USD', { USD: 1 });

    const currency = new AICurrency(code);
    await currency.ensureRates(['USD']);
    if (!Number.isFinite(currency.rates.USD)) {
      console.warn(`[AI_CURRENCY] No USD/${code} rate; AI context stays in USD`);
      return new AICurrency('USD', { USD: 1 });
    }
    return currency;
  }

  static toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async ensureRates(codes) {
    const missing = [...new Set(codes.filter(Boolean).map(c => String(c).toUpperCase()))]
      .filter(c => !(c in this.rates));
    if (!missing.length) return;
    Object.assign(this.rates, await getRatesToDisplay(missing, this.code));
  }

  async ensureRowRates(rows) {
    await this.ensureRates((rows || []).filter(Boolean).map(row => tradeBaseCurrency(row)));
  }

  rateFrom(code) {
    const rate = this.rates[String(code || 'USD').toUpperCase()];
    return Number.isFinite(rate) ? rate : null;
  }

  convert(value, fromCode = 'USD') {
    const number = AICurrency.toNumber(value);
    const rate = this.rateFrom(fromCode);
    return number === null || rate === null ? null : number * rate;
  }

  fromUsd(value) {
    return this.convert(value, 'USD');
  }

  /**
   * Convert a stored trade row's money fields (and nested executions/legs)
   * from the row's base currency. Returns the converted copy and the
   * currency its numbers are now in: the row's own currency when no rate
   * exists, never a mislabeled one.
   */
  convertTradeRow(row, payload = row) {
    if (!payload) return { value: payload, currency: this.code };
    const base = tradeBaseCurrency(row);
    const rate = this.rateFrom(base);
    const copy = JSON.parse(JSON.stringify(payload));
    if (rate === null) return { value: copy, currency: base };
    return { value: scaleMoneyInPayload(copy, rate), currency: this.code };
  }

  format(value, code = this.code) {
    const number = AICurrency.toNumber(value);
    if (number === null) return 'N/A';
    const symbol = code === this.code ? this.symbol : currencySymbolFor(code);
    return `${number < 0 ? '-' : ''}${symbol}${Math.abs(number).toFixed(2)}`;
  }

  promptNote() {
    return `CURRENCY: The trader works in ${this.code} (${this.symbol}). All of the trader's own amounts below (P&L, entry/exit prices, stops, targets, statistics) are already converted to ${this.code}. Write every money amount in your answer in ${this.code}, never in another currency unless quoting market data. Market data (quotes, EPS, revenue) is in the currency it is labeled with; when relating it to the trader's position, use the ${this.code} conversions provided.`;
  }
}

module.exports = AICurrency;

/**
 * DCF Valuation Service
 * Calculates historical metrics and performs Discounted Cash Flow valuation
 * Similar to EverythingMoney.com stock valuation calculator
 */

const db = require('../config/database');
const FundamentalDataService = require('./fundamentalDataService');

class DCFValuationService {
  /**
   * Calculate discount rate using CAPM (Capital Asset Pricing Model)
   * Cost of Equity = Risk-free rate + Beta × Market Risk Premium
   * 
   * @param {number} beta - Stock's beta (volatility vs market)
   * @param {number} riskFreeRate - Risk-free rate (10-year Treasury, default 0.04 = 4%)
   * @param {number} marketRiskPremium - Market risk premium (default 0.06 = 6%)
   * @returns {number} Discount rate as decimal (e.g., 0.10 = 10%)
   */
  static calculateDiscountRate(beta = null, riskFreeRate = 0.04, marketRiskPremium = 0.06) {
    // If beta is not available, use default of 1.0 (market average)
    const stockBeta = beta !== null && beta !== undefined ? beta : 1.0;
    
    // CAPM formula: Re = Rf + β × (Rm - Rf)
    // Where (Rm - Rf) is the market risk premium
    const discountRate = riskFreeRate + (stockBeta * marketRiskPremium);
    
    console.log(`[DCF] Discount rate calculation: Rf=${(riskFreeRate*100).toFixed(2)}%, Beta=${stockBeta.toFixed(2)}, MRP=${(marketRiskPremium*100).toFixed(2)}%, Discount=${(discountRate*100).toFixed(2)}%`);
    
    return discountRate;
  }

  /**
   * Get historical metrics for DCF analysis
   * Returns ROIC, revenue growth, profit margin, FCF margin for 1yr, 5yr, 10yr periods
   * Also calculates discount rate using CAPM
   * @param {string} symbol - Stock symbol
   * @param {boolean} forceRefresh - Force refresh from API
   * @returns {Promise<Object>} Historical metrics
   */
  static async getHistoricalMetrics(symbol, forceRefresh = false) {
    const symbolUpper = symbol.toUpperCase();
    console.log(`[DCF] Fetching historical metrics for ${symbolUpper}...`);

    // Get profile for current price and shares
    const [profile, quote, metricsData] = await Promise.all([
      FundamentalDataService.getProfile(symbolUpper),
      FundamentalDataService.getQuote(symbolUpper),
      FundamentalDataService.getMetrics(symbolUpper).catch(err => {
        console.warn(`[DCF] Failed to get metrics for ${symbolUpper}: ${err.message}`);
        return null;
      })
    ]);

    const profileShares = profile?.shareOutstanding ? profile.shareOutstanding * 1000000 : null;
    const currentPrice = quote?.c || null;

    // Get one extra balance sheet period so ROIC can use average invested
    // capital for every displayed historical period.
    const financials = await FundamentalDataService.getFinancials(symbolUpper, 11, forceRefresh, 'annual', profileShares);

    if (!financials || financials.length < 2) {
      throw new Error(`Insufficient financial data for ${symbolUpper}. Need at least 2 years.`);
    }

    // Sort by year descending
    const sortedRaw = financials
      .map(f => ({ ...f, fiscalYear: f.fiscalYear || f.year }))
      .sort((a, b) => b.fiscalYear - a.fiscalYear);

    // Drop historical periods whose revenue is implausibly small relative to
    // the most recent year — these are usually extraction errors where the
    // older filing used a different XBRL concept and our `findValue` picked
    // up a segment line or none at all. Without this filter, e.g. AMZN's
    // 10Y revenue CAGR comes back as 38% (mathematically impossible) because
    // one old year reports $26B instead of the real number.
    const cleaned = this.filterAnomalousRevenue(sortedRaw);

    // Split-adjust historical shares so every downstream per-share metric
    // (EPS, P/E history, P/FCF history, buyback rate) is on the same basis
    // as the most recent period. Without this, e.g. NVDA's 10-for-1 split
    // in 2024 makes pre-2024 share counts look 10× smaller than they should.
    const sorted = this.splitAdjustFinancials(cleaned);

    console.log(`[DCF] Got ${sorted.length} years of data for ${symbolUpper}`);

    // Fetch year-end prices for each fiscal year so we can compute the
    // per-year P/E and P/FCF ratios EM-style (using each year's actual
    // year-end price, not today's price).
    const fiscalYears = sorted.map(p => p.fiscalYear);
    const yearEndPrices = await FundamentalDataService.getYearEndPrices(symbolUpper, fiscalYears)
      .catch(err => {
        console.warn(`[DCF] Failed to get year-end prices for ${symbolUpper}: ${err.message}`);
        return {};
      });

    // Extract beta from metrics if available
    // Finnhub metrics may have beta in different formats
    let beta = null;
    if (metricsData?.metric) {
      // Try different possible beta field names
      beta = metricsData.metric.beta || 
             metricsData.metric['52WeekChange']?.beta || 
             metricsData.metric['beta'] ||
             null;
    }

    // Calculate discount rate using CAPM
    // Use current risk-free rate (10-year Treasury ~4%) and market risk premium (~6%)
    const calculatedDiscountRate = this.calculateDiscountRate(beta, 0.04, 0.06);

    const finnhubMetric = metricsData?.metric || {};
    const numericFromFinnhub = (key) => {
      const value = finnhubMetric[key];
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const latest = sorted[0] || {};
    const sharesOutstanding = this.resolveSharesOutstanding(profileShares, latest);
    const computedMarketCap = currentPrice && sharesOutstanding ? currentPrice * sharesOutstanding : null;
    const marketCap = numericFromFinnhub('marketCapitalization')
      ? numericFromFinnhub('marketCapitalization') * 1_000_000
      : computedMarketCap;
    const totalDebt = latest.totalDebt ?? null;
    const cashAndEquivalents = latest.cashAndEquivalents ?? null;
    const enterpriseValue = marketCap !== null && marketCap !== undefined
      ? marketCap + (totalDebt || 0) - (cashAndEquivalents || 0)
      : null;
    const dividendsPaidTtm = latest.dividendsPaid !== null && latest.dividendsPaid !== undefined
      ? Math.abs(Number(latest.dividendsPaid))
      : null;
    const psRatio = numericFromFinnhub('psTTM')
      ?? (marketCap && latest.revenue ? marketCap / latest.revenue : null);
    const pegRatio = numericFromFinnhub('pegRatio');
    const dividendYieldPct = numericFromFinnhub('currentDividendYieldTTM')
      ?? numericFromFinnhub('dividendYieldIndicatedAnnual');
    const dividendYield = dividendYieldPct !== null ? dividendYieldPct / 100 : null;
    const forwardDividendYieldPct = numericFromFinnhub('dividendYieldIndicatedAnnual');
    const forwardDividendYield = forwardDividendYieldPct !== null ? forwardDividendYieldPct / 100 : null;
    const week52High = numericFromFinnhub('52WeekHigh');
    const week52Low = numericFromFinnhub('52WeekLow');
    const week52HighDate = finnhubMetric['52WeekHighDate'] || null;
    const week52LowDate = finnhubMetric['52WeekLowDate'] || null;

    // Calculate metrics for each available period
    const metrics = {
      symbol: symbolUpper,
      current_price: currentPrice,
      shares_outstanding: sharesOutstanding,
      market_cap: marketCap,

      // Historical metrics
      roic_1yr: this.calculateROIC(sorted, 1),
      roic_5yr: this.calculateROIC(sorted, 5),
      roic_10yr: this.calculateROIC(sorted, 10),

      revenue_growth_1yr: this.calculateCAGR(sorted, 'revenue', 1),
      revenue_growth_3yr: this.calculateCAGR(sorted, 'revenue', 3),
      revenue_growth_5yr: this.calculateCAGR(sorted, 'revenue', 5),
      revenue_growth_10yr: this.calculateCAGR(sorted, 'revenue', 10),

      profit_margin_1yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 1),
      profit_margin_5yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 5),
      profit_margin_10yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 10),

      gross_profit_margin_1yr: this.calculateAvgMargin(sorted, 'grossProfit', 'revenue', 1),
      gross_profit_margin_5yr: this.calculateAvgMargin(sorted, 'grossProfit', 'revenue', 5),
      gross_profit_margin_10yr: this.calculateAvgMargin(sorted, 'grossProfit', 'revenue', 10),

      fcf_margin_1yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 1),
      fcf_margin_5yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 5),
      fcf_margin_10yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 10),

      // Current values for DCF base
      current_fcf: latest.freeCashFlow || null,
      current_revenue: latest.revenue || null,

      // Ratios - current and historical averages
      pe_ratio: this.calculatePE(latest, currentPrice),
      pe_1yr: this.calculateAvgPE(sorted, yearEndPrices, 1),
      pe_5yr: this.calculateAvgPE(sorted, yearEndPrices, 5),
      pe_10yr: this.calculateAvgPE(sorted, yearEndPrices, 10),
      price_to_fcf: this.calculatePriceToFCF(currentPrice, sharesOutstanding, latest.freeCashFlow),
      pfcf_1yr: this.calculateAvgPFCF(sorted, yearEndPrices, 1),
      pfcf_5yr: this.calculateAvgPFCF(sorted, yearEndPrices, 5),
      pfcf_10yr: this.calculateAvgPFCF(sorted, yearEndPrices, 10),

      // Additional current values for DCF calculations
      current_net_income: latest.netIncome || null,

      // Dividend per share and buyback rate — used by the DCF target-price
      // model so fair value includes the dividend stream and accounts for
      // share-count decline from buybacks. Matches EM's methodology, which
      // explicitly includes dividends in the result.
      current_dividend_per_share: this.calculateCurrentDividendPerShare(latest),
      buyback_rate: this.calculateBuybackRate(sorted, 5),

      // Snapshot metrics for the key-metrics panel
      avg_net_income_5yr: this.calculateAvg(sorted, 'netIncome', 5),
      avg_fcf_5yr: this.calculateAvg(sorted, 'freeCashFlow', 5),
      ps_ratio: psRatio,
      peg_ratio: pegRatio,
      dividend_yield: dividendYield,
      forward_dividend_yield: forwardDividendYield,
      dividends_paid_ttm: dividendsPaidTtm,
      enterprise_value: enterpriseValue,
      total_debt: totalDebt,
      cash_and_equivalents: cashAndEquivalents,
      week_52_high: week52High,
      week_52_low: week52Low,
      week_52_high_date: week52HighDate,
      week_52_low_date: week52LowDate,

      // Calculated discount rate (CAPM)
      calculated_discount_rate: calculatedDiscountRate,
      beta: beta,

      // Raw data for transparency
      years_available: sorted.length,
      latest_year: latest.fiscalYear,
      oldest_year: sorted[sorted.length - 1]?.fiscalYear
    };

    console.log(`[DCF] Calculated metrics for ${symbolUpper}:`, JSON.stringify(metrics, null, 2));

    return metrics;
  }

  /**
   * Calculate average ROIC over a period
   * ROIC = NOPAT / Average Invested Capital
   * Invested Capital = Total Equity + Total Debt + Accounts Payable
   * (matches EverythingMoney methodology — AP is treated as operating
   * capital deployed since it represents supplier-financed working capital)
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {number} years - Number of years to average
   * @returns {number|null} Average ROIC as decimal (0.15 = 15%)
   */
  static calculateROIC(financials, years) {
    const taxRate = 0.21;
    const periods = financials.slice(0, Math.min(years, financials.length - 1));

    const roics = [];
    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      const priorPeriod = financials[index + 1];
      const {
        operatingIncome,
        totalEquity,
        totalDebt,
        accountsPayable,
        incomeBeforeTax,
        incomeTaxExpense
      } = period;

      if (
        operatingIncome !== null &&
        operatingIncome !== undefined &&
        totalEquity !== null &&
        totalEquity !== undefined &&
        priorPeriod
      ) {
        const investedCapital = (totalEquity || 0) + (totalDebt || 0) + (accountsPayable || 0);
        const priorInvestedCapital = (priorPeriod.totalEquity || 0) +
          (priorPeriod.totalDebt || 0) +
          (priorPeriod.accountsPayable || 0);
        const avgInvestedCapital = (investedCapital + priorInvestedCapital) / 2;

        if (avgInvestedCapital > 0.01) {
          const effectiveTaxRate = incomeBeforeTax && incomeBeforeTax > 0 && incomeTaxExpense !== null && incomeTaxExpense !== undefined
            ? Math.max(0, Math.min(Number(incomeTaxExpense) / Number(incomeBeforeTax), 1))
            : taxRate;
          const nopat = operatingIncome * (1 - effectiveTaxRate);
          const roic = nopat / avgInvestedCapital;
          roics.push(roic);
        }
      }
    }

    if (roics.length === 0) return null;
    return roics.reduce((sum, r) => sum + r, 0) / roics.length;
  }

  /**
   * Calculate CAGR (Compound Annual Growth Rate) for a metric
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {string} field - Field name to calculate growth for
   * @param {number} years - Number of years for growth calculation
   * @returns {number|null} CAGR as decimal (0.10 = 10%)
   */
  static calculateCAGR(financials, field, years) {
    if (financials.length < 2) return null;

    const endIndex = 0;
    const startIndex = Math.min(years, financials.length - 1);

    const endValue = financials[endIndex]?.[field];
    const startValue = financials[startIndex]?.[field];

    if (!endValue || !startValue || startValue <= 0) return null;

    const actualYears = financials[endIndex].fiscalYear - financials[startIndex].fiscalYear;
    if (actualYears <= 0) return null;

    // CAGR = (End/Start)^(1/years) - 1
    const cagr = Math.pow(endValue / startValue, 1 / actualYears) - 1;
    return cagr;
  }

  /**
   * Calculate average margin over a period
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {string} numerator - Field name for numerator (e.g., 'netIncome')
   * @param {string} denominator - Field name for denominator (e.g., 'revenue')
   * @param {number} years - Number of years to average
   * @returns {number|null} Average margin as decimal (0.25 = 25%)
   */
  static calculateAvgMargin(financials, numerator, denominator, years) {
    const periods = financials.slice(0, Math.min(years, financials.length));

    const margins = [];
    for (const period of periods) {
      const num = period[numerator];
      const den = period[denominator];

      if (num !== null && num !== undefined && den && den > 0) {
        margins.push(num / den);
      }
    }

    if (margins.length === 0) return null;
    return margins.reduce((sum, m) => sum + m, 0) / margins.length;
  }

  /**
   * Calculate simple average of a numeric field over a period
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {string} field - Field name to average
   * @param {number} years - Number of years to include
   * @returns {number|null} Average of the field, or null when no values exist
   */
  static calculateAvg(financials, field, years) {
    const periods = financials.slice(0, Math.min(years, financials.length));
    const values = [];
    for (const period of periods) {
      const value = period[field];
      if (value !== null && value !== undefined && !Number.isNaN(Number(value))) {
        values.push(Number(value));
      }
    }
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate P/E ratio
   * @param {Object} latestFinancial - Most recent financial data
   * @param {number} currentPrice - Current stock price
   * @returns {number|null} P/E ratio
   */
  static calculatePE(latestFinancial, currentPrice) {
    if (!currentPrice || !latestFinancial?.netIncome || !latestFinancial?.sharesOutstanding) {
      return null;
    }

    const eps = latestFinancial.netIncome / latestFinancial.sharesOutstanding;
    if (eps <= 0) return null;

    return currentPrice / eps;
  }

  /**
   * Calculate Price to Free Cash Flow ratio
   * @param {number} currentPrice - Current stock price
   * @param {number} sharesOutstanding - Total shares outstanding
   * @param {number} fcf - Free cash flow
   * @returns {number|null} P/FCF ratio
   */
  static calculatePriceToFCF(currentPrice, sharesOutstanding, fcf) {
    if (!currentPrice || !sharesOutstanding || !fcf || fcf <= 0) {
      return null;
    }

    const marketCap = currentPrice * sharesOutstanding;
    return marketCap / fcf;
  }

  static resolveSharesOutstanding(profileShares, latestFinancial = {}) {
    const candidates = [
      profileShares,
      latestFinancial.sharesOutstanding,
      latestFinancial.sharesBasic,
      latestFinancial.sharesDiluted
    ];

    for (const candidate of candidates) {
      const shares = Number(candidate);
      if (Number.isFinite(shares) && shares > 0) {
        return shares;
      }
    }

    return null;
  }

  /**
   * Calculate average P/E ratio over a period
   * For each year, computes that year's P/E = year-end price / year EPS,
   * then averages those per-year P/E values. This matches the EM-style
   * historical average P/E (vs. inflating with today's price).
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {Object} yearEndPrices - Map of fiscal year -> year-end price
   * @param {number} years - Number of years to average
   * @returns {number|null} Average P/E ratio
   */
  static calculateAvgPE(financials, yearEndPrices, years) {
    if (!yearEndPrices) return null;

    const periods = financials.slice(0, Math.min(years, financials.length));
    const peValues = [];

    for (const period of periods) {
      const price = yearEndPrices[period.fiscalYear];
      if (!price || price <= 0) continue;
      if (!period.netIncome || !period.sharesOutstanding || period.sharesOutstanding <= 0) continue;

      const eps = period.netIncome / period.sharesOutstanding;
      if (eps <= 0) continue;

      peValues.push(price / eps);
    }

    if (peValues.length === 0) return null;
    return peValues.reduce((sum, p) => sum + p, 0) / peValues.length;
  }

  /**
   * Calculate average P/FCF ratio over a period
   * For each year, computes that year's P/FCF = year-end price /
   * (year FCF / year shares), then averages those per-year ratios.
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {Object} yearEndPrices - Map of fiscal year -> year-end price
   * @param {number} years - Number of years to average
   * @returns {number|null} Average P/FCF ratio
   */
  static calculateAvgPFCF(financials, yearEndPrices, years) {
    if (!yearEndPrices) return null;

    const periods = financials.slice(0, Math.min(years, financials.length));
    const pfcfValues = [];

    for (const period of periods) {
      const price = yearEndPrices[period.fiscalYear];
      if (!price || price <= 0) continue;
      if (!period.freeCashFlow || period.freeCashFlow <= 0) continue;
      if (!period.sharesOutstanding || period.sharesOutstanding <= 0) continue;

      const fcfPerShare = period.freeCashFlow / period.sharesOutstanding;
      if (fcfPerShare <= 0) continue;

      pfcfValues.push(price / fcfPerShare);
    }

    if (pfcfValues.length === 0) return null;
    return pfcfValues.reduce((sum, p) => sum + p, 0) / pfcfValues.length;
  }

  /**
   * Current dividend per share from the most recent period.
   * Returns null when no dividend data is available; the DCF will then skip
   * the dividend term entirely.
   * @param {Object} latest - Most recent financial period
   * @returns {number|null} Dividend per share (positive number) or null
   */
  static calculateCurrentDividendPerShare(latest) {
    if (!latest) return null;
    const dividendsPaid = Math.abs(Number(latest.dividendsPaid) || 0);
    const shares = Number(latest.sharesOutstanding) || 0;
    if (dividendsPaid <= 0 || shares <= 0) return null;
    return dividendsPaid / shares;
  }

  /**
   * Trim historical periods where the reported revenue is implausibly small
   * compared to the most recent year. These are nearly always XBRL
   * extraction failures (older filings used a different concept name, our
   * `findValue` picked up a segment line, or the API truncated the
   * statement). Including them in CAGR / margin averages produces
   * obviously-wrong outputs (e.g. 38% 10Y revenue CAGR, inflated 10Y FCF
   * margin avg pulled up by a single tiny-revenue datapoint).
   *
   * Walks newest → oldest. As soon as we hit a year whose revenue is less
   * than 10% of the most recent year's revenue OR less than half of the
   * immediately newer year's revenue, we treat that year and everything
   * older as unreliable and drop them.
   *
   * @param {Array} financialsSortedDesc - Financials newest-first
   * @returns {Array} Same array truncated at the first anomaly
   */
  static filterAnomalousRevenue(financialsSortedDesc) {
    if (!Array.isArray(financialsSortedDesc) || financialsSortedDesc.length < 2) {
      return financialsSortedDesc || [];
    }

    const newestRevenue = Number(financialsSortedDesc[0]?.revenue) || 0;
    if (newestRevenue <= 0) return financialsSortedDesc;

    const kept = [financialsSortedDesc[0]];
    for (let i = 1; i < financialsSortedDesc.length; i += 1) {
      const period = financialsSortedDesc[i];
      const periodRev = Number(period?.revenue) || 0;
      const newerRev = Number(kept[kept.length - 1]?.revenue) || 0;

      // No revenue reported — keep the period for non-revenue calcs but
      // it'll be excluded from revenue-based ones by their own null guard.
      if (periodRev <= 0) {
        kept.push(period);
        continue;
      }

      // Anomaly tests:
      //   - period revenue < 10% of the newest year's (catches single bad cells)
      //   - period revenue < 50% of the next-newer year (catches sudden drops
      //     that real businesses don't show 5–10 years back from now)
      if (periodRev < newestRevenue * 0.10 || (newerRev > 0 && periodRev < newerRev * 0.5)) {
        console.warn(`[DCF] Dropping fiscal ${period.fiscalYear} and earlier — revenue ${(periodRev/1e9).toFixed(1)}B vs newer ${(newerRev/1e9).toFixed(1)}B looks like a data extraction error`);
        break;
      }

      kept.push(period);
    }

    return kept;
  }

  /**
   * Normalize historical share counts to the most recent period's basis by
   * inferring stock splits from large YoY ratios. Walks newest → oldest;
   * when a YoY ratio falls outside [0.5, 2.0] it's treated as a split (or
   * reverse split) and the inferred multiplier is applied cumulatively to
   * all older periods.
   *
   * Doing this once at ingest means every per-share metric we compute
   * downstream (EPS, P/E history, P/FCF history, buyback rate, dividend
   * per share) sees consistent split-adjusted shares without each call
   * site needing its own split logic. Finnhub's price candles are already
   * split-adjusted, so adjusting shares this way puts both legs of every
   * per-share ratio on the same basis.
   *
   * @param {Array} financialsSortedDesc - Financials newest-first
   * @returns {Array} New array with split-adjusted sharesOutstanding values
   */
  static splitAdjustFinancials(financialsSortedDesc) {
    if (!Array.isArray(financialsSortedDesc) || financialsSortedDesc.length === 0) {
      return financialsSortedDesc || [];
    }

    const adjusted = financialsSortedDesc.map(p => ({ ...p }));
    let multiplier = 1;

    for (let i = 1; i < adjusted.length; i += 1) {
      // Compare raw (un-touched-by-this-loop-pass) shares to detect the
      // jump. Older periods get multiplied cumulatively below.
      const newerRaw = Number(financialsSortedDesc[i - 1]?.sharesOutstanding) || 0;
      const olderRaw = Number(financialsSortedDesc[i]?.sharesOutstanding) || 0;

      if (newerRaw > 0 && olderRaw > 0) {
        const ratio = newerRaw / olderRaw;
        if (ratio > 2.0 || ratio < 0.5) {
          // Split (forward or reverse) between i-1 and i. Apply the inferred
          // ratio so the older period, on the new basis, matches the newer.
          multiplier *= ratio;
          console.log(`[DCF] Detected split at fiscal ${adjusted[i].fiscalYear || '?'} (${(olderRaw/1e6).toFixed(1)}M → ${(newerRaw/1e6).toFixed(1)}M shares). Applying ${ratio.toFixed(2)}× to prior periods.`);
        }
      }

      if (multiplier !== 1 && Number(adjusted[i].sharesOutstanding) > 0) {
        adjusted[i].sharesOutstanding = Number(adjusted[i].sharesOutstanding) * multiplier;
      }
    }

    return adjusted;
  }

  /**
   * Annualized share-count change over the last `years` periods. Positive
   * means buybacks (share count declining); negative means dilution. Used
   * to project future share count: futureShares = currentShares ×
   * (1 - buybackRate)^N.
   *
   * Walks year-over-year so we can detect and exclude stock-split anomalies
   * (e.g. NVDA's 10-for-1 in 2024 would otherwise look like -900% dilution).
   * Any YoY ratio outside [0.5, 2.0] is treated as a split and skipped.
   *
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {number} years - Lookback period
   * @returns {number} Annualized rate (e.g., 0.03 = 3% buybacks/yr). 0 when insufficient data.
   */
  static calculateBuybackRate(financials, years) {
    if (!Array.isArray(financials) || financials.length < 2) return 0;

    const window = financials.slice(0, Math.min(years + 1, financials.length));

    // Geometric mean of clean year-over-year ratios (skipping splits).
    // We accumulate the product of valid ratios so the final rate is
    // (product)^(1/count) — the true compound annual change across the
    // remaining periods.
    let ratioProduct = 1;
    let validYears = 0;
    for (let i = 0; i < window.length - 1; i += 1) {
      const newer = Number(window[i]?.sharesOutstanding) || 0;
      const older = Number(window[i + 1]?.sharesOutstanding) || 0;
      if (newer <= 0 || older <= 0) continue;

      const ratio = newer / older;
      // Anything outside [0.5, 2.0] in a single year is almost certainly a
      // stock split or reverse split, not actual buybacks/dilution.
      if (ratio < 0.5 || ratio > 2.0) continue;

      ratioProduct *= ratio;
      validYears += 1;
    }

    if (validYears === 0) return 0;

    const meanRatio = Math.pow(ratioProduct, 1 / validYears);
    const rate = 1 - meanRatio;

    if (!Number.isFinite(rate)) return 0;
    return Math.max(-0.20, Math.min(0.20, rate));
  }

  /**
   * Perform DCF calculation with user-provided estimates
   * Uses EverythingMoney-style multi-method approach:
   * - P/E based valuation
   * - P/FCF based valuation
   * Final fair value averages both methods
   * @param {Object} params - DCF parameters
   * @returns {Object} DCF results with fair values for low/medium/high scenarios
   */
  static calculateDCF(params) {
    const {
      current_fcf,
      current_revenue,
      current_net_income,
      shares_outstanding,
      current_price,
      calculated_discount_rate, // Calculated using CAPM
      beta, // Stock's beta for reference
      // User estimates (as decimals, e.g., 0.10 for 10%)
      revenue_growth_low,
      revenue_growth_medium,
      revenue_growth_high,
      profit_margin_low,
      profit_margin_medium,
      profit_margin_high,
      fcf_margin_low,
      fcf_margin_medium,
      fcf_margin_high,
      // Multiples
      pe_low,
      pe_medium,
      pe_high,
      pfcf_low,
      pfcf_medium,
      pfcf_high,
      // Discount rates - if not provided, use calculated defaults
      // Note: Low scenario typically requires higher return (more conservative)
      desired_return_low,
      desired_return_medium,
      desired_return_high,
      // Projection period
      projection_years = 10,
      // Dividend per share and buyback rate (auto-derived in getHistoricalMetrics).
      // The fair value adds PV of the dividend stream over the projection, and
      // projects future share count as shares × (1 - buyback_rate)^N.
      current_dividend_per_share = 0,
      buyback_rate = 0
    } = params;
    
    // Use calculated discount rate as base if user doesn't provide
    const baseRate = calculated_discount_rate || 0.10;
    
    // Calculate default rates for each scenario
    const defaultBearRate = baseRate + 0.03; // Bear = more conservative = higher discount
    const defaultMediumRate = baseRate;
    const defaultBullRate = Math.max(0.05, baseRate - 0.02); // Bull = less conservative = lower discount (min 5%)
    
    // Use user input if provided, otherwise use calculated defaults
    // DO NOT auto-correct - let user enter whatever discount rates they want
    // Higher discount rate = lower fair value (more conservative)
    let bearRate = desired_return_low ?? defaultBearRate;
    let mediumRate = desired_return_medium ?? defaultMediumRate;
    let bullRate = desired_return_high ?? defaultBullRate;
    
    if (!shares_outstanding) {
      throw new Error('Missing required data: shares outstanding is required');
    }

    // Use actual values from financial data
    const baseRevenue = current_revenue;
    const baseNetIncome = current_net_income;
    const baseFCF = current_fcf;

    console.log(`[DCF] Input values for all scenarios:`, {
      current_revenue,
      current_net_income,
      current_fcf,
      shares_outstanding,
      current_price,
      projection_years,
      // Bear (Low) scenario
      bear: {
        revenue_growth: revenue_growth_low,
        profit_margin: profit_margin_low,
        fcf_margin: fcf_margin_low,
        pe: pe_low,
        pfcf: pfcf_low,
        desired_return: bearRate,
        calculated_discount_rate: calculated_discount_rate,
        beta: beta
      },
      // Base (Medium) scenario
      base: {
        revenue_growth: revenue_growth_medium,
        profit_margin: profit_margin_medium,
        fcf_margin: fcf_margin_medium,
        pe: pe_medium,
        pfcf: pfcf_medium,
        desired_return: mediumRate,
        calculated_discount_rate: calculated_discount_rate,
        beta: beta
      },
      // Bull (High) scenario
      bull: {
        revenue_growth: revenue_growth_high,
        profit_margin: profit_margin_high,
        fcf_margin: fcf_margin_high,
        pe: pe_high,
        pfcf: pfcf_high,
        desired_return: bullRate,
        calculated_discount_rate: calculated_discount_rate,
        beta: beta
      }
    });

    if (!baseRevenue && !baseNetIncome && !baseFCF) {
      throw new Error('Missing required data: need revenue, net income, or FCF data');
    }

    const inputWarnings = [];

    if (revenue_growth_low !== null && revenue_growth_low !== undefined &&
        revenue_growth_high !== null && revenue_growth_high !== undefined &&
        revenue_growth_low > revenue_growth_high) {
      inputWarnings.push(`Growth rates appear reversed: Bear (${(revenue_growth_low*100).toFixed(1)}%) > Bull (${(revenue_growth_high*100).toFixed(1)}%). Values were preserved as entered.`);
    }

    if (pe_low && pe_high && pe_low > pe_high) {
      inputWarnings.push(`P/E multiples appear reversed: Bear (${pe_low}) > Bull (${pe_high}). Values were preserved as entered.`);
    }

    if (pfcf_low && pfcf_high && pfcf_low > pfcf_high) {
      inputWarnings.push(`P/FCF multiples appear reversed: Bear (${pfcf_low}) > Bull (${pfcf_high}). Values were preserved as entered.`);
    }

    // Log discount rate calculation info
    if (calculated_discount_rate) {
      console.log(`[DCF] Using calculated discount rate (CAPM): ${(calculated_discount_rate*100).toFixed(2)}% (Beta: ${beta || 'N/A'})`);
      console.log(`[DCF] Scenario adjustments: Bear=${(bearRate*100).toFixed(2)}%, Base=${(mediumRate*100).toFixed(2)}%, Bull=${(bullRate*100).toFixed(2)}%`);
      console.log(`[DCF] Higher required return lowers the present fair value for a given future price.`);
    } else {
      console.warn(`[DCF] No calculated discount rate available - using user inputs or defaults`);
      console.log(`[DCF] Discount rates being used: Bear=${(bearRate*100).toFixed(2)}%, Base=${(mediumRate*100).toFixed(2)}%, Bull=${(bullRate*100).toFixed(2)}%`);
    }
    
    if (inputWarnings.length > 0) {
      console.warn(`[DCF] INPUT VALIDATION WARNINGS:\n${inputWarnings.map(w => `  - ${w}`).join('\n')}`);
    }
    
    console.log(`[DCF] ===== BEAR SCENARIO =====`);
    console.log(`[DCF] Growth: ${revenue_growth_low ? (revenue_growth_low*100).toFixed(2) + '%' : 'N/A'}, PE: ${pe_low || 'N/A'}, P/FCF: ${pfcf_low || 'N/A'}, DISCOUNT RATE: ${(bearRate*100).toFixed(2)}%`);
    
    // Use EverythingMoney-style target price method: project year-N
    // earnings/FCF, apply the exit multiple, then discount that future stock
    // price back by the required return.
    const bearValuation = this.calculateDCFTraditionalDetailed({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: revenue_growth_low,
      profitMargin: profit_margin_low,
      fcfMargin: fcf_margin_low,
      peMultiple: pe_low,
      pfcfMultiple: pfcf_low,
      discountRate: bearRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03, // 3% terminal growth rate (long-term GDP growth)
      dividendPerShare: current_dividend_per_share,
      buybackRate: buyback_rate
    });
    inputWarnings.push(...bearValuation.warnings.map(warning => `Bear: ${warning}`));
    let fairValueLow = bearValuation.fairValue;
    let futurePriceLow = bearValuation.futurePrice;

    console.log(`[DCF] ===== BASE SCENARIO =====`);
    console.log(`[DCF] Growth: ${revenue_growth_medium ? (revenue_growth_medium*100).toFixed(2) + '%' : 'N/A'}, PE: ${pe_medium || 'N/A'}, P/FCF: ${pfcf_medium || 'N/A'}, DISCOUNT RATE: ${(mediumRate*100).toFixed(2)}%`);
    
    const baseValuation = this.calculateDCFTraditionalDetailed({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: revenue_growth_medium,
      profitMargin: profit_margin_medium,
      fcfMargin: fcf_margin_medium,
      peMultiple: pe_medium,
      pfcfMultiple: pfcf_medium,
      discountRate: mediumRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03,
      dividendPerShare: current_dividend_per_share,
      buybackRate: buyback_rate
    });
    inputWarnings.push(...baseValuation.warnings.map(warning => `Base: ${warning}`));
    let fairValueMedium = baseValuation.fairValue;
    let futurePriceMedium = baseValuation.futurePrice;

    console.log(`[DCF] ===== BULL SCENARIO =====`);
    console.log(`[DCF] Growth: ${revenue_growth_high ? (revenue_growth_high*100).toFixed(2) + '%' : 'N/A'}, PE: ${pe_high || 'N/A'}, P/FCF: ${pfcf_high || 'N/A'}, DISCOUNT RATE: ${(bullRate*100).toFixed(2)}%`);
    const bullValuation = this.calculateDCFTraditionalDetailed({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: revenue_growth_high,
      profitMargin: profit_margin_high,
      fcfMargin: fcf_margin_high,
      peMultiple: pe_high,
      pfcfMultiple: pfcf_high,
      discountRate: bullRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03,
      dividendPerShare: current_dividend_per_share,
      buybackRate: buyback_rate
    });
    inputWarnings.push(...bullValuation.warnings.map(warning => `Bull: ${warning}`));
    let fairValueHigh = bullValuation.fairValue;
    let futurePriceHigh = bullValuation.futurePrice;

    const commonMethods = this.getCommonValuationMethods([
      bearValuation,
      baseValuation,
      bullValuation
    ]);

    if (commonMethods.length > 0) {
      const bearCommon = this.averageValuationMethods(bearValuation, commonMethods);
      const baseCommon = this.averageValuationMethods(baseValuation, commonMethods);
      const bullCommon = this.averageValuationMethods(bullValuation, commonMethods);

      fairValueLow = bearCommon.fairValue;
      fairValueMedium = baseCommon.fairValue;
      fairValueHigh = bullCommon.fairValue;
      futurePriceLow = bearCommon.futurePrice;
      futurePriceMedium = baseCommon.futurePrice;
      futurePriceHigh = bullCommon.futurePrice;

      const allMethods = ['pe', 'pfcf'];
      const excludedMethods = allMethods.filter(method => !commonMethods.includes(method));
      if (excludedMethods.length > 0) {
        inputWarnings.push(`Fair values use the same valid valuation methods across Bear, Base, and Bull: ${commonMethods.map(this.formatValuationMethod).join(', ')}. Excluded ${excludedMethods.map(this.formatValuationMethod).join(', ')} because it was not valid for every scenario.`);
      }
    } else {
      inputWarnings.push('No valuation method was valid across every scenario, so each scenario used its own available methods.');
    }

    console.log(`[DCF] ===== FINAL RESULTS =====`);
    console.log(`[DCF] Bear (discount=${(bearRate*100).toFixed(2)}%): $${fairValueLow?.toFixed(2)}`);
    console.log(`[DCF] Base (discount=${(mediumRate*100).toFixed(2)}%): $${fairValueMedium?.toFixed(2)}`);
    console.log(`[DCF] Bull (discount=${(bullRate*100).toFixed(2)}%): $${fairValueHigh?.toFixed(2)}`);
    if (fairValueLow && fairValueHigh) {
      const discountDiff = bearRate - bullRate;
      const valueDiff = fairValueHigh - fairValueLow;
      console.log(`[DCF] Discount rate difference: ${(discountDiff*100).toFixed(2)}% (Bear ${(bearRate*100).toFixed(2)}% - Bull ${(bullRate*100).toFixed(2)}%)`);
      console.log(`[DCF] Fair value difference: $${valueDiff.toFixed(2)}`);
    }

    if (fairValueLow && fairValueHigh && fairValueLow > fairValueHigh) {
      const bearGrowth = revenue_growth_low !== null && revenue_growth_low !== undefined ? (revenue_growth_low * 100).toFixed(1) : 'N/A';
      const bullGrowth = revenue_growth_high !== null && revenue_growth_high !== undefined ? (revenue_growth_high * 100).toFixed(1) : 'N/A';
      const bearDiscount = (bearRate * 100).toFixed(1);
      const bullDiscount = (bullRate * 100).toFixed(1);
      
      console.warn(`[DCF] Bear fair value ($${fairValueLow.toFixed(2)}) is above Bull ($${fairValueHigh.toFixed(2)}). ` +
        `Values were preserved as entered. ` +
        `Bear: growth=${bearGrowth}%, discount=${bearDiscount}%, PE=${pe_low || 'N/A'}, P/FCF=${pfcf_low || 'N/A'} ` +
        `Bull: growth=${bullGrowth}%, discount=${bullDiscount}%, PE=${pe_high || 'N/A'}, P/FCF=${pfcf_high || 'N/A'}`);
    }

    if (fairValueLow && fairValueMedium && fairValueMedium < fairValueLow) {
      inputWarnings.push(`Base fair value is below Bear because the entered assumptions produce a lower average valuation. Values were preserved as entered.`);
    }

    if (fairValueMedium && fairValueHigh && fairValueHigh < fairValueMedium) {
      inputWarnings.push(`Bull fair value is below Base because the entered assumptions produce a lower average valuation. Values were preserved as entered.`);
    }

    // Calculate margin of safety (positive = undervalued, negative = overvalued)
    const marginOfSafetyLow = current_price ? ((fairValueLow - current_price) / current_price) : null;
    const marginOfSafetyMedium = current_price ? ((fairValueMedium - current_price) / current_price) : null;
    const marginOfSafetyHigh = current_price ? ((fairValueHigh - current_price) / current_price) : null;

    return {
      fair_value_low: fairValueLow,
      fair_value_medium: fairValueMedium,
      fair_value_high: fairValueHigh,
      future_price_low: futurePriceLow,
      future_price_medium: futurePriceMedium,
      future_price_high: futurePriceHigh,
      current_price_return_low: this.calculateCurrentPriceReturn(current_price, futurePriceLow, projection_years, {
        cashFlowBasis: this.computeCashFlowBasis(baseRevenue, profit_margin_low, fcf_margin_low, baseNetIncome, baseFCF, shares_outstanding),
        growthRate: revenue_growth_low
      }),
      current_price_return_medium: this.calculateCurrentPriceReturn(current_price, futurePriceMedium, projection_years, {
        cashFlowBasis: this.computeCashFlowBasis(baseRevenue, profit_margin_medium, fcf_margin_medium, baseNetIncome, baseFCF, shares_outstanding),
        growthRate: revenue_growth_medium
      }),
      current_price_return_high: this.calculateCurrentPriceReturn(current_price, futurePriceHigh, projection_years, {
        cashFlowBasis: this.computeCashFlowBasis(baseRevenue, profit_margin_high, fcf_margin_high, baseNetIncome, baseFCF, shares_outstanding),
        growthRate: revenue_growth_high
      }),
      margin_of_safety_low: marginOfSafetyLow,
      margin_of_safety_medium: marginOfSafetyMedium,
      margin_of_safety_high: marginOfSafetyHigh,
      inputs: {
        current_fcf,
        current_revenue,
        current_net_income,
        shares_outstanding,
        current_price,
        revenue_growth_low,
        revenue_growth_medium,
        revenue_growth_high,
        profit_margin_low,
        profit_margin_medium,
        profit_margin_high,
        fcf_margin_low,
        fcf_margin_medium,
        fcf_margin_high,
        pe_low,
        pe_medium,
        pe_high,
        pfcf_low,
        pfcf_medium,
        pfcf_high,
        desired_return_low: bearRate,
        desired_return_medium: mediumRate,
        desired_return_high: bullRate,
        calculated_discount_rate: calculated_discount_rate,
        beta: beta,
        projection_years,
        input_warnings: inputWarnings,
        inputs_were_corrected: false
      }
    };
  }

  /**
   * Calculate fair value using the EverythingMoney-style target price model.
   * It projects the year-N earnings and FCF, applies the selected exit
   * multiples, then discounts the resulting future stock price back to today.
   */
  static calculateDCFTraditional({ revenue, netIncome, fcf, revenueGrowth, profitMargin, fcfMargin, peMultiple, pfcfMultiple, discountRate, years, shares, terminalGrowth = 0.03 }) {
    return this.calculateDCFTraditionalDetailed({
      revenue,
      netIncome,
      fcf,
      revenueGrowth,
      profitMargin,
      fcfMargin,
      peMultiple,
      pfcfMultiple,
      discountRate,
      years,
      shares,
      terminalGrowth
    }).fairValue;
  }

  static getCommonValuationMethods(valuations) {
    if (!Array.isArray(valuations) || valuations.length === 0) return [];

    return ['pe', 'pfcf'].filter(method =>
      valuations.every(valuation => valuation?.methodValues?.[method])
    );
  }

  static averageValuationMethods(valuation, methods) {
    const validMethods = methods
      .map(method => valuation.methodValues[method])
      .filter(Boolean);

    if (validMethods.length === 0) {
      return { fairValue: null, futurePrice: null };
    }

    return {
      fairValue: validMethods.reduce((sum, method) => sum + method.fairValue, 0) / validMethods.length,
      futurePrice: validMethods.reduce((sum, method) => sum + method.futurePrice, 0) / validMethods.length
    };
  }

  static formatValuationMethod(method) {
    return method === 'pe' ? 'P/E' : 'P/FCF';
  }

  /**
   * Year-0 per-share cash-flow basis used by the IRR (Current Price Return)
   * calculation to match the two-stage DCF in `calculateDCFTraditionalDetailed`.
   * Averages the EPS and FCF-per-share bases when both are available so the
   * IRR is consistent with the averaged fair value across methods. Falls
   * back to whichever side has data.
   */
  static computeCashFlowBasis(revenue, profitMargin, fcfMargin, netIncome, fcf, shares) {
    if (!shares || shares <= 0) return 0;

    let epsBasis = 0;
    if (revenue && profitMargin !== null && profitMargin !== undefined) {
      epsBasis = (revenue * profitMargin) / shares;
    } else if (netIncome) {
      epsBasis = netIncome / shares;
    }

    let fcfBasis = 0;
    if (revenue && fcfMargin !== null && fcfMargin !== undefined) {
      fcfBasis = (revenue * fcfMargin) / shares;
    } else if (fcf) {
      fcfBasis = fcf / shares;
    }

    if (epsBasis > 0 && fcfBasis > 0) return (epsBasis + fcfBasis) / 2;
    return epsBasis > 0 ? epsBasis : fcfBasis;
  }

  static calculateDCFTraditionalDetailed({ revenue, netIncome, fcf, revenueGrowth, profitMargin, fcfMargin, peMultiple, pfcfMultiple, discountRate, years, shares, terminalGrowth = 0.03, dividendPerShare = 0, buybackRate = 0 }) {
    const methods = [];
    const futurePrices = [];
    const methodValues = {};
    const warnings = [];

    // Ensure discount rate is a valid number and not null/undefined
    // If user enters 15%, it should be 0.15 (already converted by frontend)
    let discount = discountRate;
    if (discount === null || discount === undefined || isNaN(discount)) {
      console.warn(`[DCF] Invalid discount rate provided: ${discountRate}, using default 10%`);
      discount = 0.10;
    }

    // Validate discount rate is reasonable (between 0 and 1000% as decimal, i.e., 0 to 10.0)
    // But don't cap it - let user enter any value they want
    if (discount < 0) {
      console.warn(`[DCF] Negative discount rate ${discount}, using 0%`);
      discount = 0;
    }
    if (discount > 10.0) {
      console.warn(`[DCF] Extremely high discount rate ${(discount*100).toFixed(2)}% - this will produce very low fair values`);
    }

    const projYears = years ?? 10;
    const growth = revenueGrowth ?? 0;
    const hasRevenue = revenue !== null && revenue !== undefined && revenue > 0;
    const hasProfitMargin = profitMargin !== null && profitMargin !== undefined && !isNaN(profitMargin);
    const hasFCFMargin = fcfMargin !== null && fcfMargin !== undefined && !isNaN(fcfMargin);

    // Two-stage DCF. Standard textbook formula — matches GuruFocus and EM:
    //
    //   Fair Value = Σ_{t=1..N} [ EPS_t / (1+r)^t ]     ← Stage 1: PV of earnings stream
    //              + (EPS_N × multiple) / (1+r)^N        ← Stage 2: PV of terminal stock price
    //
    // Where EPS_t = EPS_0 × (1+g)^t and EPS_0 = current_revenue × user_margin / shares.
    //
    // Our previous formula only computed Stage 2 (PV of terminal stock price)
    // and ignored Stage 1 (the value of the earnings stream during the
    // projection years). That left a ~$70+/share hole vs. textbook DCF tools,
    // which is the entire reason AMZN was showing $150 when GuruFocus/EM
    // both produced $242 from the same assumptions.
    //
    // Shares are held at current count (no buyback adjustment): treating
    // earnings as the cash-flow stream already captures the value of
    // share-count reduction by counting full earnings as available to
    // shareholders. Adding a buyback adjustment on top would double-count.

    const discountFactor = Math.pow(1 + discount, projYears);
    const growthFactor = Math.pow(1 + growth, projYears);
    console.log(`[DCF] Two-stage DCF calculation:`, {
      revenue, netIncome, fcf, shares, growth, discount, projYears
    });
    console.log(`[DCF] Discount factor for year ${projYears}: (1 + ${(discount*100).toFixed(2)}%)^${projYears} = ${discountFactor.toFixed(4)}`);

    // Geometric sum of (1+g)/(1+r) for t=1..N — used by both methods for Stage 1.
    const streamRatio = (1 + growth) / (1 + discount);
    let streamSum;
    if (Math.abs(streamRatio - 1) < 1e-9) {
      streamSum = projYears; // r = g exactly — sum is just N
    } else {
      streamSum = streamRatio * (Math.pow(streamRatio, projYears) - 1) / (streamRatio - 1);
    }
    console.log(`[DCF] Stage 1 stream multiplier (sum of (1+g/1+r)^t for t=1..${projYears}): ${streamSum.toFixed(4)}`);

    // Method 1: P/FCF
    if (shares && pfcfMultiple && ((fcf && fcf > 0) || (hasRevenue && hasFCFMargin))) {
      // Year-0 FCF per share — what the company would earn per share now at
      // the user's assumed FCF margin (or current FCF/share if no margin).
      let baseFCFPerShare;
      if (hasRevenue && hasFCFMargin) {
        baseFCFPerShare = (revenue * fcfMargin) / shares;
        console.log(`[DCF] P/FCF base: revenue $${(revenue/1e9).toFixed(2)}B × ${(fcfMargin*100).toFixed(2)}% margin / ${(shares/1e9).toFixed(2)}B shares = $${baseFCFPerShare.toFixed(2)}/sh`);
      } else {
        baseFCFPerShare = fcf / shares;
        console.log(`[DCF] P/FCF base: current FCF/share = $${baseFCFPerShare.toFixed(2)}`);
      }

      const stage1FCF = baseFCFPerShare * streamSum;
      const futureFCFPerShare = baseFCFPerShare * growthFactor;
      const futurePriceFCF = futureFCFPerShare * pfcfMultiple;
      const stage2FCF = futurePriceFCF / discountFactor;
      const fairValueFCF = stage1FCF + stage2FCF;

      console.log(`[DCF] P/FCF method: Stage 1 $${stage1FCF.toFixed(2)} + Stage 2 $${stage2FCF.toFixed(2)} = $${fairValueFCF.toFixed(2)}  (futurePrice=$${futurePriceFCF.toFixed(2)})`);

      if (fairValueFCF > 0 && isFinite(fairValueFCF)) {
        methods.push(fairValueFCF);
        futurePrices.push(futurePriceFCF);
        methodValues.pfcf = {
          fairValue: fairValueFCF,
          futurePrice: futurePriceFCF
        };
      } else {
        warnings.push('P/FCF method excluded because projected free cash flow is not positive.');
        console.warn(`[DCF] P/FCF method produced invalid result: ${fairValueFCF} (not included)`);
      }
    }

    // Method 2: P/E
    if (shares && peMultiple && ((netIncome && netIncome > 0) || (hasRevenue && hasProfitMargin))) {
      let baseEPS;
      if (hasRevenue && hasProfitMargin) {
        baseEPS = (revenue * profitMargin) / shares;
        console.log(`[DCF] P/E base: revenue $${(revenue/1e9).toFixed(2)}B × ${(profitMargin*100).toFixed(2)}% margin / ${(shares/1e9).toFixed(2)}B shares = $${baseEPS.toFixed(2)}/sh`);
      } else {
        baseEPS = netIncome / shares;
        console.log(`[DCF] P/E base: current EPS = $${baseEPS.toFixed(2)}`);
      }

      const stage1PE = baseEPS * streamSum;
      const futureEPS = baseEPS * growthFactor;
      const futurePricePE = futureEPS * peMultiple;
      const stage2PE = futurePricePE / discountFactor;
      const fairValuePE = stage1PE + stage2PE;

      console.log(`[DCF] P/E method: Stage 1 $${stage1PE.toFixed(2)} + Stage 2 $${stage2PE.toFixed(2)} = $${fairValuePE.toFixed(2)}  (futurePrice=$${futurePricePE.toFixed(2)})`);

      if (fairValuePE > 0 && isFinite(fairValuePE)) {
        methods.push(fairValuePE);
        futurePrices.push(futurePricePE);
        methodValues.pe = {
          fairValue: fairValuePE,
          futurePrice: futurePricePE
        };
      } else {
        warnings.push('P/E method excluded because projected earnings are not positive.');
        console.warn(`[DCF] P/E method produced invalid result: ${fairValuePE} (not included)`);
      }
    }
    
    // Average all valid methods
    if (methods.length === 0) {
      console.log(`[DCF] No valid methods - returning null`);
      return { fairValue: null, futurePrice: null, methodValues, warnings };
    }
    
    const avgValue = methods.reduce((sum, v) => sum + v, 0) / methods.length;
    const avgFuturePrice = futurePrices.length > 0
      ? futurePrices.reduce((sum, v) => sum + v, 0) / futurePrices.length
      : null;
    console.log(`[DCF] Average of ${methods.length} methods: $${avgValue.toFixed(2)}`);
    return { fairValue: avgValue, futurePrice: avgFuturePrice, methodValues, warnings };
  }

  /**
   * Annualized IRR if you buy at current price and realize the projected
   * earnings stream plus terminal stock price over N years.
   *
   * Solves for r in (two-stage DCF inversion):
   *   currentPrice = Σ_{t=1..N} [ baseCashFlow × (1+g)^t / (1+r)^t ]
   *                + futurePrice / (1+r)^N
   *
   * baseCashFlow is the year-0 per-share earnings (or FCF) basis that the
   * fair-value calc projects. When omitted (or zero), this collapses to
   * the simpler price-only IRR: r = (futurePrice/currentPrice)^(1/N) - 1.
   *
   * Solved by binary search over r ∈ [-0.5, 1.0]. f(r) is strictly
   * decreasing in r so the search converges cleanly.
   */
  static calculateCurrentPriceReturn(currentPrice, futurePrice, years, options = {}) {
    if (!currentPrice || currentPrice <= 0 || !futurePrice || futurePrice <= 0 || !years || years <= 0) {
      return null;
    }

    // Accept either `cashFlowBasis` (new, two-stage DCF) or `dividendPerShare`
    // (legacy alias from the previous formula). They mean the same thing for
    // this calculation.
    const { cashFlowBasis = 0, dividendPerShare = 0, growthRate = 0 } = options;
    const basis = cashFlowBasis || dividendPerShare || 0;

    if (!basis || basis <= 0) {
      return Math.pow(futurePrice / currentPrice, 1 / years) - 1;
    }

    // f(r) = PV at rate r of (cash-flow stream + terminal price) − currentPrice
    const f = (r) => {
      const ratio = (1 + growthRate) / (1 + r);
      let streamSum;
      if (Math.abs(ratio - 1) < 1e-9) {
        streamSum = years;
      } else {
        streamSum = ratio * (Math.pow(ratio, years) - 1) / (ratio - 1);
      }
      const pv = basis * streamSum + futurePrice / Math.pow(1 + r, years);
      return pv - currentPrice;
    };

    let lo = -0.5;
    let hi = 1.0;
    const fLo = f(lo);
    const fHi = f(hi);

    // Sanity: if both ends have same sign, no root in bracket; fall back to closed-form.
    if ((fLo > 0) === (fHi > 0)) {
      return Math.pow(futurePrice / currentPrice, 1 / years) - 1;
    }

    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const fMid = f(mid);
      if (Math.abs(fMid) < 1e-7) return mid;
      if ((fMid > 0) === (fLo > 0)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  /**
   * Calculate fair value using multiple methods (EverythingMoney approach - SIMPLIFIED)
   *
   * EverythingMoney-style formula for each method:
   * 1. Start with current per-share value (EPS or FCF per share)
   * 2. Grow by revenue growth rate: futureValue = currentValue × (1 + growth)^years
   * 3. Apply exit multiple: futurePrice = futureValue × multiple
   * 4. Discount back to present: fairValue = futurePrice / (1 + discount)^years
   *
   * If margins are provided, they can be used to adjust the growth rate or validate assumptions,
   * but the core calculation grows the per-share values directly.
   *
   * This calculates what you should pay TODAY to achieve your desired return
   * if the stock reaches the projected value in the future.
   */
  static calculateFairValueMultiMethod({ revenue, netIncome, fcf, revenueGrowth, profitMargin, fcfMargin, peMultiple, pfcfMultiple, discountRate, years, shares }) {
    const methods = [];

    // Default values if not provided - but be explicit about null/undefined
    // If user explicitly enters 0, that's valid. Only default if truly null/undefined
    const growth = (revenueGrowth !== null && revenueGrowth !== undefined) ? revenueGrowth : 0;
    const discount = (discountRate !== null && discountRate !== undefined) ? discountRate : 0.10;
    const projYears = (years !== null && years !== undefined) ? years : 10;

    console.log(`[DCF] calculateFairValueMultiMethod inputs (raw):`, {
      revenueGrowth, discountRate, years, peMultiple, pfcfMultiple
    });
    console.log(`[DCF] calculateFairValueMultiMethod inputs (processed):`, {
      revenue, netIncome, fcf, shares, growth, discount, projYears, 
      profitMargin, fcfMargin, peMultiple, pfcfMultiple
    });

    // Method 1: P/E based valuation
    // EverythingMoney approach: grow current EPS directly by growth rate
    // Formula: Fair Value = (Current EPS × (1 + growth)^years × PE) / (1 + discount)^years
    if (netIncome && peMultiple && shares) {
      const currentEPS = netIncome / shares;
      
      // Grow EPS by revenue growth rate (assumes EPS grows at same rate as revenue)
      const growthFactor = Math.pow(1 + growth, projYears);
      const futureEPS = currentEPS * growthFactor;
      
      // Apply exit P/E to get future price
      const futurePrice = futureEPS * peMultiple;
      
      // Discount back to present value to get fair value today
      const discountFactor = Math.pow(1 + discount, projYears);
      const fairValuePE = futurePrice / discountFactor;

      console.log(`[DCF] P/E Method calculation breakdown:`);
      console.log(`  currentEPS=$${currentEPS.toFixed(4)}, growth=${(growth*100).toFixed(2)}%, years=${projYears}`);
      console.log(`  growthFactor=(1+${(growth*100).toFixed(2)}%)^${projYears}=${growthFactor.toFixed(4)}`);
      console.log(`  futureEPS=$${currentEPS.toFixed(4)} × ${growthFactor.toFixed(4)} = $${futureEPS.toFixed(4)}`);
      console.log(`  futurePrice=$${futureEPS.toFixed(4)} × ${peMultiple} = $${futurePrice.toFixed(2)}`);
      console.log(`  discountFactor=(1+${(discount*100).toFixed(2)}%)^${projYears}=${discountFactor.toFixed(4)}`);
      console.log(`  fairValuePE=$${futurePrice.toFixed(2)} / ${discountFactor.toFixed(4)} = $${fairValuePE.toFixed(2)}`);

      if (fairValuePE > 0 && isFinite(fairValuePE)) {
        methods.push(fairValuePE);
      }
    } else {
      console.log(`[DCF] P/E Method skipped: netIncome=${netIncome}, peMultiple=${peMultiple}, shares=${shares}`);
    }

    // Method 2: P/FCF based valuation
    // EverythingMoney approach: grow current FCF per share directly by growth rate
    // Formula: Fair Value = (Current FCF/share × (1 + growth)^years × P/FCF) / (1 + discount)^years
    if (fcf && fcf > 0 && pfcfMultiple && shares) {
      const currentFCFPerShare = fcf / shares;
      
      // Grow FCF per share by revenue growth rate (assumes FCF grows at same rate as revenue)
      const growthFactor = Math.pow(1 + growth, projYears);
      const futureFCFPerShare = currentFCFPerShare * growthFactor;
      
      // Apply exit P/FCF to get future price
      const futurePrice = futureFCFPerShare * pfcfMultiple;
      
      // Discount back to present value
      const discountFactor = Math.pow(1 + discount, projYears);
      const fairValueFCF = futurePrice / discountFactor;

      console.log(`[DCF] P/FCF Method calculation breakdown:`);
      console.log(`  currentFCFPerShare=$${currentFCFPerShare.toFixed(4)}, growth=${(growth*100).toFixed(2)}%, years=${projYears}`);
      console.log(`  growthFactor=(1+${(growth*100).toFixed(2)}%)^${projYears}=${growthFactor.toFixed(4)}`);
      console.log(`  futureFCFPerShare=$${currentFCFPerShare.toFixed(4)} × ${growthFactor.toFixed(4)} = $${futureFCFPerShare.toFixed(4)}`);
      console.log(`  futurePrice=$${futureFCFPerShare.toFixed(4)} × ${pfcfMultiple} = $${futurePrice.toFixed(2)}`);
      console.log(`  discountFactor=(1+${(discount*100).toFixed(2)}%)^${projYears}=${discountFactor.toFixed(4)}`);
      console.log(`  fairValueFCF=$${futurePrice.toFixed(2)} / ${discountFactor.toFixed(4)} = $${fairValueFCF.toFixed(2)}`);

      if (fairValueFCF > 0 && isFinite(fairValueFCF)) {
        methods.push(fairValueFCF);
      }
    } else {
      console.log(`[DCF] P/FCF Method skipped: fcf=${fcf}, pfcfMultiple=${pfcfMultiple}, shares=${shares}`);
    }

    // Average all valid methods
    if (methods.length === 0) {
      console.log(`[DCF] No valid methods - returning null`);
      return null;
    }

    const avgValue = methods.reduce((sum, v) => sum + v, 0) / methods.length;
    console.log(`[DCF] Average of ${methods.length} methods: $${avgValue.toFixed(2)}`);
    return avgValue;
  }

  /**
   * Calculate fair value per share using DCF
   * @param {number} currentFCF - Current free cash flow
   * @param {number} revenueGrowth - Expected revenue growth rate (decimal)
   * @param {number} fcfMargin - Expected FCF margin (decimal)
   * @param {number} discountRate - Required return rate (decimal)
   * @param {number} years - Projection period in years
   * @param {number} terminalGrowth - Terminal growth rate (decimal)
   * @param {number} shares - Shares outstanding
   * @returns {number} Fair value per share
   */
  static calculateFairValue(currentFCF, revenueGrowth, fcfMargin, discountRate, years, terminalGrowth, shares) {
    // If growth rate is provided, use it to project FCF
    // The FCF margin adjustment allows for margin expansion/contraction
    // For simplicity, we use growth rate directly on FCF (assumes margin stays constant)
    // In a more sophisticated model, you'd project revenue then apply margin

    let fcf = Math.abs(currentFCF); // Use absolute value as base
    let presentValueSum = 0;

    // Project FCF for each year and discount to present value
    for (let year = 1; year <= years; year++) {
      // Grow FCF by revenue growth rate
      fcf = fcf * (1 + revenueGrowth);

      // Apply FCF margin adjustment if current margin differs from expected
      // This is a simplified approach - full model would track revenue separately

      // Discount to present value
      const presentValue = fcf / Math.pow(1 + discountRate, year);
      presentValueSum += presentValue;
    }

    // Terminal Value using Gordon Growth Model
    // TV = FCF_final * (1 + g) / (r - g)
    if (discountRate <= terminalGrowth) {
      // Invalid: discount rate must be greater than terminal growth
      // Use a high multiple instead
      const terminalValue = fcf * 15; // P/FCF of 15 as fallback
      const terminalPV = terminalValue / Math.pow(1 + discountRate, years);
      const intrinsicValue = presentValueSum + terminalPV;
      return intrinsicValue / shares;
    }

    const terminalValue = (fcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
    const terminalPV = terminalValue / Math.pow(1 + discountRate, years);

    // Total intrinsic value
    const intrinsicValue = presentValueSum + terminalPV;

    // Fair value per share
    return intrinsicValue / shares;
  }

  /**
   * Save a valuation to the database
   * @param {string} userId - User ID
   * @param {Object} data - Valuation data
   * @returns {Promise<Object>} Saved valuation
   */
  static async saveValuation(userId, data) {
    const query = `
      INSERT INTO stock_valuations (
        user_id, symbol, valuation_date, current_price, shares_outstanding,
        roic_1yr, roic_5yr, roic_10yr,
        revenue_growth_1yr, revenue_growth_5yr, revenue_growth_10yr,
        profit_margin_1yr, profit_margin_5yr, profit_margin_10yr,
        fcf_margin_1yr, fcf_margin_5yr, fcf_margin_10yr,
        pe_ratio, price_to_fcf, current_fcf, current_revenue, current_net_income,
        revenue_growth_low, revenue_growth_medium, revenue_growth_high,
        profit_margin_low, profit_margin_medium, profit_margin_high,
        fcf_margin_low, fcf_margin_medium, fcf_margin_high,
        pe_low, pe_medium, pe_high,
        pfcf_low, pfcf_medium, pfcf_high,
        desired_return_low, desired_return_medium, desired_return_high,
        projection_years,
        fair_value_low, fair_value_medium, fair_value_high,
        notes
      )
      VALUES (
        $1, $2, NOW(), $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30,
        $31, $32, $33,
        $34, $35, $36,
        $37, $38, $39,
        $40,
        $41, $42, $43,
        $44
      )
      RETURNING *
    `;

    // shares_outstanding is BIGINT — Finnhub returns shares in millions and we
    // multiply by 1e6, which can yield tiny floating-point residue (e.g.,
    // 1036160000.0000001). Round to an integer before INSERT.
    const sharesOutstanding = data.shares_outstanding === null || data.shares_outstanding === undefined
      ? null
      : Math.round(Number(data.shares_outstanding));

    const values = [
      userId,
      data.symbol?.toUpperCase(),
      data.current_price,
      sharesOutstanding,
      data.roic_1yr,
      data.roic_5yr,
      data.roic_10yr,
      data.revenue_growth_1yr,
      data.revenue_growth_5yr,
      data.revenue_growth_10yr,
      data.profit_margin_1yr,
      data.profit_margin_5yr,
      data.profit_margin_10yr,
      data.fcf_margin_1yr,
      data.fcf_margin_5yr,
      data.fcf_margin_10yr,
      data.pe_ratio,
      data.price_to_fcf,
      data.current_fcf,
      data.current_revenue,
      data.current_net_income,
      data.revenue_growth_low,
      data.revenue_growth_medium,
      data.revenue_growth_high,
      data.profit_margin_low,
      data.profit_margin_medium,
      data.profit_margin_high,
      data.fcf_margin_low,
      data.fcf_margin_medium,
      data.fcf_margin_high,
      data.pe_low,
      data.pe_medium,
      data.pe_high,
      data.pfcf_low,
      data.pfcf_medium,
      data.pfcf_high,
      data.desired_return_low ?? 0.15,
      data.desired_return_medium ?? 0.12,
      data.desired_return_high ?? 0.10,
      data.projection_years ?? 10,
      data.fair_value_low,
      data.fair_value_medium,
      data.fair_value_high,
      data.notes || null
    ];

    try {
      const result = await db.query(query, values);
      console.log(`[DCF] Saved valuation for ${data.symbol} by user ${userId}`);
      return this.rowToValuation(result.rows[0]);
    } catch (error) {
      console.error(`[DCF] Error saving valuation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get valuations for a user
   * @param {string} userId - User ID
   * @param {string} symbol - Optional symbol filter
   * @returns {Promise<Array>} List of valuations
   */
  static async getValuations(userId, symbol = null) {
    let query = `
      SELECT * FROM stock_valuations
      WHERE user_id = $1
    `;
    const values = [userId];

    if (symbol) {
      query += ` AND symbol = $2`;
      values.push(symbol.toUpperCase());
    }

    query += ` ORDER BY valuation_date DESC`;

    try {
      const result = await db.query(query, values);
      return result.rows.map(row => this.rowToValuation(row));
    } catch (error) {
      console.error(`[DCF] Error fetching valuations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific valuation by ID
   * @param {string} userId - User ID
   * @param {string} valuationId - Valuation ID
   * @returns {Promise<Object|null>} Valuation or null
   */
  static async getValuation(userId, valuationId) {
    const query = `
      SELECT * FROM stock_valuations
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await db.query(query, [valuationId, userId]);
      if (result.rows.length === 0) return null;
      return this.rowToValuation(result.rows[0]);
    } catch (error) {
      console.error(`[DCF] Error fetching valuation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a valuation
   * @param {string} userId - User ID
   * @param {string} valuationId - Valuation ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteValuation(userId, valuationId) {
    const query = `
      DELETE FROM stock_valuations
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    try {
      const result = await db.query(query, [valuationId, userId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`[DCF] Error deleting valuation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert database row to valuation object
   * @param {Object} row - Database row
   * @returns {Object} Valuation object
   */
  static rowToValuation(row) {
    const numberOrNull = (value) => {
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const numberOrDefault = (value, defaultValue) => {
      const parsed = numberOrNull(value);
      return parsed === null ? defaultValue : parsed;
    };
    const intOrNull = (value) => {
      if (value === null || value === undefined) return null;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const intOrDefault = (value, defaultValue) => {
      const parsed = intOrNull(value);
      return parsed === null ? defaultValue : parsed;
    };

    return {
      id: row.id,
      user_id: row.user_id,
      symbol: row.symbol,
      valuation_date: row.valuation_date,
      current_price: numberOrNull(row.current_price),
      shares_outstanding: intOrNull(row.shares_outstanding),

      // Historical metrics
      roic_1yr: numberOrNull(row.roic_1yr),
      roic_5yr: numberOrNull(row.roic_5yr),
      roic_10yr: numberOrNull(row.roic_10yr),
      revenue_growth_1yr: numberOrNull(row.revenue_growth_1yr),
      revenue_growth_5yr: numberOrNull(row.revenue_growth_5yr),
      revenue_growth_10yr: numberOrNull(row.revenue_growth_10yr),
      profit_margin_1yr: numberOrNull(row.profit_margin_1yr),
      profit_margin_5yr: numberOrNull(row.profit_margin_5yr),
      profit_margin_10yr: numberOrNull(row.profit_margin_10yr),
      fcf_margin_1yr: numberOrNull(row.fcf_margin_1yr),
      fcf_margin_5yr: numberOrNull(row.fcf_margin_5yr),
      fcf_margin_10yr: numberOrNull(row.fcf_margin_10yr),
      pe_ratio: numberOrNull(row.pe_ratio),
      price_to_fcf: numberOrNull(row.price_to_fcf),
      current_fcf: numberOrNull(row.current_fcf),
      current_revenue: numberOrNull(row.current_revenue),
      current_net_income: numberOrNull(row.current_net_income),

      // User inputs - Revenue Growth
      revenue_growth_low: numberOrNull(row.revenue_growth_low),
      revenue_growth_medium: numberOrNull(row.revenue_growth_medium),
      revenue_growth_high: numberOrNull(row.revenue_growth_high),

      // User inputs - Profit Margin
      profit_margin_low: numberOrNull(row.profit_margin_low),
      profit_margin_medium: numberOrNull(row.profit_margin_medium),
      profit_margin_high: numberOrNull(row.profit_margin_high),

      // User inputs - FCF Margin
      fcf_margin_low: numberOrNull(row.fcf_margin_low),
      fcf_margin_medium: numberOrNull(row.fcf_margin_medium),
      fcf_margin_high: numberOrNull(row.fcf_margin_high),

      // User inputs - P/E Multiple
      pe_low: numberOrNull(row.pe_low),
      pe_medium: numberOrNull(row.pe_medium),
      pe_high: numberOrNull(row.pe_high),

      // User inputs - P/FCF Multiple
      pfcf_low: numberOrNull(row.pfcf_low),
      pfcf_medium: numberOrNull(row.pfcf_medium),
      pfcf_high: numberOrNull(row.pfcf_high),

      // User inputs - Desired Returns
      desired_return_low: numberOrDefault(row.desired_return_low, 0.15),
      desired_return_medium: numberOrDefault(row.desired_return_medium, 0.12),
      desired_return_high: numberOrDefault(row.desired_return_high, 0.10),

      // DCF parameters (legacy)
      desired_annual_return: numberOrDefault(row.desired_annual_return, 0.15),
      projection_years: intOrDefault(row.projection_years, 10),
      terminal_growth_rate: numberOrDefault(row.terminal_growth_rate, 0.03),

      // Results
      fair_value_low: numberOrNull(row.fair_value_low),
      fair_value_medium: numberOrNull(row.fair_value_medium),
      fair_value_high: numberOrNull(row.fair_value_high),

      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = DCFValuationService;

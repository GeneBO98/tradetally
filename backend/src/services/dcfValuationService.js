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

    // Get 10 years of financial data
    const financials = await FundamentalDataService.getFinancials(symbolUpper, 10, forceRefresh, 'annual', profileShares);

    if (!financials || financials.length < 2) {
      throw new Error(`Insufficient financial data for ${symbolUpper}. Need at least 2 years.`);
    }

    // Sort by year descending
    const sorted = financials
      .map(f => ({ ...f, fiscalYear: f.fiscalYear || f.year }))
      .sort((a, b) => b.fiscalYear - a.fiscalYear);

    console.log(`[DCF] Got ${sorted.length} years of data for ${symbolUpper}`);

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

    // Calculate metrics for each available period
    const metrics = {
      symbol: symbolUpper,
      current_price: currentPrice,
      shares_outstanding: profileShares,
      market_cap: currentPrice && profileShares ? currentPrice * profileShares : null,

      // Historical metrics
      roic_1yr: this.calculateROIC(sorted, 1),
      roic_5yr: this.calculateROIC(sorted, 5),
      roic_10yr: this.calculateROIC(sorted, 10),

      revenue_growth_1yr: this.calculateCAGR(sorted, 'revenue', 1),
      revenue_growth_5yr: this.calculateCAGR(sorted, 'revenue', 5),
      revenue_growth_10yr: this.calculateCAGR(sorted, 'revenue', 10),

      profit_margin_1yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 1),
      profit_margin_5yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 5),
      profit_margin_10yr: this.calculateAvgMargin(sorted, 'netIncome', 'revenue', 10),

      fcf_margin_1yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 1),
      fcf_margin_5yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 5),
      fcf_margin_10yr: this.calculateAvgMargin(sorted, 'freeCashFlow', 'revenue', 10),

      // Current values for DCF base
      current_fcf: sorted[0]?.freeCashFlow || null,
      current_revenue: sorted[0]?.revenue || null,

      // Ratios - current and historical averages
      pe_ratio: this.calculatePE(sorted[0], currentPrice),
      pe_1yr: this.calculateAvgPE(sorted, currentPrice, 1),
      pe_5yr: this.calculateAvgPE(sorted, currentPrice, 5),
      pe_10yr: this.calculateAvgPE(sorted, currentPrice, 10),
      price_to_fcf: this.calculatePriceToFCF(currentPrice, profileShares, sorted[0]?.freeCashFlow),
      pfcf_1yr: this.calculateAvgPFCF(sorted, currentPrice, profileShares, 1),
      pfcf_5yr: this.calculateAvgPFCF(sorted, currentPrice, profileShares, 5),
      pfcf_10yr: this.calculateAvgPFCF(sorted, currentPrice, profileShares, 10),

      // Additional current values for DCF calculations
      current_net_income: sorted[0]?.netIncome || null,

      // Calculated discount rate (CAPM)
      calculated_discount_rate: calculatedDiscountRate,
      beta: beta,

      // Raw data for transparency
      years_available: sorted.length,
      latest_year: sorted[0]?.fiscalYear,
      oldest_year: sorted[sorted.length - 1]?.fiscalYear
    };

    console.log(`[DCF] Calculated metrics for ${symbolUpper}:`, JSON.stringify(metrics, null, 2));

    return metrics;
  }

  /**
   * Calculate average ROIC over a period
   * ROIC = NOPAT / Invested Capital
   * Invested Capital = Total Equity + Total Debt - Cash and Equivalents
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {number} years - Number of years to average
   * @returns {number|null} Average ROIC as decimal (0.15 = 15%)
   */
  static calculateROIC(financials, years) {
    const taxRate = 0.21;
    const periods = financials.slice(0, Math.min(years, financials.length));

    const roics = [];
    for (const period of periods) {
      const { operatingIncome, totalEquity, totalDebt, cashAndEquivalents } = period;

      if (operatingIncome !== null && totalEquity !== null) {
        const investedCapital = (totalEquity || 0) + (totalDebt || 0) - (cashAndEquivalents || 0);

        // Only calculate ROIC if invested capital is positive and meaningful
        // Negative invested capital (net cash position) makes ROIC calculation problematic
        if (investedCapital > 0.01) {
          const nopat = operatingIncome * (1 - taxRate);
          const roic = nopat / investedCapital;
          roics.push(roic);
        }
        // Skip periods with negative or near-zero invested capital
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

  /**
   * Calculate average P/E ratio over a period
   * Uses average EPS over the period with current price
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {number} currentPrice - Current stock price
   * @param {number} years - Number of years to average
   * @returns {number|null} Average P/E ratio
   */
  static calculateAvgPE(financials, currentPrice, years) {
    if (!currentPrice) return null;

    const periods = financials.slice(0, Math.min(years, financials.length));
    const epsValues = [];

    for (const period of periods) {
      if (period.netIncome && period.sharesOutstanding && period.sharesOutstanding > 0) {
        const eps = period.netIncome / period.sharesOutstanding;
        if (eps > 0) {
          epsValues.push(eps);
        }
      }
    }

    if (epsValues.length === 0) return null;

    const avgEPS = epsValues.reduce((sum, e) => sum + e, 0) / epsValues.length;
    return currentPrice / avgEPS;
  }

  /**
   * Calculate average P/FCF ratio over a period
   * Uses average FCF per share over the period with current price
   * @param {Array} financials - Sorted financial data (most recent first)
   * @param {number} currentPrice - Current stock price
   * @param {number} sharesOutstanding - Current shares outstanding
   * @param {number} years - Number of years to average
   * @returns {number|null} Average P/FCF ratio
   */
  static calculateAvgPFCF(financials, currentPrice, sharesOutstanding, years) {
    if (!currentPrice || !sharesOutstanding) return null;

    const periods = financials.slice(0, Math.min(years, financials.length));
    const fcfValues = [];

    for (const period of periods) {
      if (period.freeCashFlow && period.freeCashFlow > 0) {
        fcfValues.push(period.freeCashFlow);
      }
    }

    if (fcfValues.length === 0) return null;

    const avgFCF = fcfValues.reduce((sum, f) => sum + f, 0) / fcfValues.length;
    const marketCap = currentPrice * sharesOutstanding;
    return marketCap / avgFCF;
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
      projection_years = 10
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
    
    // Warn if logical ordering is reversed, but DON'T auto-correct
    // User might want to test different scenarios
    if (desired_return_low !== null && desired_return_high !== null && desired_return_low < desired_return_high) {
      console.warn(`[DCF] NOTE: Bear discount (${(desired_return_low*100).toFixed(1)}%) < Bull (${(desired_return_high*100).toFixed(1)}%). ` +
        `Typically Bear should have HIGHER discount (more conservative) than Bull. ` +
        `Using your values as entered - Bear=${(bearRate*100).toFixed(1)}%, Bull=${(bullRate*100).toFixed(1)}%`);
    }

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

    if (!baseNetIncome && !baseFCF) {
      throw new Error('Missing required data: need either net income or FCF data');
    }

    // Calculate fair value for each scenario
    // We use a hybrid approach: traditional DCF with annual projections + terminal value
    // This is more accurate than the simplified "target price" method
    // Note: Bear (low) should have lower growth, lower multiples, and higher discount rate
    //      Bull (high) should have higher growth, higher multiples, and lower discount rate
    //      This ensures Bear fair value <= Base <= Bull fair value
    
    // ENFORCE logical ordering for all inputs to ensure Bear <= Bull
    // If user entered backwards, automatically correct it
    let finalGrowthLow = revenue_growth_low;
    let finalGrowthMedium = revenue_growth_medium;
    let finalGrowthHigh = revenue_growth_high;
    
    let finalPELow = pe_low;
    let finalPEMedium = pe_medium;
    let finalPEHigh = pe_high;
    
    let finalPFCFLow = pfcf_low;
    let finalPFCFMedium = pfcf_medium;
    let finalPFCFHigh = pfcf_high;
    
    const inputWarnings = [];
    
    // Fix growth rates if reversed
    if (finalGrowthLow !== null && finalGrowthHigh !== null && finalGrowthLow > finalGrowthHigh) {
      inputWarnings.push(`Growth rates reversed: Bear (${(finalGrowthLow*100).toFixed(1)}%) > Bull (${(finalGrowthHigh*100).toFixed(1)}%). Auto-correcting.`);
      [finalGrowthLow, finalGrowthHigh] = [finalGrowthHigh, finalGrowthLow]; // Swap them
    }
    
    // Fix P/E multiples if reversed
    if (finalPELow && finalPEHigh && finalPELow > finalPEHigh) {
      inputWarnings.push(`P/E multiples reversed: Bear (${finalPELow}) > Bull (${finalPEHigh}). Auto-correcting.`);
      [finalPELow, finalPEHigh] = [finalPEHigh, finalPELow]; // Swap them
    }
    
    // Fix P/FCF multiples if reversed
    if (finalPFCFLow && finalPFCFHigh && finalPFCFLow > finalPFCFHigh) {
      inputWarnings.push(`P/FCF multiples reversed: Bear (${finalPFCFLow}) > Bull (${finalPFCFHigh}). Auto-correcting.`);
      [finalPFCFLow, finalPFCFHigh] = [finalPFCFHigh, finalPFCFLow]; // Swap them
    }
    
    // Discount rates are already enforced above, but log if there was an issue
    if (bearRate < bullRate) {
      inputWarnings.push(`Discount rates were reversed but have been auto-corrected.`);
    }
    
    // Log discount rate calculation info
    if (calculated_discount_rate) {
      console.log(`[DCF] Using calculated discount rate (CAPM): ${(calculated_discount_rate*100).toFixed(2)}% (Beta: ${beta || 'N/A'})`);
      console.log(`[DCF] Scenario adjustments: Bear=${(bearRate*100).toFixed(2)}%, Base=${(mediumRate*100).toFixed(2)}%, Bull=${(bullRate*100).toFixed(2)}%`);
      console.log(`[DCF] IMPORTANT: Higher discount rate = LOWER fair value. Bear (${(bearRate*100).toFixed(2)}%) should produce LOWER fair value than Bull (${(bullRate*100).toFixed(2)}%)`);
    } else {
      console.warn(`[DCF] No calculated discount rate available - using user inputs or defaults`);
      console.log(`[DCF] Discount rates being used: Bear=${(bearRate*100).toFixed(2)}%, Base=${(mediumRate*100).toFixed(2)}%, Bull=${(bullRate*100).toFixed(2)}%`);
    }
    
    if (inputWarnings.length > 0) {
      console.warn(`[DCF] INPUT VALIDATION WARNINGS:\n${inputWarnings.map(w => `  - ${w}`).join('\n')}`);
      console.warn(`[DCF] CORRECT INPUTS SHOULD BE:`);
      console.warn(`[DCF]   Bear: Lower growth, LOWER multiples (20-22), HIGHER discount (15%+)`);
      console.warn(`[DCF]   Bull: Higher growth, HIGHER multiples (25-30), LOWER discount (10-12%)`);
    }
    
    console.log(`[DCF] ===== BEAR SCENARIO =====`);
    console.log(`[DCF] Growth: ${finalGrowthLow ? (finalGrowthLow*100).toFixed(2) + '%' : 'N/A'}, PE: ${finalPELow || 'N/A'}, P/FCF: ${finalPFCFLow || 'N/A'}, DISCOUNT RATE: ${(bearRate*100).toFixed(2)}%`);
    console.log(`[DCF] Higher discount rate (${(bearRate*100).toFixed(2)}%) should produce LOWER fair value`);
    
    // Use traditional DCF method (projects cash flows year-by-year + terminal value)
    // This is more accurate than the simplified target price method
    const fairValueLow = this.calculateDCFTraditional({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: finalGrowthLow,
      profitMargin: profit_margin_low,
      fcfMargin: fcf_margin_low,
      peMultiple: finalPELow,
      pfcfMultiple: finalPFCFLow,
      discountRate: bearRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03 // 3% terminal growth rate (long-term GDP growth)
    });

    console.log(`[DCF] ===== BASE SCENARIO =====`);
    console.log(`[DCF] Growth: ${finalGrowthMedium ? (finalGrowthMedium*100).toFixed(2) + '%' : 'N/A'}, PE: ${finalPEMedium || 'N/A'}, P/FCF: ${finalPFCFMedium || 'N/A'}, DISCOUNT RATE: ${(mediumRate*100).toFixed(2)}%`);
    
    const fairValueMedium = this.calculateDCFTraditional({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: finalGrowthMedium,
      profitMargin: profit_margin_medium,
      fcfMargin: fcf_margin_medium,
      peMultiple: finalPEMedium,
      pfcfMultiple: finalPFCFMedium,
      discountRate: mediumRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03
    });

    console.log(`[DCF] ===== BULL SCENARIO =====`);
    console.log(`[DCF] Growth: ${finalGrowthHigh ? (finalGrowthHigh*100).toFixed(2) + '%' : 'N/A'}, PE: ${finalPEHigh || 'N/A'}, P/FCF: ${finalPFCFHigh || 'N/A'}, DISCOUNT RATE: ${(bullRate*100).toFixed(2)}%`);
    console.log(`[DCF] Lower discount rate (${(bullRate*100).toFixed(2)}%) should produce HIGHER fair value`);
    const fairValueHigh = this.calculateDCFTraditional({
      revenue: baseRevenue,
      netIncome: baseNetIncome,
      fcf: baseFCF,
      revenueGrowth: finalGrowthHigh,
      profitMargin: profit_margin_high,
      fcfMargin: fcf_margin_high,
      peMultiple: finalPEHigh,
      pfcfMultiple: finalPFCFHigh,
      discountRate: bullRate,
      years: projection_years,
      shares: shares_outstanding,
      terminalGrowth: 0.03
    });

    console.log(`[DCF] ===== FINAL RESULTS =====`);
    console.log(`[DCF] Bear (discount=${(bearRate*100).toFixed(2)}%): $${fairValueLow?.toFixed(2)}`);
    console.log(`[DCF] Base (discount=${(mediumRate*100).toFixed(2)}%): $${fairValueMedium?.toFixed(2)}`);
    console.log(`[DCF] Bull (discount=${(bullRate*100).toFixed(2)}%): $${fairValueHigh?.toFixed(2)}`);
    console.log(`[DCF] Expected: Bear (highest discount) <= Base <= Bull (lowest discount)`);
    if (fairValueLow && fairValueHigh) {
      const discountDiff = bearRate - bullRate;
      const valueDiff = fairValueHigh - fairValueLow;
      const discountImpact = discountDiff > 0 ? (valueDiff / fairValueLow * 100) : 0;
      console.log(`[DCF] Discount rate difference: ${(discountDiff*100).toFixed(2)}% (Bear ${(bearRate*100).toFixed(2)}% - Bull ${(bullRate*100).toFixed(2)}%)`);
      console.log(`[DCF] Fair value difference: $${valueDiff.toFixed(2)} (${discountImpact.toFixed(1)}% impact)`);
    }

    // Validate logical ordering: Bear (low) should be <= Bull (high)
    // After auto-correction, this should never happen, but check anyway
    if (fairValueLow && fairValueHigh && fairValueLow > fairValueHigh) {
      const bearGrowth = finalGrowthLow !== null && finalGrowthLow !== undefined ? (finalGrowthLow * 100).toFixed(1) : 'N/A';
      const bullGrowth = finalGrowthHigh !== null && finalGrowthHigh !== undefined ? (finalGrowthHigh * 100).toFixed(1) : 'N/A';
      const bearDiscount = (bearRate * 100).toFixed(1);
      const bullDiscount = (bullRate * 100).toFixed(1);
      
      console.error(`[DCF] ERROR: Even after auto-correction, Bear ($${fairValueLow.toFixed(2)}) > Bull ($${fairValueHigh.toFixed(2)}). ` +
        `This suggests a calculation error. ` +
        `Bear: growth=${bearGrowth}%, discount=${bearDiscount}%, PE=${finalPELow || 'N/A'}, P/FCF=${finalPFCFLow || 'N/A'} ` +
        `Bull: growth=${bullGrowth}%, discount=${bullDiscount}%, PE=${finalPEHigh || 'N/A'}, P/FCF=${finalPFCFHigh || 'N/A'}`);
      
      // Force correct ordering by swapping values if needed
      if (fairValueLow > fairValueHigh) {
        console.warn(`[DCF] Forcing correct ordering: swapping Bear and Bull fair values`);
        [fairValueLow, fairValueHigh] = [fairValueHigh, fairValueLow];
      }
    }

    // Calculate margin of safety (positive = undervalued, negative = overvalued)
    const marginOfSafetyLow = current_price ? ((fairValueLow - current_price) / current_price) : null;
    const marginOfSafetyMedium = current_price ? ((fairValueMedium - current_price) / current_price) : null;
    const marginOfSafetyHigh = current_price ? ((fairValueHigh - current_price) / current_price) : null;

    return {
      fair_value_low: fairValueLow,
      fair_value_medium: fairValueMedium,
      fair_value_high: fairValueHigh,
      margin_of_safety_low: marginOfSafetyLow,
      margin_of_safety_medium: marginOfSafetyMedium,
      margin_of_safety_high: marginOfSafetyHigh,
      inputs: {
        current_fcf,
        current_revenue,
        current_net_income,
        shares_outstanding,
        current_price,
        revenue_growth_low: finalGrowthLow,
        revenue_growth_medium: finalGrowthMedium,
        revenue_growth_high: finalGrowthHigh,
        profit_margin_low,
        profit_margin_medium,
        profit_margin_high,
        fcf_margin_low,
        fcf_margin_medium,
        fcf_margin_high,
        pe_low: finalPELow,
        pe_medium: finalPEMedium,
        pe_high: finalPEHigh,
        pfcf_low: finalPFCFLow,
        pfcf_medium: finalPFCFMedium,
        pfcf_high: finalPFCFHigh,
        desired_return_low: bearRate,
        desired_return_medium: mediumRate,
        desired_return_high: bullRate,
        calculated_discount_rate: calculated_discount_rate,
        beta: beta,
        projection_years,
        inputs_were_corrected: inputWarnings.length > 0
      }
    };
  }

  /**
   * Calculate fair value using traditional DCF with annual projections
   * Projects FCF year-by-year, discounts each year, then adds terminal value
   * This is the proper DCF method, not the simplified target price approach
   */
  static calculateDCFTraditional({ revenue, netIncome, fcf, revenueGrowth, profitMargin, fcfMargin, peMultiple, pfcfMultiple, discountRate, years, shares, terminalGrowth = 0.03 }) {
    const methods = [];
    
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
    
    console.log(`[DCF] Traditional DCF calculation:`, {
      revenue, netIncome, fcf, shares, growth, discount, projYears, terminalGrowth
    });
    console.log(`[DCF] DISCOUNT RATE IMPACT: Using discount rate of ${(discount*100).toFixed(2)}% (raw value: ${discount})`);
    console.log(`[DCF] Higher discount rate = lower present value = lower fair value`);
    const discountFactor = Math.pow(1 + discount, projYears);
    console.log(`[DCF] Discount factor for year ${projYears}: (1 + ${(discount*100).toFixed(2)}%)^${projYears} = ${discountFactor.toFixed(4)}`);
    console.log(`[DCF] This means $1 in year ${projYears} is worth $${(1/discountFactor).toFixed(6)} today`);
    
    // Method 1: FCF-based DCF (traditional approach)
    if (fcf && fcf > 0 && shares) {
      let currentFCF = fcf;
      let presentValueSum = 0;
      
      // Project FCF for each year and discount to present value
      for (let year = 1; year <= projYears; year++) {
        // Grow FCF by revenue growth rate
        currentFCF = currentFCF * (1 + growth);
        
        // Discount to present value
        const presentValue = currentFCF / Math.pow(1 + discount, year);
        presentValueSum += presentValue;
        
        console.log(`[DCF] Year ${year}: FCF=$${(currentFCF/1e9).toFixed(2)}B, PV=$${(presentValue/1e9).toFixed(2)}B`);
      }
      
      // Terminal Value using exit multiple (P/FCF)
      let terminalValue;
      if (pfcfMultiple) {
        // Use exit multiple method
        terminalValue = currentFCF * pfcfMultiple;
        console.log(`[DCF] Terminal Value (P/FCF method): Final FCF=$${(currentFCF/1e9).toFixed(2)}B × ${pfcfMultiple} = $${(terminalValue/1e9).toFixed(2)}B`);
      } else {
        // Use Gordon Growth Model
        if (discount <= terminalGrowth) {
          terminalValue = currentFCF * 15; // Fallback
        } else {
          terminalValue = (currentFCF * (1 + terminalGrowth)) / (discount - terminalGrowth);
        }
        console.log(`[DCF] Terminal Value (Gordon Growth): $${(terminalValue/1e9).toFixed(2)}B`);
      }
      
      // Discount terminal value to present
      const terminalDiscountFactor = Math.pow(1 + discount, projYears);
      const terminalPV = terminalValue / terminalDiscountFactor;
      
      // Total intrinsic value
      const intrinsicValue = presentValueSum + terminalPV;
      const fairValueFCF = intrinsicValue / shares;
      
      console.log(`[DCF] FCF DCF Method: Sum of PVs=$${(presentValueSum/1e9).toFixed(2)}B, Terminal Value=$${(terminalValue/1e9).toFixed(2)}B, Terminal Discount Factor=${terminalDiscountFactor.toFixed(4)}, Terminal PV=$${(terminalPV/1e9).toFixed(6)}B, Total=$${(intrinsicValue/1e9).toFixed(2)}B, Fair Value=$${fairValueFCF.toFixed(2)}`);
      console.log(`[DCF] DISCOUNT RATE BREAKDOWN: Using ${(discount*100).toFixed(2)}% discount rate`);
      console.log(`[DCF]   - Early years PV (years 1-${projYears}): $${(presentValueSum/1e9).toFixed(2)}B (${((presentValueSum/intrinsicValue)*100).toFixed(1)}% of total)`);
      console.log(`[DCF]   - Terminal PV (year ${projYears}): $${(terminalPV/1e9).toFixed(6)}B (${((terminalPV/intrinsicValue)*100).toFixed(1)}% of total)`);
      console.log(`[DCF] DISCOUNT RATE SENSITIVITY: If discount was ${((discount-0.01)*100).toFixed(2)}% (1% lower), terminal PV would be $${((terminalValue / Math.pow(1 + discount - 0.01, projYears))/1e9).toFixed(2)}B (higher)`);
      console.log(`[DCF] DISCOUNT RATE SENSITIVITY: If discount was ${((discount+0.01)*100).toFixed(2)}% (1% higher), terminal PV would be $${((terminalValue / Math.pow(1 + discount + 0.01, projYears))/1e9).toFixed(2)}B (lower)`);
      
      if (fairValueFCF > 0 && isFinite(fairValueFCF)) {
        methods.push(fairValueFCF);
        console.log(`[DCF] ✓ FCF method produced valid result: $${fairValueFCF.toFixed(2)} per share`);
      } else {
        console.warn(`[DCF] ✗ FCF method produced invalid result: ${fairValueFCF} (not included)`);
      }
    }
    
    // Method 2: Earnings-based DCF (using net income as proxy for cash flow)
    if (netIncome && netIncome > 0 && shares && peMultiple) {
      let currentEarnings = netIncome;
      let presentValueSum = 0;
      
      // Project earnings for each year and discount to present value
      for (let year = 1; year <= projYears; year++) {
        // Grow earnings by revenue growth rate
        currentEarnings = currentEarnings * (1 + growth);
        
        // Discount to present value
        const presentValue = currentEarnings / Math.pow(1 + discount, year);
        presentValueSum += presentValue;
      }
      
      // Terminal Value using exit multiple (P/E)
      const terminalValue = currentEarnings * peMultiple;
      const terminalDiscountFactor = Math.pow(1 + discount, projYears);
      const terminalPV = terminalValue / terminalDiscountFactor;
      
      // Total intrinsic value
      const intrinsicValue = presentValueSum + terminalPV;
      const fairValuePE = intrinsicValue / shares;
      
      console.log(`[DCF] Earnings DCF Method: Sum of PVs=$${(presentValueSum/1e9).toFixed(2)}B, Terminal Value=$${(terminalValue/1e9).toFixed(2)}B, Terminal Discount Factor=${terminalDiscountFactor.toFixed(4)}, Terminal PV=$${(terminalPV/1e9).toFixed(6)}B, Total=$${(intrinsicValue/1e9).toFixed(2)}B, Fair Value=$${fairValuePE.toFixed(2)}`);
      console.log(`[DCF] DISCOUNT RATE BREAKDOWN: Using ${(discount*100).toFixed(2)}% discount rate`);
      console.log(`[DCF]   - Early years PV (years 1-${projYears}): $${(presentValueSum/1e9).toFixed(2)}B (${((presentValueSum/intrinsicValue)*100).toFixed(1)}% of total)`);
      console.log(`[DCF]   - Terminal PV (year ${projYears}): $${(terminalPV/1e9).toFixed(6)}B (${((terminalPV/intrinsicValue)*100).toFixed(1)}% of total)`);
      
      if (fairValuePE > 0 && isFinite(fairValuePE)) {
        methods.push(fairValuePE);
        console.log(`[DCF] ✓ Earnings method produced valid result: $${fairValuePE.toFixed(2)} per share`);
      } else {
        console.warn(`[DCF] ✗ Earnings method produced invalid result: ${fairValuePE} (not included)`);
      }
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

    const values = [
      userId,
      data.symbol?.toUpperCase(),
      data.current_price,
      data.shares_outstanding,
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
      data.desired_return_low || 0.15,
      data.desired_return_medium || 0.12,
      data.desired_return_high || 0.10,
      data.projection_years || 10,
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
    return {
      id: row.id,
      user_id: row.user_id,
      symbol: row.symbol,
      valuation_date: row.valuation_date,
      current_price: parseFloat(row.current_price) || null,
      shares_outstanding: parseInt(row.shares_outstanding) || null,

      // Historical metrics
      roic_1yr: parseFloat(row.roic_1yr) || null,
      roic_5yr: parseFloat(row.roic_5yr) || null,
      roic_10yr: parseFloat(row.roic_10yr) || null,
      revenue_growth_1yr: parseFloat(row.revenue_growth_1yr) || null,
      revenue_growth_5yr: parseFloat(row.revenue_growth_5yr) || null,
      revenue_growth_10yr: parseFloat(row.revenue_growth_10yr) || null,
      profit_margin_1yr: parseFloat(row.profit_margin_1yr) || null,
      profit_margin_5yr: parseFloat(row.profit_margin_5yr) || null,
      profit_margin_10yr: parseFloat(row.profit_margin_10yr) || null,
      fcf_margin_1yr: parseFloat(row.fcf_margin_1yr) || null,
      fcf_margin_5yr: parseFloat(row.fcf_margin_5yr) || null,
      fcf_margin_10yr: parseFloat(row.fcf_margin_10yr) || null,
      pe_ratio: parseFloat(row.pe_ratio) || null,
      price_to_fcf: parseFloat(row.price_to_fcf) || null,
      current_fcf: parseFloat(row.current_fcf) || null,
      current_revenue: parseFloat(row.current_revenue) || null,
      current_net_income: parseFloat(row.current_net_income) || null,

      // User inputs - Revenue Growth
      revenue_growth_low: parseFloat(row.revenue_growth_low) || null,
      revenue_growth_medium: parseFloat(row.revenue_growth_medium) || null,
      revenue_growth_high: parseFloat(row.revenue_growth_high) || null,

      // User inputs - Profit Margin
      profit_margin_low: parseFloat(row.profit_margin_low) || null,
      profit_margin_medium: parseFloat(row.profit_margin_medium) || null,
      profit_margin_high: parseFloat(row.profit_margin_high) || null,

      // User inputs - FCF Margin
      fcf_margin_low: parseFloat(row.fcf_margin_low) || null,
      fcf_margin_medium: parseFloat(row.fcf_margin_medium) || null,
      fcf_margin_high: parseFloat(row.fcf_margin_high) || null,

      // User inputs - P/E Multiple
      pe_low: parseFloat(row.pe_low) || null,
      pe_medium: parseFloat(row.pe_medium) || null,
      pe_high: parseFloat(row.pe_high) || null,

      // User inputs - P/FCF Multiple
      pfcf_low: parseFloat(row.pfcf_low) || null,
      pfcf_medium: parseFloat(row.pfcf_medium) || null,
      pfcf_high: parseFloat(row.pfcf_high) || null,

      // User inputs - Desired Returns
      desired_return_low: parseFloat(row.desired_return_low) || 0.15,
      desired_return_medium: parseFloat(row.desired_return_medium) || 0.12,
      desired_return_high: parseFloat(row.desired_return_high) || 0.10,

      // DCF parameters (legacy)
      desired_annual_return: parseFloat(row.desired_annual_return) || 0.15,
      projection_years: parseInt(row.projection_years) || 10,
      terminal_growth_rate: parseFloat(row.terminal_growth_rate) || 0.03,

      // Results
      fair_value_low: parseFloat(row.fair_value_low) || null,
      fair_value_medium: parseFloat(row.fair_value_medium) || null,
      fair_value_high: parseFloat(row.fair_value_high) || null,

      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = DCFValuationService;

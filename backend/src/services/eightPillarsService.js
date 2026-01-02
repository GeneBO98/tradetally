/**
 * Eight Pillars Stock Analysis Service
 * Implements Paul Gabrail's 8 Pillars methodology for value investing analysis
 *
 * The 8 Pillars:
 * 1. 5-Year P/E Ratio (< 22.5)
 * 2. 5-Year ROIC (higher = better)
 * 3. Shares Outstanding (decreasing = pass)
 * 4. Cash Flow Growth (TTM > 5 years ago)
 * 5. Net Income Growth (TTM > 5 years ago)
 * 6. Revenue Growth (5-year expansion)
 * 7. Long-Term Liabilities / FCF (< 5x)
 * 8. 5-Year Price-to-FCF (< 22.5)
 */

const db = require('../config/database');
const FundamentalDataService = require('./fundamentalDataService');

class EightPillarsService {
  // Thresholds for pass/fail
  static THRESHOLDS = {
    fiveYearPE: 22.5,           // Pillar 1: Market cap / avg annual earnings < 22.5
    ltLiabilitiesRatio: 5.0,    // Pillar 7: LT debt / avg FCF < 5
    priceToFCF: 22.5            // Pillar 8: Market cap / 5-year FCF < 22.5
  };

  /**
   * Analyze a stock using the 8 Pillars methodology
   * @param {string} symbol - Stock symbol
   * @param {boolean} forceRefresh - Force refresh from API
   * @returns {Promise<Object>} Complete 8 Pillars analysis
   */
  static async analyzeStock(symbol, forceRefresh = false) {
    const symbolUpper = symbol.toUpperCase();

    console.log(`[8PILLARS] Analyzing ${symbolUpper}...`);

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.getCachedAnalysis(symbolUpper);
      if (cached) {
        console.log(`[8PILLARS] Using cached analysis for ${symbolUpper}`);
        return cached;
      }
    }

    // Get required data
    const [profile, quote, aggregates, metrics] = await Promise.all([
      FundamentalDataService.getProfile(symbolUpper),
      FundamentalDataService.getQuote(symbolUpper),
      FundamentalDataService.getFiveYearAggregates(symbolUpper),
      FundamentalDataService.getMetrics(symbolUpper)
    ]);

    // Debug profile and metrics
    console.log(`[8PILLARS] Profile for ${symbolUpper}:`, JSON.stringify(profile, null, 2));
    if (metrics && metrics.metric) {
      console.log(`[8PILLARS] Metrics for ${symbolUpper}:`, JSON.stringify(metrics.metric, null, 2));
    }

    if (!aggregates) {
      throw new Error(`Insufficient financial data for ${symbolUpper}`);
    }

    const currentPrice = quote?.c || null;
    const sharesOutstanding = profile?.shareOutstanding
      ? profile.shareOutstanding * 1000000
      : aggregates.current.sharesOutstanding;

    // Calculate market cap from current price * shares outstanding (most accurate)
    // Fall back to profile market cap if price or shares not available
    let marketCap = null;
    if (currentPrice && sharesOutstanding) {
      marketCap = currentPrice * sharesOutstanding;
    } else if (profile?.marketCapitalization) {
      marketCap = profile.marketCapitalization * 1000000; // Finnhub returns in millions
    }

    // Get year-end prices for calculating true 5-year average P/E
    const fiscalYears = aggregates.annualData.map(d => d.fiscalYear);
    const yearEndPrices = await FundamentalDataService.getYearEndPrices(symbolUpper, fiscalYears);

    // Calculate P/E for each year and average them
    const annualPEs = [];
    for (const yearData of aggregates.annualData) {
      const yearEndPrice = yearEndPrices[yearData.fiscalYear];
      if (yearEndPrice && yearData.eps && yearData.eps > 0) {
        const yearPE = yearEndPrice / yearData.eps;
        annualPEs.push({ year: yearData.fiscalYear, pe: yearPE, price: yearEndPrice, eps: yearData.eps });
        console.log(`[8PILLARS] Year ${yearData.fiscalYear} P/E: ${yearPE.toFixed(2)} (Price: $${yearEndPrice.toFixed(2)}, EPS: $${yearData.eps.toFixed(2)})`);
      }
    }

    // Calculate 5-year average P/E (average of each year's P/E ratio)
    const avgPE5Y = annualPEs.length > 0
      ? annualPEs.reduce((sum, d) => sum + d.pe, 0) / annualPEs.length
      : null;

    if (avgPE5Y) {
      console.log(`[8PILLARS] 5-Year Average P/E: ${avgPE5Y.toFixed(2)} (from ${annualPEs.length} years)`);
    }

    // Current P/E for reference
    const currentPE = currentPrice && aggregates.current.netIncome && aggregates.current.sharesOutstanding
      ? currentPrice / (aggregates.current.netIncome / aggregates.current.sharesOutstanding)
      : null;

    const pillar1 = this.calculatePillar1(avgPE5Y, annualPEs, currentPE);
    // Get debt-to-equity ratio from metrics as fallback when debt isn't in financials
    const debtToEquityRatio = metrics?.metric?.['totalDebt/totalEquityAnnual'] || null;
    const pillar2 = this.calculatePillar2(aggregates, debtToEquityRatio);
    const pillar3 = this.calculatePillar3(aggregates.current.sharesOutstanding, aggregates.prior.sharesOutstanding);
    const pillar4 = this.calculatePillar4(aggregates.current.freeCashFlow, aggregates.prior.freeCashFlow);
    const pillar5 = this.calculatePillar5(aggregates.current.netIncome, aggregates.prior.netIncome);
    const pillar6 = this.calculatePillar6(aggregates.current.revenue, aggregates.prior.revenue);
    const pillar7 = this.calculatePillar7(aggregates.current.longTermDebt, aggregates.averages.freeCashFlow);
    const pillar8 = this.calculatePillar8(marketCap, aggregates.fiveYearTotals.freeCashFlow);

    // Count passed pillars
    const pillars = [pillar1, pillar2, pillar3, pillar4, pillar5, pillar6, pillar7, pillar8];
    const pillarsPassed = pillars.filter(p => p.passed).length;

    const analysis = {
      symbol: symbolUpper,
      analysisDate: new Date().toISOString(),
      marketCap,
      currentPrice,
      sharesOutstanding,
      periodsAnalyzed: aggregates.periodsAnalyzed,
      yearsSpan: aggregates.yearsSpan,
      pillars: {
        pillar1,
        pillar2,
        pillar3,
        pillar4,
        pillar5,
        pillar6,
        pillar7,
        pillar8
      },
      pillarsPassed,
      companyName: profile?.name || null,
      industry: profile?.finnhubIndustry || null,
      logo: profile?.logo || null
    };

    // Cache the analysis
    await this.cacheAnalysis(analysis);

    return analysis;
  }

  /**
   * Pillar 1: 5-Year Average P/E Ratio
   * Calculates average of each year's individual P/E ratio (Year-End Price / EPS)
   * This matches how financial sites like discountingcashflows.com calculate it
   */
  static calculatePillar1(avgPE5Y, annualPEs = [], currentPE = null) {
    const name = '5-Year P/E Ratio';
    const threshold = this.THRESHOLDS.fiveYearPE;

    if (!avgPE5Y || avgPE5Y <= 0) {
      return {
        name,
        value: null,
        threshold,
        passed: false,
        description: 'Avg of Annual P/E Ratios',
        reason: 'Insufficient price or earnings data',
        data: {
          annualPEs,
          currentPE: currentPE ? parseFloat(currentPE.toFixed(2)) : null
        }
      };
    }

    const passed = avgPE5Y < threshold;

    return {
      name,
      value: parseFloat(avgPE5Y.toFixed(2)),
      threshold,
      passed,
      description: 'Avg of Annual P/E Ratios',
      data: {
        annualPEs: annualPEs.map(p => ({
          year: p.year,
          pe: parseFloat(p.pe.toFixed(2)),
          price: parseFloat(p.price.toFixed(2)),
          eps: parseFloat(p.eps.toFixed(2))
        })),
        currentPE: currentPE ? parseFloat(currentPE.toFixed(2)) : null
      }
    };
  }

  /**
   * Pillar 2: 5-Year Average ROIC (Return on Invested Capital)
   * Calculates ROIC for each year and averages them
   * ROIC = NOPAT / Invested Capital
   * Where NOPAT = Operating Income × (1 - Tax Rate)
   * And Invested Capital = Total Debt + Total Equity - Cash
   */
  static calculatePillar2(aggregates, debtToEquityRatio = null) {
    const name = '5-Year ROIC';
    const taxRate = 0.21; // Standard US corporate tax rate

    // Calculate ROIC for each year
    // ROIC = NOPAT / Invested Capital
    // Invested Capital = Total Equity + Total Debt - Cash
    const annualROICs = [];

    console.log(`[8PILLARS] ===== ROIC CALCULATION DEBUG =====`);
    console.log(`[8PILLARS] Annual data has ${aggregates.annualData.length} years`);
    console.log(`[8PILLARS] Debt-to-Equity ratio from metrics: ${debtToEquityRatio}`);

    for (const yearData of aggregates.annualData) {
      const { fiscalYear, operatingIncome, totalEquity, totalDebt, cashAndEquivalents } = yearData;

      console.log(`[8PILLARS] Year ${fiscalYear} raw data:`);
      console.log(`[8PILLARS]   operatingIncome: ${operatingIncome}`);
      console.log(`[8PILLARS]   totalEquity: ${totalEquity}`);
      console.log(`[8PILLARS]   totalDebt: ${totalDebt}`);
      console.log(`[8PILLARS]   cashAndEquivalents: ${cashAndEquivalents}`);

      // Need both operating income and equity
      if (operatingIncome && operatingIncome > 0 && totalEquity) {
        // If debt is null but we have debt-to-equity ratio, calculate debt
        let effectiveDebt = totalDebt;
        if ((effectiveDebt === null || effectiveDebt === undefined) && debtToEquityRatio && totalEquity) {
          effectiveDebt = totalEquity * debtToEquityRatio;
          console.log(`[8PILLARS]   Calculated debt from D/E ratio: ${effectiveDebt} = ${totalEquity} * ${debtToEquityRatio}`);
        }

        // Invested Capital = Equity + Debt - Cash (standard formula)
        const investedCapital = (totalEquity || 0) + (effectiveDebt || 0) - (cashAndEquivalents || 0);

        console.log(`[8PILLARS]   investedCapital: ${investedCapital} = ${totalEquity || 0} + ${effectiveDebt || 0} - ${cashAndEquivalents || 0}`);

        if (investedCapital > 0) {
          const nopat = operatingIncome * (1 - taxRate);
          const roic = (nopat / investedCapital) * 100;

          console.log(`[8PILLARS]   NOPAT: ${nopat} = ${operatingIncome} * ${1 - taxRate}`);
          console.log(`[8PILLARS]   ROIC: ${roic.toFixed(2)}% = ${nopat} / ${investedCapital} * 100`);

          annualROICs.push({
            year: fiscalYear,
            roic,
            operatingIncome,
            nopat,
            investedCapital,
            equity: totalEquity,
            debt: effectiveDebt,
            cash: cashAndEquivalents
          });
        } else {
          console.log(`[8PILLARS]   SKIPPED: Invested capital <= 0`);
        }
      } else {
        console.log(`[8PILLARS]   SKIPPED: Missing operatingIncome or equity`);
      }
    }

    console.log(`[8PILLARS] ===== END ROIC DEBUG =====`);

    if (annualROICs.length === 0) {
      return {
        name,
        value: null,
        passed: false,
        description: 'Avg of Annual ROIC',
        reason: 'Insufficient operating income or capital data'
      };
    }

    // Calculate average ROIC
    const avgROIC = annualROICs.reduce((sum, d) => sum + d.roic, 0) / annualROICs.length;

    // ROIC is better when higher, but there's no fixed threshold
    // Generally > 10% is considered good, > 15% is excellent
    const passed = avgROIC > 10;

    return {
      name,
      value: parseFloat(avgROIC.toFixed(2)),
      passed,
      description: 'Avg of Annual ROIC',
      displayValue: `${avgROIC.toFixed(1)}%`,
      data: {
        annualROICs: annualROICs.map(r => ({
          year: r.year,
          roic: parseFloat(r.roic.toFixed(2)),
          operatingIncome: r.operatingIncome,
          investedCapital: r.investedCapital
        })),
        taxRate: parseFloat((taxRate * 100).toFixed(1))
      }
    };
  }

  /**
   * Pillar 3: Shares Outstanding Trend
   * Current shares vs 5 years ago - decreasing is better
   */
  static calculatePillar3(currentShares, priorShares) {
    const name = 'Shares Outstanding';

    if (!currentShares || !priorShares) {
      return {
        name,
        value: null,
        passed: false,
        description: 'Current vs 5 Years Ago',
        reason: 'Shares data not available'
      };
    }

    const changePercent = ((currentShares - priorShares) / priorShares) * 100;
    const passed = changePercent <= 0; // Decreasing or stable = pass

    return {
      name,
      value: parseFloat(changePercent.toFixed(2)),
      passed,
      description: 'Current vs 5 Years Ago',
      displayValue: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`,
      trend: changePercent < 0 ? 'decreasing' : changePercent > 0 ? 'increasing' : 'stable',
      data: { currentShares, priorShares }
    };
  }

  /**
   * Pillar 4: Cash Flow Growth
   * TTM Free Cash Flow > FCF from 5 years ago
   */
  static calculatePillar4(currentFCF, priorFCF) {
    const name = 'Cash Flow Growth';

    if (currentFCF === null || currentFCF === undefined ||
        priorFCF === null || priorFCF === undefined) {
      return {
        name,
        value: null,
        passed: false,
        description: 'TTM FCF vs 5 Years Ago',
        reason: 'FCF data not available'
      };
    }

    const passed = currentFCF > priorFCF;
    
    // Calculate growth percentage correctly
    // If prior is negative and current is positive, that's infinite growth (pass)
    // If both are negative, calculate the improvement
    // If prior is zero, growth is undefined
    let growthPercent = null;
    if (priorFCF === 0) {
      growthPercent = currentFCF > 0 ? null : null; // Can't calculate % change from zero
    } else if (priorFCF < 0 && currentFCF > 0) {
      growthPercent = null; // Infinite improvement, can't express as percentage
    } else {
      growthPercent = ((currentFCF - priorFCF) / priorFCF) * 100;
    }

    return {
      name,
      value: growthPercent !== null ? parseFloat(growthPercent.toFixed(2)) : null,
      passed,
      description: 'TTM FCF vs 5 Years Ago',
      displayValue: growthPercent !== null ? `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%` : (passed ? 'Improved' : 'Declined'),
      data: { currentFCF, priorFCF }
    };
  }

  /**
   * Pillar 5: Net Income Growth
   * TTM Net Income > Net Income from 5 years ago
   */
  static calculatePillar5(currentIncome, priorIncome) {
    const name = 'Net Income Growth';

    if (currentIncome === null || currentIncome === undefined ||
        priorIncome === null || priorIncome === undefined) {
      return {
        name,
        value: null,
        passed: false,
        description: 'TTM Net Income vs 5 Years Ago',
        reason: 'Net income data not available'
      };
    }

    const passed = currentIncome > priorIncome;
    
    // Calculate growth percentage correctly
    // If prior is negative and current is positive, that's infinite growth (pass)
    // If both are negative, calculate the improvement
    // If prior is zero, growth is undefined
    let growthPercent = null;
    if (priorIncome === 0) {
      growthPercent = currentIncome > 0 ? null : null; // Can't calculate % change from zero
    } else if (priorIncome < 0 && currentIncome > 0) {
      growthPercent = null; // Infinite improvement, can't express as percentage
    } else {
      growthPercent = ((currentIncome - priorIncome) / priorIncome) * 100;
    }

    return {
      name,
      value: growthPercent !== null ? parseFloat(growthPercent.toFixed(2)) : null,
      passed,
      description: 'TTM Net Income vs 5 Years Ago',
      displayValue: growthPercent !== null ? `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%` : (passed ? 'Improved' : 'Declined'),
      data: { currentIncome, priorIncome }
    };
  }

  /**
   * Pillar 6: Revenue Growth
   * 5-year revenue expansion
   */
  static calculatePillar6(currentRevenue, priorRevenue) {
    const name = 'Revenue Growth';

    if (currentRevenue === null || currentRevenue === undefined ||
        priorRevenue === null || priorRevenue === undefined) {
      return {
        name,
        value: null,
        passed: false,
        description: '5-Year Revenue Expansion',
        reason: 'Revenue data not available'
      };
    }

    const passed = currentRevenue > priorRevenue;
    
    // Calculate growth percentage - handle edge cases
    let growthPercent = null;
    if (priorRevenue === 0) {
      growthPercent = null; // Can't calculate % change from zero
    } else if (priorRevenue < 0) {
      // Very rare case of negative revenue, handle similarly to other pillars
      if (currentRevenue > 0) {
        growthPercent = null; // Infinite improvement
      } else {
        growthPercent = ((currentRevenue - priorRevenue) / priorRevenue) * 100;
      }
    } else {
      growthPercent = ((currentRevenue - priorRevenue) / priorRevenue) * 100;
    }

    return {
      name,
      value: growthPercent !== null ? parseFloat(growthPercent.toFixed(2)) : null,
      passed,
      description: '5-Year Revenue Expansion',
      displayValue: growthPercent !== null ? `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%` : (passed ? 'Improved' : 'Declined'),
      data: { currentRevenue, priorRevenue }
    };
  }

  /**
   * Pillar 7: Long-Term Liabilities / FCF Ratio
   * LT Debt / Average 5-Year FCF < 5
   */
  static calculatePillar7(longTermDebt, avgFCF) {
    const name = 'LT Debt / FCF';
    const threshold = this.THRESHOLDS.ltLiabilitiesRatio;

    if (!longTermDebt || !avgFCF || avgFCF <= 0) {
      // If no debt, that's actually a pass
      if (longTermDebt === 0) {
        return {
          name,
          value: 0,
          threshold,
          passed: true,
          description: 'Long-Term Debt / Avg 5-Year FCF',
          displayValue: '0x (No debt)'
        };
      }

      return {
        name,
        value: null,
        threshold,
        passed: false,
        description: 'Long-Term Debt / Avg 5-Year FCF',
        reason: avgFCF <= 0 ? 'Negative or zero FCF' : 'Debt data not available'
      };
    }

    const ratio = longTermDebt / avgFCF;
    const passed = ratio < threshold;

    return {
      name,
      value: parseFloat(ratio.toFixed(2)),
      threshold,
      passed,
      description: 'Long-Term Debt / Avg 5-Year FCF',
      displayValue: `${ratio.toFixed(1)}x`,
      data: { longTermDebt, avgFCF }
    };
  }

  /**
   * Pillar 8: 5-Year Price-to-Free Cash Flow
   * Market Cap / Average Annual FCF < 22.5
   * Note: The threshold of 22.5 is for annual FCF, so we use average annual FCF, not total 5-year FCF
   */
  static calculatePillar8(marketCap, fiveYearFCF) {
    const name = '5-Year Price/FCF';
    const threshold = this.THRESHOLDS.priceToFCF;

    if (!marketCap || !fiveYearFCF || fiveYearFCF <= 0) {
      return {
        name,
        value: null,
        threshold,
        passed: false,
        description: 'Market Cap / Avg Annual FCF',
        reason: 'Insufficient data or negative FCF'
      };
    }

    // Calculate average annual FCF (total 5-year FCF / 5)
    // The threshold of 22.5 is for annual FCF, so we compare against average annual FCF
    const avgAnnualFCF = fiveYearFCF / 5;
    const value = marketCap / avgAnnualFCF;
    const passed = value < threshold;

    return {
      name,
      value: parseFloat(value.toFixed(2)),
      threshold,
      passed,
      description: 'Market Cap / Avg Annual FCF',
      data: { marketCap, fiveYearFCF, avgAnnualFCF }
    };
  }

  /**
   * Get cached analysis from database
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object|null>} Cached analysis or null
   */
  static async getCachedAnalysis(symbol) {
    const query = `
      SELECT *
      FROM eight_pillars_analysis
      WHERE symbol = $1
        AND analysis_date > NOW() - INTERVAL '24 hours'
      ORDER BY analysis_date DESC
      LIMIT 1
    `;

    try {
      const result = await db.query(query, [symbol.toUpperCase()]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.rowToAnalysis(row);
    } catch (error) {
      console.error(`[8PILLARS] Error fetching cached analysis: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache analysis to database
   * @param {Object} analysis - Analysis object to cache
   */
  static async cacheAnalysis(analysis) {
    const query = `
      INSERT INTO eight_pillars_analysis (
        symbol, analysis_date, market_cap, current_price, shares_outstanding,
        pillar1_value, pillar1_threshold, pillar1_passed, pillar1_data,
        pillar2_value, pillar2_passed, pillar2_data,
        pillar3_current_shares, pillar3_prior_shares, pillar3_change_percent, pillar3_passed, pillar3_data,
        pillar4_fcf_current, pillar4_fcf_prior, pillar4_passed, pillar4_data,
        pillar5_income_current, pillar5_income_prior, pillar5_passed, pillar5_data,
        pillar6_revenue_current, pillar6_revenue_prior, pillar6_growth_percent, pillar6_passed, pillar6_data,
        pillar7_lt_liabilities, pillar7_avg_fcf, pillar7_ratio, pillar7_threshold, pillar7_passed, pillar7_data,
        pillar8_value, pillar8_threshold, pillar8_passed, pillar8_data,
        pillars_passed,
        company_name, industry, logo
      )
      VALUES (
        $1, NOW(), $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34, $35,
        $36, $37, $38, $39,
        $40,
        $41, $42, $43
      )
      ON CONFLICT (symbol, (analysis_date::date))
      DO UPDATE SET
        market_cap = EXCLUDED.market_cap,
        current_price = EXCLUDED.current_price,
        shares_outstanding = EXCLUDED.shares_outstanding,
        pillar1_value = EXCLUDED.pillar1_value,
        pillar1_passed = EXCLUDED.pillar1_passed,
        pillar1_data = EXCLUDED.pillar1_data,
        pillar2_value = EXCLUDED.pillar2_value,
        pillar2_passed = EXCLUDED.pillar2_passed,
        pillar2_data = EXCLUDED.pillar2_data,
        pillar3_current_shares = EXCLUDED.pillar3_current_shares,
        pillar3_prior_shares = EXCLUDED.pillar3_prior_shares,
        pillar3_change_percent = EXCLUDED.pillar3_change_percent,
        pillar3_passed = EXCLUDED.pillar3_passed,
        pillar3_data = EXCLUDED.pillar3_data,
        pillar4_fcf_current = EXCLUDED.pillar4_fcf_current,
        pillar4_fcf_prior = EXCLUDED.pillar4_fcf_prior,
        pillar4_passed = EXCLUDED.pillar4_passed,
        pillar4_data = EXCLUDED.pillar4_data,
        pillar5_income_current = EXCLUDED.pillar5_income_current,
        pillar5_income_prior = EXCLUDED.pillar5_income_prior,
        pillar5_passed = EXCLUDED.pillar5_passed,
        pillar5_data = EXCLUDED.pillar5_data,
        pillar6_revenue_current = EXCLUDED.pillar6_revenue_current,
        pillar6_revenue_prior = EXCLUDED.pillar6_revenue_prior,
        pillar6_growth_percent = EXCLUDED.pillar6_growth_percent,
        pillar6_passed = EXCLUDED.pillar6_passed,
        pillar6_data = EXCLUDED.pillar6_data,
        pillar7_lt_liabilities = EXCLUDED.pillar7_lt_liabilities,
        pillar7_avg_fcf = EXCLUDED.pillar7_avg_fcf,
        pillar7_ratio = EXCLUDED.pillar7_ratio,
        pillar7_passed = EXCLUDED.pillar7_passed,
        pillar7_data = EXCLUDED.pillar7_data,
        pillar8_value = EXCLUDED.pillar8_value,
        pillar8_passed = EXCLUDED.pillar8_passed,
        pillar8_data = EXCLUDED.pillar8_data,
        pillars_passed = EXCLUDED.pillars_passed,
        company_name = EXCLUDED.company_name,
        industry = EXCLUDED.industry,
        logo = EXCLUDED.logo,
        analysis_date = NOW()
    `;

    const p = analysis.pillars;

    try {
      await db.query(query, [
        analysis.symbol,
        analysis.marketCap,
        analysis.currentPrice,
        analysis.sharesOutstanding,
        p.pillar1.value, p.pillar1.threshold, p.pillar1.passed, JSON.stringify(p.pillar1.data || {}),
        p.pillar2.value, p.pillar2.passed, JSON.stringify(p.pillar2.data || {}),
        p.pillar3.data?.currentShares, p.pillar3.data?.priorShares, p.pillar3.value, p.pillar3.passed, JSON.stringify(p.pillar3.data || {}),
        p.pillar4.data?.currentFCF, p.pillar4.data?.priorFCF, p.pillar4.passed, JSON.stringify(p.pillar4.data || {}),
        p.pillar5.data?.currentIncome, p.pillar5.data?.priorIncome, p.pillar5.passed, JSON.stringify(p.pillar5.data || {}),
        p.pillar6.data?.currentRevenue, p.pillar6.data?.priorRevenue, p.pillar6.value, p.pillar6.passed, JSON.stringify(p.pillar6.data || {}),
        p.pillar7.data?.longTermDebt, p.pillar7.data?.avgFCF, p.pillar7.value, p.pillar7.threshold, p.pillar7.passed, JSON.stringify(p.pillar7.data || {}),
        p.pillar8.value, p.pillar8.threshold, p.pillar8.passed, JSON.stringify(p.pillar8.data || {}),
        analysis.pillarsPassed,
        analysis.companyName,
        analysis.industry,
        analysis.logo
      ]);

      console.log(`[8PILLARS] Cached analysis for ${analysis.symbol}`);
    } catch (error) {
      console.error(`[8PILLARS] Error caching analysis: ${error.message}`);
    }
  }

  /**
   * Convert database row to analysis object
   * @param {Object} row - Database row
   * @returns {Object} Analysis object
   */
  static rowToAnalysis(row) {
    return {
      symbol: row.symbol,
      analysisDate: row.analysis_date,
      marketCap: parseFloat(row.market_cap) || null,
      currentPrice: parseFloat(row.current_price) || null,
      sharesOutstanding: parseInt(row.shares_outstanding) || null,
      pillars: {
        pillar1: {
          name: '5-Year P/E Ratio',
          value: parseFloat(row.pillar1_value) || null,
          threshold: parseFloat(row.pillar1_threshold),
          passed: row.pillar1_passed,
          description: 'Avg of Annual P/E Ratios',
          data: row.pillar1_data
        },
        pillar2: {
          name: '5-Year ROIC',
          value: parseFloat(row.pillar2_value) || null,
          passed: row.pillar2_passed,
          description: 'Avg of Annual ROIC',
          displayValue: row.pillar2_value ? `${row.pillar2_value}%` : null,
          data: row.pillar2_data
        },
        pillar3: {
          name: 'Shares Outstanding',
          value: parseFloat(row.pillar3_change_percent) || null,
          passed: row.pillar3_passed,
          description: 'Current vs 5 Years Ago',
          displayValue: row.pillar3_change_percent
            ? `${row.pillar3_change_percent >= 0 ? '+' : ''}${row.pillar3_change_percent}%`
            : null,
          data: row.pillar3_data
        },
        pillar4: (() => {
          const data = row.pillar4_data || {};
          const currentFCF = data.currentFCF;
          const priorFCF = data.priorFCF;
          let growthPercent = null;
          if (currentFCF !== null && priorFCF !== null) {
            if (priorFCF === 0) {
              growthPercent = null; // Can't calculate % change from zero
            } else if (priorFCF < 0 && currentFCF > 0) {
              growthPercent = null; // Infinite improvement, can't express as percentage
            } else {
              growthPercent = ((currentFCF - priorFCF) / priorFCF) * 100;
            }
          }
          const passed = currentFCF !== null && priorFCF !== null && currentFCF > priorFCF;
          return {
            name: 'Cash Flow Growth',
            value: growthPercent !== null ? parseFloat(growthPercent.toFixed(2)) : null,
            passed: row.pillar4_passed !== undefined ? row.pillar4_passed : passed,
            description: 'TTM FCF vs 5 Years Ago',
            displayValue: growthPercent !== null ? `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%` : (passed ? 'Improved' : 'Declined'),
            data: row.pillar4_data
          };
        })(),
        pillar5: (() => {
          const data = row.pillar5_data || {};
          const currentIncome = data.currentIncome;
          const priorIncome = data.priorIncome;
          let growthPercent = null;
          if (currentIncome !== null && priorIncome !== null) {
            if (priorIncome === 0) {
              growthPercent = null; // Can't calculate % change from zero
            } else if (priorIncome < 0 && currentIncome > 0) {
              growthPercent = null; // Infinite improvement, can't express as percentage
            } else {
              growthPercent = ((currentIncome - priorIncome) / priorIncome) * 100;
            }
          }
          const passed = currentIncome !== null && priorIncome !== null && currentIncome > priorIncome;
          return {
            name: 'Net Income Growth',
            value: growthPercent !== null ? parseFloat(growthPercent.toFixed(2)) : null,
            passed: row.pillar5_passed !== undefined ? row.pillar5_passed : passed,
            description: 'TTM Net Income vs 5 Years Ago',
            displayValue: growthPercent !== null ? `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%` : (passed ? 'Improved' : 'Declined'),
            data: row.pillar5_data
          };
        })(),
        pillar6: {
          name: 'Revenue Growth',
          value: parseFloat(row.pillar6_growth_percent) || null,
          passed: row.pillar6_passed,
          description: '5-Year Revenue Expansion',
          displayValue: row.pillar6_growth_percent
            ? `${row.pillar6_growth_percent >= 0 ? '+' : ''}${row.pillar6_growth_percent}%`
            : null,
          data: row.pillar6_data
        },
        pillar7: {
          name: 'LT Debt / FCF',
          value: parseFloat(row.pillar7_ratio) || null,
          threshold: parseFloat(row.pillar7_threshold),
          passed: row.pillar7_passed,
          description: 'Long-Term Debt / Avg 5-Year FCF',
          displayValue: row.pillar7_ratio ? `${row.pillar7_ratio}x` : null,
          data: row.pillar7_data
        },
        pillar8: {
          name: '5-Year Price/FCF',
          value: parseFloat(row.pillar8_value) || null,
          threshold: parseFloat(row.pillar8_threshold),
          passed: row.pillar8_passed,
          description: 'Market Cap / Avg Annual FCF',
          data: row.pillar8_data
        }
      },
      pillarsPassed: row.pillars_passed,
      companyName: row.company_name || null,
      industry: row.industry || null,
      logo: row.logo || null
    };
  }

  /**
   * Analyze multiple symbols (for watchlist)
   * @param {Array<string>} symbols - Array of stock symbols
   * @returns {Promise<Object>} Map of symbol to analysis
   */
  static async analyzeMultiple(symbols) {
    const results = {};

    for (const symbol of symbols) {
      try {
        results[symbol] = await this.analyzeStock(symbol);
      } catch (error) {
        console.error(`[8PILLARS] Failed to analyze ${symbol}: ${error.message}`);
        results[symbol] = { error: error.message, symbol };
      }
    }

    return results;
  }
}

module.exports = EightPillarsService;

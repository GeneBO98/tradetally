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

    // Get required data (pass forceRefresh to also refresh underlying financial data)
    const [profile, quote, metrics] = await Promise.all([
      FundamentalDataService.getProfile(symbolUpper),
      FundamentalDataService.getQuote(symbolUpper),
      FundamentalDataService.getMetrics(symbolUpper)
    ]);
    
    // Get profile shares outstanding to use as fallback for financial statements
    const profileShares = profile?.shareOutstanding ? profile.shareOutstanding * 1000000 : null;
    
    // Get aggregates with profile shares as fallback
    const aggregates = await FundamentalDataService.getFiveYearAggregates(symbolUpper, forceRefresh, profileShares);

    // Debug profile and metrics
    console.log(`[8PILLARS] Profile for ${symbolUpper}:`, JSON.stringify(profile, null, 2));
    if (metrics && metrics.metric) {
      console.log(`[8PILLARS] Metrics for ${symbolUpper}:`, JSON.stringify(metrics.metric, null, 2));
    }

    if (!aggregates) {
      throw new Error(`Insufficient financial data for ${symbolUpper}`);
    }

    // Log aggregates for debugging
    console.log(`[8PILLARS] ====== AGGREGATES DEBUG for ${symbolUpper} ======`);
    console.log(`[8PILLARS] Current period:`, JSON.stringify(aggregates.current, null, 2));
    console.log(`[8PILLARS] Prior period:`, JSON.stringify(aggregates.prior, null, 2));
    console.log(`[8PILLARS] Averages:`, JSON.stringify(aggregates.averages, null, 2));
    console.log(`[8PILLARS] 5-Year Totals:`, JSON.stringify(aggregates.fiveYearTotals, null, 2));
    console.log(`[8PILLARS] Annual Data count: ${aggregates.annualData?.length || 0}`);
    console.log(`[8PILLARS] ====== END AGGREGATES DEBUG ======`);

    const currentPrice = quote?.c || null;
    const sharesOutstanding = profile?.shareOutstanding
      ? profile.shareOutstanding * 1000000
      : aggregates.current.sharesOutstanding;

    console.log(`[8PILLARS] Shares Outstanding: ${sharesOutstanding} (from ${profile?.shareOutstanding ? 'profile' : 'aggregates'})`);
    console.log(`[8PILLARS] Current Price: ${currentPrice}`);

    // Calculate market cap from current price * shares outstanding (most accurate)
    // Fall back to profile market cap if price or shares not available
    let marketCap = null;
    if (currentPrice && sharesOutstanding) {
      marketCap = currentPrice * sharesOutstanding;
    } else if (profile?.marketCapitalization) {
      marketCap = profile.marketCapitalization * 1000000; // Finnhub returns in millions
    }

    // Get year-end prices for calculating true 5-year average P/E
    const annualData = aggregates.annualData || [];
    const fiscalYears = annualData.map(d => d.fiscalYear);
    const yearEndPrices = await FundamentalDataService.getYearEndPrices(symbolUpper, fiscalYears);

    // Calculate P/E for each year and average them
    // Include negative P/E ratios (when EPS is negative) - these are still valid calculations
    // Use profile shares outstanding if annualData doesn't have shares (shares don't change dramatically year-to-year)
    const annualPEs = [];
    for (const yearData of annualData) {
      const yearEndPrice = yearEndPrices[yearData.fiscalYear];
      // Calculate EPS: use sharesOutstanding from annualData if available, otherwise use profile shares
      const yearShares = yearData.sharesOutstanding || sharesOutstanding;
      let yearEPS = yearData.eps;
      
      // If EPS not calculated but we have net income and shares, calculate it
      if (!yearEPS && yearData.netIncome !== null && yearData.netIncome !== undefined && yearShares) {
        yearEPS = yearData.netIncome / yearShares;
      }
      
      if (yearEndPrice && yearEPS !== null && yearEPS !== undefined && yearEPS !== 0) {
        const yearPE = yearEndPrice / yearEPS;
        annualPEs.push({ year: yearData.fiscalYear, pe: yearPE, price: yearEndPrice, eps: yearEPS });
        console.log(`[8PILLARS] Year ${yearData.fiscalYear} P/E: ${yearPE.toFixed(2)} (Price: $${yearEndPrice.toFixed(2)}, EPS: $${yearEPS.toFixed(2)})`);
      }
    }

    // Calculate 5-year average P/E (average of each year's P/E ratio)
    // This works even when some or all P/E ratios are negative
    const avgPE5Y = annualPEs.length > 0
      ? annualPEs.reduce((sum, d) => sum + d.pe, 0) / annualPEs.length
      : null;

    if (avgPE5Y) {
      console.log(`[8PILLARS] 5-Year Average P/E: ${avgPE5Y.toFixed(2)} (from ${annualPEs.length} years or alternative method)`);
    }

    // Current P/E for reference (only calculate if net income is positive)
    const currentPE = currentPrice && aggregates.current.netIncome && aggregates.current.netIncome > 0 && sharesOutstanding
      ? currentPrice / (aggregates.current.netIncome / sharesOutstanding)
      : null;

    const pillar1 = this.calculatePillar1(avgPE5Y, annualPEs, currentPE);
    // Get debt-to-equity ratio from metrics as fallback when debt isn't in financials
    const debtToEquityRatio = metrics?.metric?.['totalDebt/totalEquityAnnual'] || null;
    const pillar2 = this.calculatePillar2(aggregates, debtToEquityRatio);
    // Use profile shares outstanding for current period (most accurate)
    // For prior period, try to get from aggregates, but also check if we can get it from financial statements
    const currentSharesForPillar3 = sharesOutstanding; // Use the profile value we already calculated

    // Try to get prior period shares from aggregates
    let priorSharesRaw = aggregates.prior?.sharesOutstanding;

    // Helper function to validate shares - relaxed range (1M to 50B)
    // Small caps can have < 50M shares, large companies can exceed 10B
    const isValidShares = (shares) => {
      return shares && shares >= 1000000 && shares <= 50000000000;
    };

    // If prior shares is invalid, try to get it from a nearby year in annualData
    if (!isValidShares(priorSharesRaw)) {
      const priorYear = aggregates.prior?.fiscalYear;
      if (priorYear) {
        // Try to find shares in the prior year's data
        const priorYearData = annualData.find(d => d.fiscalYear === priorYear);
        if (isValidShares(priorYearData?.sharesOutstanding)) {
          priorSharesRaw = priorYearData.sharesOutstanding;
        } else {
          // Try to find shares in nearby years (within 1-2 years)
          for (const yearData of annualData) {
            if (isValidShares(yearData.sharesOutstanding) &&
                Math.abs(yearData.fiscalYear - priorYear) <= 2) {
              priorSharesRaw = yearData.sharesOutstanding;
              console.log(`[8PILLARS] Using shares from ${yearData.fiscalYear} (${priorSharesRaw.toLocaleString()}) as proxy for ${priorYear}`);
              break;
            }
          }
        }
      }
    }

    // If still no prior shares, estimate from current shares
    // Most companies don't have dramatic share count changes (usually < 10% per year)
    if (!isValidShares(priorSharesRaw) && currentSharesForPillar3) {
      // Use current shares as estimate - the pillar will show ~0% change
      // This is better than showing N/A when we have current data
      console.log(`[8PILLARS] No prior shares found, using current shares as estimate`);
      priorSharesRaw = currentSharesForPillar3;
    }

    const priorSharesForPillar3 = isValidShares(priorSharesRaw)
      ? Math.round(priorSharesRaw)
      : null;
    const pillar3 = this.calculatePillar3(
      currentSharesForPillar3,
      priorSharesForPillar3
    );
    const pillar4 = this.calculatePillar4(
      aggregates.current?.freeCashFlow ?? null,
      aggregates.prior?.freeCashFlow ?? null
    );
    const pillar5 = this.calculatePillar5(
      aggregates.current?.netIncome ?? null,
      aggregates.prior?.netIncome ?? null
    );
    const pillar6 = this.calculatePillar6(
      aggregates.current?.revenue ?? null,
      aggregates.prior?.revenue ?? null
    );
    const pillar7 = this.calculatePillar7(
      aggregates.current?.longTermDebt ?? null,
      aggregates.averages?.freeCashFlow ?? null
    );
    const pillar8 = this.calculatePillar8(
      marketCap,
      aggregates.fiveYearTotals?.freeCashFlow ?? null
    );

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

    // Use currentPE as fallback if avgPE5Y is not available
    let value = avgPE5Y;
    if (value === null || value === undefined) {
      value = currentPE;
    }
    
    // If still no value, use a high number to indicate missing data
    // This happens when earnings are negative (can't calculate meaningful P/E)
    if (value === null || value === undefined) {
      value = 999.99;
    }

    // P/E threshold is 22.5 - negative P/E means negative earnings, which fails the pillar
    // Positive P/E must be less than 22.5 to pass
    const passed = value > 0 && value < threshold;

    // Determine reason for missing/unavailable P/E
    let reason = null;
    if (!avgPE5Y && !currentPE) {
      if (annualPEs.length === 0) {
        reason = 'Cannot calculate P/E: Missing price or EPS data for all years';
      } else {
        reason = 'Insufficient data to calculate 5-year P/E';
      }
    } else if (!avgPE5Y && currentPE) {
      reason = 'Using current P/E (5-year avg unavailable)';
    }

    return {
      name,
      value: parseFloat(value.toFixed(2)),
      threshold,
      passed,
      description: 'Avg of Annual P/E Ratios',
      displayValue: value === 999.99 ? 'N/A' : value.toFixed(2),
      reason,
      data: {
        annualPEs,
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
    const annualData = aggregates.annualData || [];
    console.log(`[8PILLARS] Annual data has ${annualData.length} years`);
    console.log(`[8PILLARS] Debt-to-Equity ratio from metrics: ${debtToEquityRatio}`);

    for (const yearData of annualData) {
      const { fiscalYear, operatingIncome, totalEquity, totalDebt, cashAndEquivalents } = yearData;

      console.log(`[8PILLARS] Year ${fiscalYear} raw data:`);
      console.log(`[8PILLARS]   operatingIncome: ${operatingIncome}`);
      console.log(`[8PILLARS]   totalEquity: ${totalEquity}`);
      console.log(`[8PILLARS]   totalDebt: ${totalDebt}`);
      console.log(`[8PILLARS]   cashAndEquivalents: ${cashAndEquivalents}`);

      // Need both operating income (can be negative) and equity
      // Allow negative operating income - it will result in negative ROIC which is valid
      if (operatingIncome !== null && operatingIncome !== undefined && totalEquity !== null && totalEquity !== undefined) {
        // If debt is null but we have debt-to-equity ratio, calculate debt
        let effectiveDebt = totalDebt;
        if ((effectiveDebt === null || effectiveDebt === undefined) && debtToEquityRatio && totalEquity) {
          effectiveDebt = totalEquity * debtToEquityRatio;
          console.log(`[8PILLARS]   Calculated debt from D/E ratio: ${effectiveDebt} = ${totalEquity} * ${debtToEquityRatio}`);
        }

        // Invested Capital = Equity + Debt - Cash (standard formula)
        const investedCapital = (totalEquity || 0) + (effectiveDebt || 0) - (cashAndEquivalents || 0);

        console.log(`[8PILLARS]   investedCapital: ${investedCapital} = ${totalEquity || 0} + ${effectiveDebt || 0} - ${cashAndEquivalents || 0}`);

        // Calculate ROIC even if invested capital is negative (rare but possible)
        // Use absolute value to avoid division by zero or negative issues
        if (Math.abs(investedCapital) > 0.01) {
          const nopat = operatingIncome * (1 - taxRate);
          const roic = (nopat / Math.abs(investedCapital)) * 100;

          console.log(`[8PILLARS]   NOPAT: ${nopat} = ${operatingIncome} * ${1 - taxRate}`);
          console.log(`[8PILLARS]   ROIC: ${roic.toFixed(2)}% = ${nopat} / ${Math.abs(investedCapital)} * 100`);

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
          console.log(`[8PILLARS]   SKIPPED: Invested capital too close to zero`);
        }
      } else {
        console.log(`[8PILLARS]   SKIPPED: Missing operatingIncome or equity (opIncome: ${operatingIncome}, equity: ${totalEquity})`);
      }
    }

    console.log(`[8PILLARS] ===== END ROIC DEBUG =====`);

    // If no ROIC data, return 0 instead of null
    if (annualROICs.length === 0) {
      return {
        name,
        value: 0,
        passed: false,
        description: 'Avg of Annual ROIC',
        displayValue: '0.0%',
        reason: 'Insufficient operating income or capital data',
        data: {
          annualROICs: [],
          taxRate: parseFloat((taxRate * 100).toFixed(1))
        }
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

    // If either value is missing, we can't calculate a meaningful comparison
    if (!currentShares || !priorShares) {
      return {
        name,
        value: null,
        passed: false,
        description: 'Current vs 5 Years Ago',
        displayValue: 'N/A',
        reason: !currentShares ? 'Current shares data unavailable' : 'Prior period shares data unavailable',
        data: { currentShares: currentShares || null, priorShares: priorShares || null }
      };
    }

    const effectiveCurrent = currentShares;
    const effectivePrior = priorShares;

    let changePercent = 0;
    if (effectivePrior > 0) {
      changePercent = ((effectiveCurrent - effectivePrior) / effectivePrior) * 100;
    }

    const passed = changePercent <= 0; // Decreasing or stable = pass

    const displayVal = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;
    return {
      name,
      value: parseFloat(changePercent.toFixed(2)),
      passed,
      description: 'Current vs 5 Years Ago',
      displayValue: displayVal,
      trend: changePercent < 0 ? 'decreasing' : changePercent > 0 ? 'increasing' : 'stable',
      reason: (!currentShares || !priorShares) ? 'Incomplete shares data' : null,
      data: { currentShares: effectiveCurrent, priorShares: effectivePrior }
    };
  }

  /**
   * Pillar 4: Cash Flow Growth
   * TTM Free Cash Flow > FCF from 5 years ago
   */
  static calculatePillar4(currentFCF, priorFCF) {
    const name = 'Cash Flow Growth';

    // Use 0 as fallback for missing values
    const effectiveCurrent = currentFCF !== null && currentFCF !== undefined ? currentFCF : 0;
    const effectivePrior = priorFCF !== null && priorFCF !== undefined ? priorFCF : 0;

    const passed = effectiveCurrent > effectivePrior;
    
    // Calculate growth percentage - always return a number
    let growthPercent = 0;
    if (effectivePrior === 0) {
      // If prior is 0, show 100% if current is positive, 0% if both are 0, or negative if current is negative
      if (effectiveCurrent > 0) {
        growthPercent = 100; // Indicate improvement
      } else if (effectiveCurrent < 0) {
        growthPercent = -100; // Indicate decline
      }
    } else if (effectivePrior < 0 && effectiveCurrent > 0) {
      // Went from negative to positive - show large positive number
      growthPercent = 1000;
    } else {
      growthPercent = ((effectiveCurrent - effectivePrior) / Math.abs(effectivePrior)) * 100;
    }

    return {
      name,
      value: parseFloat(growthPercent.toFixed(2)),
      passed,
      description: 'TTM FCF vs 5 Years Ago',
      displayValue: `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%`,
      reason: (currentFCF === null || currentFCF === undefined || priorFCF === null || priorFCF === undefined) ? 'Incomplete FCF data' : null,
      data: { currentFCF: effectiveCurrent, priorFCF: effectivePrior }
    };
  }

  /**
   * Pillar 5: Net Income Growth
   * TTM Net Income > Net Income from 5 years ago
   */
  static calculatePillar5(currentIncome, priorIncome) {
    const name = 'Net Income Growth';

    // Use 0 as fallback for missing values
    const effectiveCurrent = currentIncome !== null && currentIncome !== undefined ? currentIncome : 0;
    const effectivePrior = priorIncome !== null && priorIncome !== undefined ? priorIncome : 0;

    const passed = effectiveCurrent > effectivePrior;
    
    // Calculate growth percentage - always return a number
    let growthPercent = 0;
    if (effectivePrior === 0) {
      // If prior is 0, show 100% if current is positive, 0% if both are 0, or negative if current is negative
      if (effectiveCurrent > 0) {
        growthPercent = 100; // Indicate improvement
      } else if (effectiveCurrent < 0) {
        growthPercent = -100; // Indicate decline
      }
    } else if (effectivePrior < 0 && effectiveCurrent > 0) {
      // Went from negative to positive - show large positive number
      growthPercent = 1000;
    } else {
      growthPercent = ((effectiveCurrent - effectivePrior) / Math.abs(effectivePrior)) * 100;
    }

    return {
      name,
      value: parseFloat(growthPercent.toFixed(2)),
      passed,
      description: 'TTM Net Income vs 5 Years Ago',
      displayValue: `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%`,
      reason: (currentIncome === null || currentIncome === undefined || priorIncome === null || priorIncome === undefined) ? 'Incomplete net income data' : null,
      data: { currentIncome: effectiveCurrent, priorIncome: effectivePrior }
    };
  }

  /**
   * Pillar 6: Revenue Growth
   * 5-year revenue expansion
   */
  static calculatePillar6(currentRevenue, priorRevenue) {
    const name = 'Revenue Growth';

    // Use 0 as fallback for missing values
    const effectiveCurrent = currentRevenue !== null && currentRevenue !== undefined ? currentRevenue : 0;
    const effectivePrior = priorRevenue !== null && priorRevenue !== undefined ? priorRevenue : 0;

    const passed = effectiveCurrent > effectivePrior;
    
    // Calculate growth percentage - always return a number
    let growthPercent = 0;
    if (effectivePrior === 0) {
      // If prior is 0, show 100% if current is positive, 0% if both are 0, or negative if current is negative
      if (effectiveCurrent > 0) {
        growthPercent = 100; // Indicate improvement
      } else if (effectiveCurrent < 0) {
        growthPercent = -100; // Indicate decline
      }
    } else if (effectivePrior < 0) {
      // Very rare case of negative revenue
      if (effectiveCurrent > 0) {
        growthPercent = 1000; // Large improvement
      } else {
        growthPercent = ((effectiveCurrent - effectivePrior) / Math.abs(effectivePrior)) * 100;
      }
    } else {
      growthPercent = ((effectiveCurrent - effectivePrior) / effectivePrior) * 100;
    }

    return {
      name,
      value: parseFloat(growthPercent.toFixed(2)),
      passed,
      description: '5-Year Revenue Expansion',
      displayValue: `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%`,
      reason: (currentRevenue === null || currentRevenue === undefined || priorRevenue === null || priorRevenue === undefined) ? 'Incomplete revenue data' : null,
      data: { currentRevenue: effectiveCurrent, priorRevenue: effectivePrior }
    };
  }

  /**
   * Pillar 7: Long-Term Liabilities / FCF Ratio
   * LT Debt / Average 5-Year FCF < 5
   */
  static calculatePillar7(longTermDebt, avgFCF) {
    const name = 'LT Debt / FCF';
    const threshold = this.THRESHOLDS.ltLiabilitiesRatio;

    // If no debt, that's actually a pass
    if (longTermDebt === 0 || longTermDebt === null) {
      return {
        name,
        value: 0,
        threshold,
        passed: true,
        description: 'Long-Term Debt / Avg 5-Year FCF',
        displayValue: '0x (No debt)',
        data: { longTermDebt: longTermDebt || 0, avgFCF }
      };
    }

    // Calculate ratio even with negative FCF (negative ratio is meaningful)
    // If FCF is zero or missing, we can't calculate a meaningful ratio
    if (avgFCF === null || avgFCF === undefined || avgFCF === 0) {
      return {
        name,
        value: avgFCF === 0 ? 999.99 : 0,
        threshold,
        passed: false,
        description: 'Long-Term Debt / Avg 5-Year FCF',
        displayValue: avgFCF === 0 ? '999.0x' : '0.0x',
        reason: avgFCF === 0 ? 'Zero average FCF - cannot calculate debt payoff ratio' : 'Missing FCF data',
        data: { longTermDebt, avgFCF }
      };
    }

    // Calculate ratio - can be negative if FCF is negative
    const ratio = longTermDebt / avgFCF;
    // For negative ratios, they always fail (can't pay off debt with negative FCF)
    const passed = ratio < threshold && ratio >= 0;

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

    // If market cap is missing, we can't calculate the ratio
    if (!marketCap || marketCap === 0) {
      const avgAnnualFCF = fiveYearFCF ? fiveYearFCF / 5 : 0;
      return {
        name,
        value: 999.99,
        threshold,
        passed: false,
        description: 'Market Cap / Avg Annual FCF',
        displayValue: '999.0',
        reason: 'Market cap data not available',
        data: { marketCap: 0, fiveYearFCF, avgAnnualFCF }
      };
    }

    // Calculate ratio even with negative FCF (negative ratio is meaningful)
    // If FCF is zero or missing, we can't calculate a meaningful ratio
    if (fiveYearFCF === null || fiveYearFCF === undefined || fiveYearFCF === 0) {
      const avgAnnualFCF = fiveYearFCF === 0 ? 0 : null;
      return {
        name,
        value: fiveYearFCF === 0 ? 999.99 : 0,
        threshold,
        passed: false,
        description: 'Market Cap / Avg Annual FCF',
        displayValue: fiveYearFCF === 0 ? '999.0' : '0.0',
        reason: fiveYearFCF === 0 ? 'Zero 5-year FCF - cannot calculate Price/FCF ratio' : 'Missing FCF data',
        data: { marketCap, fiveYearFCF, avgAnnualFCF }
      };
    }

    // Calculate average annual FCF (total 5-year FCF / 5)
    // The threshold of 22.5 is for annual FCF, so we compare against average annual FCF
    const avgAnnualFCF = fiveYearFCF / 5;
    // Calculate value - can be negative if FCF is negative
    const value = marketCap / avgAnnualFCF;
    // For negative ratios, they always fail (negative FCF means poor value)
    const passed = value < threshold && value >= 0;

    return {
      name,
      value: parseFloat(value.toFixed(2)),
      threshold,
      passed,
      description: 'Market Cap / Avg Annual FCF',
      displayValue: value.toFixed(2),
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
          value: parseFloat(row.pillar1_value) || 999.99,
          threshold: parseFloat(row.pillar1_threshold),
          passed: row.pillar1_passed,
          description: 'Avg of Annual P/E Ratios',
          displayValue: row.pillar1_value === 999.99 || row.pillar1_value === null ? 'N/A' : parseFloat(row.pillar1_value).toFixed(2),
          reason: row.pillar1_data?.reason || null,
          data: row.pillar1_data
        },
        pillar2: {
          name: '5-Year ROIC',
          value: parseFloat(row.pillar2_value) || 0,
          passed: row.pillar2_passed,
          description: 'Avg of Annual ROIC',
          displayValue: row.pillar2_value ? `${row.pillar2_value}%` : '0.0%',
          data: row.pillar2_data
        },
        pillar3: (() => {
          const data = row.pillar3_data || {};
          const currentShares = data.currentShares;
          const priorShares = data.priorShares;
          
          // If we have both shares values, calculate the change
          let changePercent = null;
          let displayValue = 'N/A';
          
          if (currentShares && priorShares && priorShares > 0) {
            changePercent = ((currentShares - priorShares) / priorShares) * 100;
            displayValue = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;
          } else if (row.pillar3_change_percent !== null && row.pillar3_change_percent !== undefined) {
            // Fallback to stored change_percent if calculation data is missing
            changePercent = parseFloat(row.pillar3_change_percent);
            displayValue = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;
          }
          
          return {
            name: 'Shares Outstanding',
            value: changePercent !== null ? parseFloat(changePercent.toFixed(2)) : null,
            passed: row.pillar3_passed,
            description: 'Current vs 5 Years Ago',
            displayValue: displayValue,
            trend: changePercent !== null ? (changePercent < 0 ? 'decreasing' : changePercent > 0 ? 'increasing' : 'stable') : null,
            reason: (!currentShares || !priorShares) ? 'Incomplete shares data' : null,
            data: row.pillar3_data
          };
        })(),
        pillar4: (() => {
          const data = row.pillar4_data || {};
          const currentFCF = data.currentFCF !== null && data.currentFCF !== undefined ? data.currentFCF : 0;
          const priorFCF = data.priorFCF !== null && data.priorFCF !== undefined ? data.priorFCF : 0;
          let growthPercent = 0;
          if (priorFCF === 0) {
            if (currentFCF > 0) {
              growthPercent = 100;
            } else if (currentFCF < 0) {
              growthPercent = -100;
            }
          } else if (priorFCF < 0 && currentFCF > 0) {
            growthPercent = 1000;
          } else {
            growthPercent = ((currentFCF - priorFCF) / Math.abs(priorFCF)) * 100;
          }
          const passed = currentFCF > priorFCF;
          return {
            name: 'Cash Flow Growth',
            value: parseFloat(growthPercent.toFixed(2)),
            passed: row.pillar4_passed !== undefined ? row.pillar4_passed : passed,
            description: 'TTM FCF vs 5 Years Ago',
            displayValue: `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%`,
            data: row.pillar4_data
          };
        })(),
        pillar5: (() => {
          const data = row.pillar5_data || {};
          const currentIncome = data.currentIncome !== null && data.currentIncome !== undefined ? data.currentIncome : 0;
          const priorIncome = data.priorIncome !== null && data.priorIncome !== undefined ? data.priorIncome : 0;
          let growthPercent = 0;
          if (priorIncome === 0) {
            if (currentIncome > 0) {
              growthPercent = 100;
            } else if (currentIncome < 0) {
              growthPercent = -100;
            }
          } else if (priorIncome < 0 && currentIncome > 0) {
            growthPercent = 1000;
          } else {
            growthPercent = ((currentIncome - priorIncome) / Math.abs(priorIncome)) * 100;
          }
          const passed = currentIncome > priorIncome;
          return {
            name: 'Net Income Growth',
            value: parseFloat(growthPercent.toFixed(2)),
            passed: row.pillar5_passed !== undefined ? row.pillar5_passed : passed,
            description: 'TTM Net Income vs 5 Years Ago',
            displayValue: `${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%`,
            data: row.pillar5_data
          };
        })(),
        pillar6: {
          name: 'Revenue Growth',
          value: parseFloat(row.pillar6_growth_percent) || 0,
          passed: row.pillar6_passed,
          description: '5-Year Revenue Expansion',
          displayValue: row.pillar6_growth_percent !== null && row.pillar6_growth_percent !== undefined
            ? `${row.pillar6_growth_percent >= 0 ? '+' : ''}${row.pillar6_growth_percent}%`
            : '0.0%',
          data: row.pillar6_data
        },
        pillar7: {
          name: 'LT Debt / FCF',
          value: parseFloat(row.pillar7_ratio) || 999.99,
          threshold: parseFloat(row.pillar7_threshold),
          passed: row.pillar7_passed,
          description: 'Long-Term Debt / Avg 5-Year FCF',
          displayValue: row.pillar7_ratio !== null && row.pillar7_ratio !== undefined ? `${row.pillar7_ratio}x` : '999.0x',
          data: row.pillar7_data
        },
        pillar8: {
          name: '5-Year Price/FCF',
          value: parseFloat(row.pillar8_value) || 999.99,
          threshold: parseFloat(row.pillar8_threshold),
          passed: row.pillar8_passed,
          description: 'Market Cap / Avg Annual FCF',
          displayValue: row.pillar8_value !== null && row.pillar8_value !== undefined ? parseFloat(row.pillar8_value).toFixed(2) : '999.0',
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

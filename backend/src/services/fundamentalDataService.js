/**
 * Fundamental Data Service
 * Fetches, caches, and processes financial statement data from Finnhub
 * Used by the 8 Pillars analysis and investment planning features
 */

const db = require('../config/database');
const finnhub = require('../utils/finnhub');

class FundamentalDataService {
  /**
   * Get financial statements for a symbol, using cache when available
   * @param {string} symbol - Stock symbol
   * @param {number} years - Number of years/quarters of data to retrieve (default 20)
   * @param {boolean} forceRefresh - Force refresh from API
   * @param {string} frequency - 'annual' or 'quarterly' (default: 'annual')
   * @param {number} profileSharesOutstanding - Optional: shares outstanding from profile to use as fallback
   * @returns {Promise<Array>} Array of financial periods
   */
  static async getFinancials(symbol, years = 20, forceRefresh = false, frequency = 'annual', profileSharesOutstanding = null) {
    const symbolUpper = symbol.toUpperCase();
    const freq = frequency === 'quarterly' ? 'quarterly' : 'annual';

    if (forceRefresh) {
      console.log(`[FUNDAMENTAL] FORCE REFRESH requested for ${symbolUpper} - bypassing cache`);
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.getCachedFinancials(symbolUpper, years, freq);
      if (cached && cached.length > 0) {
        console.log(`[FUNDAMENTAL] Using cached ${freq} financials for ${symbolUpper} (${cached.length} periods)`);
        return cached;
      }
    }

    // Try multiple endpoints in order of preference
    let financialData = null;

    // First try the standardized financials endpoint
    try {
      console.log(`[FUNDAMENTAL] Trying /stock/financials for ${symbolUpper} (${freq})`);
      financialData = await finnhub.getFinancialStatements(symbolUpper, freq);
      if (financialData && financialData.financials && financialData.financials.length > 0) {
        console.log(`[FUNDAMENTAL] Got ${financialData.financials.length} periods from /stock/financials`);
        await this.cacheFinancials(symbolUpper, financialData.financials, freq);
        return financialData.financials.slice(0, years);
      }
    } catch (error) {
      console.log(`[FUNDAMENTAL] /stock/financials not available: ${error.message}`);
    }

    // Fall back to financials-reported endpoint
    try {
      console.log(`[FUNDAMENTAL] Trying /stock/financials-reported for ${symbolUpper} (${freq})`);
      const reportedData = await finnhub.getFinancialsReported(symbolUpper, freq);
      if (reportedData && reportedData.data && reportedData.data.length > 0) {
        console.log(`[FUNDAMENTAL] Got ${reportedData.data.length} periods from /stock/financials-reported`);
        // Log the years we received
        const receivedYears = reportedData.data.map(d => `${d.year} (${d.form})`).slice(0, 10);
        console.log(`[FUNDAMENTAL] Years received: ${receivedYears.join(', ')}`);
        // Convert reported format to standardized format
        const converted = this.convertReportedToStandard(reportedData.data, profileSharesOutstanding);
        console.log(`[FUNDAMENTAL] Converted ${converted.length} periods, years: ${converted.map(c => c.year).slice(0, 10).join(', ')}`);
        await this.cacheFinancials(symbolUpper, converted, freq);
        return converted.slice(0, years);
      }
    } catch (error) {
      console.log(`[FUNDAMENTAL] /stock/financials-reported not available: ${error.message}`);
    }

    console.warn(`[FUNDAMENTAL] No ${freq} financial data available for ${symbolUpper} from any endpoint`);
    return [];
  }

  /**
   * Convert financials-reported format to standardized format
   * The reported format has nested arrays like: report.bs = [{concept: "...", value: ...}, ...]
   * @param {Array} reportedData - Data from /stock/financials-reported
   * @param {number} profileSharesOutstanding - Optional: shares outstanding from profile to use as fallback
   * @returns {Array} Standardized financial data
   */
  static convertReportedToStandard(reportedData, profileSharesOutstanding = null) {
    // Log first period structure for extensive debugging
    if (reportedData.length > 0) {
      const sample = reportedData[0];
      console.log(`[FUNDAMENTAL] ====== DEBUG START ======`);
      console.log(`[FUNDAMENTAL] Sample period structure: year=${sample.year}, form=${sample.form}`);
      console.log(`[FUNDAMENTAL] Report keys: ${Object.keys(sample.report || {}).join(', ')}`);

      // Log all BS concepts to understand naming
      if (sample.report?.bs && Array.isArray(sample.report.bs)) {
        console.log(`[FUNDAMENTAL] BS concepts (${sample.report.bs.length} items):`);
        sample.report.bs.forEach(item => {
          console.log(`[FUNDAMENTAL]   BS: ${item.concept} = ${item.value}`);
        });
      }

      // Log all IC concepts
      if (sample.report?.ic && Array.isArray(sample.report.ic)) {
        console.log(`[FUNDAMENTAL] IC concepts (${sample.report.ic.length} items):`);
        sample.report.ic.forEach(item => {
          console.log(`[FUNDAMENTAL]   IC: ${item.concept} = ${item.value}`);
        });
      }

      // Log all CF concepts
      if (sample.report?.cf && Array.isArray(sample.report.cf)) {
        console.log(`[FUNDAMENTAL] CF concepts (${sample.report.cf.length} items):`);
        sample.report.cf.forEach(item => {
          console.log(`[FUNDAMENTAL]   CF: ${item.concept} = ${item.value}`);
        });
      }
      console.log(`[FUNDAMENTAL] ====== DEBUG END ======`);
    }

    // Debug: Log profile shares if available
    if (profileSharesOutstanding) {
      console.log(`[FUNDAMENTAL] Profile shares outstanding available as fallback: ${profileSharesOutstanding.toLocaleString()}`);
    }
    
    return reportedData.map(period => {
      const report = period.report || {};
      const bs = report.bs || []; // Balance sheet - array of {concept, label, value, unit}
      const ic = report.ic || []; // Income statement
      const cf = report.cf || []; // Cash flow

      // Helper to find value from array of concepts (case-insensitive partial match)
      const findValue = (data, ...conceptNames) => {
        if (!Array.isArray(data)) return null;
        for (const name of conceptNames) {
          const nameLower = name.toLowerCase();
          const item = data.find(d =>
            d.concept && d.concept.toLowerCase().includes(nameLower)
          );
          if (item && item.value !== undefined && item.value !== null) {
            return item.value;
          }
        }
        return null;
      };

      // Extract values with expanded search terms
      const revenue = findValue(ic, 'revenuefromcontract', 'revenues', 'netsales', 'totalrevenue', 'revenue', 'salesrevenue');
      const netIncome = findValue(ic, 'netincomeloss', 'netincome', 'profitloss', 'netloss');
      const operatingIncome = findValue(ic, 'operatingincomeloss', 'operatingincome', 'incomefromoperations');
      const totalAssets = findValue(bs, 'assets');
      const totalLiabilities = findValue(bs, 'liabilities', 'liabilitiesandstockholdersequity');
      const totalEquity = findValue(bs, 'stockholdersequity', 'equity', 'totalequity', 'shareownersequity');
      // IMPORTANT: Match LongTermDebtNoncurrent specifically (not LongTermDebtCurrent which is the current portion)
      // Financial companies may use different debt field names
      // Boeing uses LongTermDebtAndCapitalLeaseObligations
      const longTermDebt = findValue(bs, 'longtermdebtnoncurrent', 'longtermdebtandcapitalleaseobligations', 'noncurrentportionoflongtermdebt', 'longtermdebt', 'secureddebt', 'unsecureddebt', 'notespayable', 'debtinstrument');
      const cashAndEquivalents = findValue(bs, 'cashandcashequivalents', 'cashcashequivalents', 'cash');

      // Cash flow items - Finnhub uses "NetCashProvidedByUsedInOperatingActivities" (with UsedIn)
      const operatingCashFlow = findValue(cf, 'netcashprovidedbyusedinoperatingactivities', 'netcashprovidedbyoperatingactivities', 'cashprovidedbyoperatingactivities', 'operatingcashflow');
      const capitalExpenditures = findValue(cf, 'paymentstoacquirepropertyplantandequipment', 'capitalexpenditures', 'purchaseofppe', 'paymentsforpurchaseofpropertyplant');

      // Shares outstanding - try multiple sources with expanded SEC concept names
      let sharesOutstanding = findValue(bs,
        'commonstocksharesoutstanding',
        'entitycommonstocksharesoutstanding',
        'sharesoutstanding',
        'commonstocksharesissued',
        'commonstocksharesauthorized'
      );
      if (!sharesOutstanding) {
        // Try weighted average from income statement (close proxy for shares outstanding)
        sharesOutstanding = findValue(ic,
          'weightedaveragesharesoutstandingbasic',
          'weightedaveragenumberofsharesoutstandingbasic',
          'weightedaveragenumberofshares',
          'basicshares',
          'averagesharesoutstandingbasic'
        );
      }
      // If still not found, calculate from Net Income Available to Common / EPS
      // This works even when both are negative (negatives cancel out)
      if (!sharesOutstanding) {
        const netIncomeToCommon = findValue(ic, 'netincomelossavailabletocommonstockholdersbasic', 'netincomelossavailabletocommonstockholdersdiluted', 'netincomelossavailabletocommon');
        const eps = findValue(ic, 'earningspersharebasic', 'basicearningspershare', 'epsbasic', 'eps');
        if (netIncomeToCommon && eps && eps !== 0) {
          sharesOutstanding = Math.abs(netIncomeToCommon / eps);
          console.log(`[FUNDAMENTAL] Year ${period.year}: Calculated shares from Net Income to Common / EPS: ${sharesOutstanding.toLocaleString()} (Net Income: ${netIncomeToCommon.toLocaleString()}, EPS: ${eps})`);
        } else if (!netIncomeToCommon) {
          console.log(`[FUNDAMENTAL] Year ${period.year}: Net Income to Common not found for shares calculation`);
        } else if (!eps || eps === 0) {
          console.log(`[FUNDAMENTAL] Year ${period.year}: EPS not found or zero for shares calculation`);
        }
      }
      // Fallback: try calculating from regular net income / EPS
      // This works even when both are negative (negatives cancel out)
      if (!sharesOutstanding && netIncome && netIncome !== 0) {
        const eps = findValue(ic, 'earningspersharebasic', 'basicearningspershare', 'epsbasic', 'eps');
        if (eps && eps !== 0) {
          sharesOutstanding = Math.abs(netIncome / eps);
          // Validate the calculated shares are reasonable (1M - 50B range)
          // Relaxed range to handle small caps and large companies
          if (sharesOutstanding >= 1000000 && sharesOutstanding <= 50000000000) {
            console.log(`[FUNDAMENTAL] Year ${period.year}: Calculated shares from Net Income / EPS: ${sharesOutstanding.toLocaleString()} (Net Income: ${netIncome.toLocaleString()}, EPS: ${eps})`);
          } else {
            console.log(`[FUNDAMENTAL] Year ${period.year}: Calculated shares (${sharesOutstanding.toLocaleString()}) out of reasonable range (1M-50B), using profile value as fallback`);
            sharesOutstanding = null; // Will use profile value below
          }
        }
      }
      
      // Final fallback: use profile shares outstanding if available and calculated value is invalid
      // Shares outstanding doesn't change dramatically year-to-year, so this is a reasonable proxy
      if (!sharesOutstanding) {
        if (profileSharesOutstanding && profileSharesOutstanding >= 1000000) {
          sharesOutstanding = profileSharesOutstanding;
          console.log(`[FUNDAMENTAL] Year ${period.year}: Using profile shares outstanding as fallback: ${sharesOutstanding.toLocaleString()}`);
        } else {
          console.log(`[FUNDAMENTAL] Year ${period.year}: No profile shares available (profileSharesOutstanding: ${profileSharesOutstanding})`);
        }
      }

      // Calculate free cash flow: OCF - |CapEx|
      // CapEx is typically negative in cash flow statements (outflow)
      let freeCashFlow = null;
      if (operatingCashFlow !== null) {
        if (capitalExpenditures !== null) {
          // If capex is already negative (typical), add it; if positive, subtract it
          freeCashFlow = capitalExpenditures < 0
            ? operatingCashFlow + capitalExpenditures // capex is negative, adding subtracts
            : operatingCashFlow - capitalExpenditures; // capex is positive, subtract it
        } else {
          // If no CapEx found, FCF = OCF (some companies have minimal CapEx)
          freeCashFlow = operatingCashFlow;
        }
      }

      // Calculate total debt
      const shortTermDebt = findValue(bs, 'shorttermdebt', 'debtcurrent', 'currentportionoflongtermdebt', 'shorttermborrowings');
      const totalDebt = (longTermDebt || 0) + (shortTermDebt || 0);

      // Determine quarter from filing date for quarterly reports
      // 10-Q filings are made AFTER the quarter ends:
      // - Q1 (Jan-Mar) → Filed in April/May (months 4-5)
      // - Q2 (Apr-Jun) → Filed in July/August (months 7-8)
      // - Q3 (Jul-Sep) → Filed in October/November (months 10-11)
      let fiscalQuarter = null;
      if (period.form === '10-Q' && period.filedDate) {
        const filedMonth = new Date(period.filedDate).getMonth() + 1;
        // Map filing month to the quarter being reported
        if (filedMonth >= 4 && filedMonth <= 6) {
          fiscalQuarter = 1; // Q1 results filed in Apr-Jun
        } else if (filedMonth >= 7 && filedMonth <= 9) {
          fiscalQuarter = 2; // Q2 results filed in Jul-Sep
        } else if (filedMonth >= 10 && filedMonth <= 12) {
          fiscalQuarter = 3; // Q3 results filed in Oct-Dec
        } else if (filedMonth >= 1 && filedMonth <= 3) {
          fiscalQuarter = 4; // Q4 results (but this would be 10-K, not 10-Q)
        }
      }

      // Extract EPS directly from income statement (preferred over calculating)
      const eps = findValue(ic, 'earningspersharebasic', 'basicearningspershare', 'earningspershare', 'epsbasic', 'eps');
      
      const result = {
        year: period.year,
        fiscalYear: period.year,
        quarter: fiscalQuarter,
        fiscalQuarter: fiscalQuarter,
        period: period.form === '10-K' ? 'annual' : 'quarterly',
        filingDate: period.filedDate,
        // Income Statement
        revenue,
        netIncome,
        operatingIncome,
        grossProfit: findValue(ic, 'grossprofit'),
        ebit: operatingIncome,
        ebitda: null,
        eps, // EPS from financial statements
        // Balance Sheet
        totalAssets,
        totalLiabilities,
        totalEquity,
        longTermDebt,
        shortTermDebt,
        totalDebt: totalDebt > 0 ? totalDebt : null,
        cashAndEquivalents,
        // Cash Flow
        freeCashFlow,
        operatingCashFlow,
        capitalExpenditures: capitalExpenditures ? Math.abs(capitalExpenditures) : null,
        dividendsPaid: findValue(cf, 'paymentsofdividends', 'dividendspaid', 'paymentofdividends'),
        // Shares - round to integer for BIGINT database column
        sharesOutstanding: sharesOutstanding ? Math.round(sharesOutstanding) : null,
        sharesBasic: (() => {
          const val = findValue(ic, 'weightedaveragesharesoutstandingbasic', 'basicshares', 'weightedaveragenumberofsharesoutstandingbasic');
          return val ? Math.round(val) : null;
        })(),
        sharesDiluted: (() => {
          const val = findValue(ic, 'weightedaveragesharesoutstandingdiluted', 'dilutedshares', 'weightedaveragenumberofdilutedshares');
          return val ? Math.round(val) : null;
        })()
      };

      // Log extracted values for first period
      if (period === reportedData[0]) {
        console.log(`[FUNDAMENTAL] ====== EXTRACTED VALUES ======`);
        console.log(`[FUNDAMENTAL] Year: ${period.year}`);
        console.log(`[FUNDAMENTAL] Revenue: ${revenue}`);
        console.log(`[FUNDAMENTAL] Net Income: ${netIncome}`);
        console.log(`[FUNDAMENTAL] Operating Cash Flow: ${operatingCashFlow}`);
        console.log(`[FUNDAMENTAL] Capital Expenditures: ${capitalExpenditures}`);
        console.log(`[FUNDAMENTAL] Free Cash Flow: ${freeCashFlow}`);
        console.log(`[FUNDAMENTAL] Shares Outstanding: ${sharesOutstanding}`);
        console.log(`[FUNDAMENTAL] Long-Term Debt: ${longTermDebt}`);
        console.log(`[FUNDAMENTAL] Total Equity: ${totalEquity}`);
        console.log(`[FUNDAMENTAL] ============================`);
      }

      return result;
    });
  }

  /**
   * Get cached financials from database
   * @param {string} symbol - Stock symbol
   * @param {number} years - Number of years/quarters to retrieve
   * @param {string} frequency - 'annual' or 'quarterly'
   * @returns {Promise<Array>} Cached financial data
   */
  static async getCachedFinancials(symbol, years = 20, frequency = 'annual') {
    const query = `
      SELECT *
      FROM stock_financials_cache
      WHERE symbol = $1
        AND fiscal_period = $2
        AND fetched_at > NOW() - INTERVAL '24 hours'
      ORDER BY fiscal_year DESC, COALESCE(fiscal_quarter, 0) DESC
      LIMIT $3
    `;

    try {
      const result = await db.query(query, [symbol.toUpperCase(), frequency, years]);
      return result.rows.map(row => this.rowToFinancialData(row));
    } catch (error) {
      console.error(`[FUNDAMENTAL] Error fetching cached financials: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache financial data in the database
   * @param {string} symbol - Stock symbol
   * @param {Array} financials - Array of financial periods from Finnhub
   * @param {string} frequency - 'annual' or 'quarterly'
   */
  static async cacheFinancials(symbol, financials, frequency = 'annual') {
    const symbolUpper = symbol.toUpperCase();

    for (const period of financials) {
      try {
        // Use ON CONFLICT with the new unique index that includes fiscal_quarter
        const query = `
          INSERT INTO stock_financials_cache (
            symbol, fiscal_year, fiscal_period, fiscal_quarter,
            revenue, net_income, operating_income, gross_profit, ebit, ebitda,
            total_assets, total_liabilities, total_equity, long_term_debt, short_term_debt, total_debt, cash_and_equivalents,
            free_cash_flow, operating_cash_flow, capital_expenditures, dividends_paid,
            shares_outstanding, shares_basic, shares_diluted,
            filing_date, currency, raw_data, fetched_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())
          ON CONFLICT (symbol, fiscal_year, fiscal_period, COALESCE(fiscal_quarter, 0))
          DO UPDATE SET
            revenue = EXCLUDED.revenue,
            net_income = EXCLUDED.net_income,
            operating_income = EXCLUDED.operating_income,
            gross_profit = EXCLUDED.gross_profit,
            ebit = EXCLUDED.ebit,
            ebitda = EXCLUDED.ebitda,
            total_assets = EXCLUDED.total_assets,
            total_liabilities = EXCLUDED.total_liabilities,
            total_equity = EXCLUDED.total_equity,
            long_term_debt = EXCLUDED.long_term_debt,
            short_term_debt = EXCLUDED.short_term_debt,
            total_debt = EXCLUDED.total_debt,
            cash_and_equivalents = EXCLUDED.cash_and_equivalents,
            free_cash_flow = EXCLUDED.free_cash_flow,
            operating_cash_flow = EXCLUDED.operating_cash_flow,
            capital_expenditures = EXCLUDED.capital_expenditures,
            dividends_paid = EXCLUDED.dividends_paid,
            shares_outstanding = EXCLUDED.shares_outstanding,
            shares_basic = EXCLUDED.shares_basic,
            shares_diluted = EXCLUDED.shares_diluted,
            filing_date = EXCLUDED.filing_date,
            raw_data = EXCLUDED.raw_data,
            fetched_at = NOW()
        `;

        // Extract values from Finnhub response
        // Finnhub uses various field names depending on the data source
        const fiscalYear = period.year || new Date(period.period).getFullYear();
        // Get fiscal quarter for quarterly data (null for annual)
        const fiscalQuarter = frequency === 'quarterly' ? (period.quarter || period.fiscalQuarter || null) : null;

        await db.query(query, [
          symbolUpper,
          fiscalYear,
          frequency,
          fiscalQuarter,
          this.extractValue(period, ['revenue', 'totalRevenue', 'netSales']),
          this.extractValue(period, ['netIncome', 'netIncomeCommon']),
          this.extractValue(period, ['operatingIncome', 'operatingProfit']),
          this.extractValue(period, ['grossProfit', 'grossMargin']),
          this.extractValue(period, ['ebit']),
          this.extractValue(period, ['ebitda']),
          this.extractValue(period, ['totalAssets', 'assets']),
          this.extractValue(period, ['totalLiabilities', 'liabilities']),
          this.extractValue(period, ['totalEquity', 'stockholdersEquity', 'shareholdersEquity']),
          this.extractValue(period, ['longTermDebt', 'ltDebt']),
          this.extractValue(period, ['shortTermDebt', 'stDebt', 'currentDebt']),
          this.extractValue(period, ['totalDebt', 'debt']),
          this.extractValue(period, ['cashAndEquivalents', 'cash', 'cashAndCashEquivalents']),
          this.extractValue(period, ['freeCashFlow', 'fcf']),
          this.extractValue(period, ['operatingCashFlow', 'cashFromOperations']),
          this.extractValue(period, ['capitalExpenditures', 'capex']),
          this.extractValue(period, ['dividendsPaid', 'cashDividendsPaid']),
          // Round shares to integers for BIGINT database column
          (() => {
            const val = this.extractValue(period, ['sharesOutstanding', 'commonSharesOutstanding']);
            return val ? Math.round(val) : null;
          })(),
          (() => {
            const val = this.extractValue(period, ['sharesBasic', 'basicShares']);
            return val ? Math.round(val) : null;
          })(),
          (() => {
            const val = this.extractValue(period, ['sharesDiluted', 'dilutedShares']);
            return val ? Math.round(val) : null;
          })(),
          period.filingDate || period.period || null,
          period.currency || 'USD',
          JSON.stringify(period)
        ]);
      } catch (error) {
        console.error(`[FUNDAMENTAL] Error caching financial data for ${symbolUpper}: ${error.message}`);
      }
    }

    console.log(`[FUNDAMENTAL] Cached ${financials.length} periods for ${symbolUpper}`);
  }

  /**
   * Get company metrics (P/E, margins, etc.)
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Company metrics
   */
  static async getMetrics(symbol) {
    const symbolUpper = symbol.toUpperCase();
    return await finnhub.getBasicFinancials(symbolUpper);
  }

  /**
   * Get company profile (market cap, shares outstanding, etc.)
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Company profile
   */
  static async getProfile(symbol) {
    const symbolUpper = symbol.toUpperCase();
    return await finnhub.getCompanyProfile(symbolUpper);
  }

  /**
   * Get current quote
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Current quote
   */
  static async getQuote(symbol) {
    const symbolUpper = symbol.toUpperCase();
    return await finnhub.getQuote(symbolUpper);
  }

  /**
   * Calculate 5-year aggregated metrics for 8 Pillars
   * @param {string} symbol - Stock symbol
   * @param {boolean} forceRefresh - Force refresh from API (bypass cache)
   * @param {number} profileSharesOutstanding - Optional: shares outstanding from profile to use as fallback
   * @returns {Promise<Object>} Aggregated metrics
   */
  static async getFiveYearAggregates(symbol, forceRefresh = false, profileSharesOutstanding = null) {
    const financials = await this.getFinancials(symbol, 5, forceRefresh, 'annual', profileSharesOutstanding);

    if (financials.length < 2) {
      console.warn(`[FUNDAMENTAL] Insufficient data for 5-year aggregates (${financials.length} periods)`);
      return null;
    }

    // Normalize year field (handle both 'year' and 'fiscalYear' properties)
    const normalized = financials.map(f => ({
      ...f,
      fiscalYear: f.fiscalYear || f.year
    }));

    // Sort by year descending (most recent first)
    const sorted = normalized.sort((a, b) => b.fiscalYear - a.fiscalYear);

    // Current (most recent) and prior (5 years ago or oldest available)
    const current = sorted[0];
    const prior = sorted[sorted.length - 1];

    // Sum up 5 years of data
    const fiveYearTotals = sorted.reduce((acc, period) => {
      acc.netIncome += period.netIncome || 0;
      acc.freeCashFlow += period.freeCashFlow || 0;
      acc.revenue += period.revenue || 0;
      return acc;
    }, { netIncome: 0, freeCashFlow: 0, revenue: 0 });

    // Average values
    const avgEquity = sorted.reduce((sum, p) => sum + (p.totalEquity || 0), 0) / sorted.length;
    const avgDebt = sorted.reduce((sum, p) => sum + (p.totalDebt || 0), 0) / sorted.length;
    const avgFCF = fiveYearTotals.freeCashFlow / sorted.length;
    const avgNetIncome = fiveYearTotals.netIncome / sorted.length;
    const avgOperatingIncome = sorted.reduce((sum, p) => sum + (p.operatingIncome || 0), 0) / sorted.length;
    const avgRevenue = fiveYearTotals.revenue / sorted.length;

    // Debug logging for ROIC calculation
    console.log(`[FUNDAMENTAL] Aggregates Debug for ${symbol}:`);
    sorted.forEach((p, i) => {
      console.log(`[FUNDAMENTAL]   Year ${p.fiscalYear}: equity=${p.totalEquity}, debt=${p.totalDebt}, fcf=${p.freeCashFlow}, opIncome=${p.operatingIncome}`);
    });
    console.log(`[FUNDAMENTAL]   Averages: equity=${avgEquity}, debt=${avgDebt}, fcf=${avgFCF}, opIncome=${avgOperatingIncome}, netIncome=${avgNetIncome}`);

    // Include annual data for P/E and ROIC calculation per year
    const annualData = sorted.map(p => ({
      fiscalYear: p.fiscalYear,
      netIncome: p.netIncome,
      operatingIncome: p.operatingIncome,
      totalEquity: p.totalEquity,
      totalDebt: p.totalDebt,
      cashAndEquivalents: p.cashAndEquivalents,
      sharesOutstanding: p.sharesOutstanding,
      // Use EPS from financial statements if available, otherwise calculate
      eps: p.eps || (p.netIncome && p.sharesOutstanding ? p.netIncome / p.sharesOutstanding : null)
    }));

    return {
      periodsAnalyzed: sorted.length,
      yearsSpan: current.fiscalYear - prior.fiscalYear,
      current: {
        fiscalYear: current.fiscalYear,
        netIncome: current.netIncome,
        revenue: current.revenue,
        freeCashFlow: current.freeCashFlow,
        totalEquity: current.totalEquity,
        totalDebt: current.totalDebt,
        longTermDebt: current.longTermDebt,
        sharesOutstanding: current.sharesOutstanding
      },
      prior: {
        fiscalYear: prior.fiscalYear,
        netIncome: prior.netIncome,
        revenue: prior.revenue,
        freeCashFlow: prior.freeCashFlow,
        sharesOutstanding: prior.sharesOutstanding
      },
      fiveYearTotals,
      averages: {
        equity: avgEquity,
        debt: avgDebt,
        freeCashFlow: avgFCF,
        netIncome: avgNetIncome,
        operatingIncome: avgOperatingIncome,
        revenue: avgRevenue
      },
      annualData // For calculating individual year P/E ratios
    };
  }

  /**
   * Get year-end stock prices for P/E calculation
   * @param {string} symbol - Stock symbol
   * @param {Array<number>} years - Array of fiscal years to get prices for
   * @returns {Promise<Object>} Map of year to year-end price
   */
  static async getYearEndPrices(symbol, years) {
    const symbolUpper = symbol.toUpperCase();
    const yearEndPrices = {};

    try {
      // Get 5 years of weekly candles - this covers the date range we need
      const now = Math.floor(Date.now() / 1000);
      const fiveYearsAgo = now - (6 * 365 * 24 * 60 * 60); // 6 years to ensure coverage

      const candles = await finnhub.getStockCandles(symbolUpper, 'W', fiveYearsAgo, now);

      if (!candles || candles.length === 0) {
        console.warn(`[FUNDAMENTAL] No candle data for year-end prices for ${symbolUpper}`);
        return yearEndPrices;
      }

      // For each fiscal year, find the closing price closest to year end (Dec 31)
      for (const year of years) {
        // Target date is December 31st of the fiscal year
        const targetDate = new Date(year, 11, 31); // Month is 0-indexed
        const targetTimestamp = Math.floor(targetDate.getTime() / 1000);

        // Find the candle closest to year end (within 2 weeks)
        let closestCandle = null;
        let closestDistance = Infinity;

        for (const candle of candles) {
          const distance = Math.abs(candle.time - targetTimestamp);
          // Only consider candles within 14 days of year end
          if (distance < 14 * 24 * 60 * 60 && distance < closestDistance) {
            closestDistance = distance;
            closestCandle = candle;
          }
        }

        if (closestCandle) {
          yearEndPrices[year] = closestCandle.close;
          console.log(`[FUNDAMENTAL] Year-end price for ${symbolUpper} ${year}: $${closestCandle.close.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.warn(`[FUNDAMENTAL] Error getting year-end prices for ${symbolUpper}: ${error.message}`);
    }

    return yearEndPrices;
  }

  /**
   * Extract a value from an object using multiple possible field names
   * @param {Object} obj - Source object
   * @param {Array<string>} fieldNames - Array of possible field names
   * @returns {*} The first found value or null
   */
  static extractValue(obj, fieldNames) {
    for (const field of fieldNames) {
      if (obj[field] !== undefined && obj[field] !== null) {
        return obj[field];
      }
    }
    return null;
  }

  /**
   * Convert a database row to financial data format
   * @param {Object} row - Database row
   * @returns {Object} Financial data object (camelCase)
   */
  static rowToFinancialData(row) {
    return {
      year: row.fiscal_year,
      fiscalYear: row.fiscal_year,
      quarter: row.fiscal_quarter || null,
      fiscalQuarter: row.fiscal_quarter || null,
      fiscalPeriod: row.fiscal_period,
      revenue: parseFloat(row.revenue) || null,
      netIncome: parseFloat(row.net_income) || null,
      operatingIncome: parseFloat(row.operating_income) || null,
      grossProfit: parseFloat(row.gross_profit) || null,
      ebit: parseFloat(row.ebit) || null,
      ebitda: parseFloat(row.ebitda) || null,
      totalAssets: parseFloat(row.total_assets) || null,
      totalLiabilities: parseFloat(row.total_liabilities) || null,
      totalEquity: parseFloat(row.total_equity) || null,
      longTermDebt: parseFloat(row.long_term_debt) || null,
      shortTermDebt: parseFloat(row.short_term_debt) || null,
      totalDebt: parseFloat(row.total_debt) || null,
      cashAndEquivalents: parseFloat(row.cash_and_equivalents) || null,
      freeCashFlow: parseFloat(row.free_cash_flow) || null,
      operatingCashFlow: parseFloat(row.operating_cash_flow) || null,
      capitalExpenditures: parseFloat(row.capital_expenditures) || null,
      dividendsPaid: parseFloat(row.dividends_paid) || null,
      sharesOutstanding: parseInt(row.shares_outstanding) || null,
      sharesBasic: parseInt(row.shares_basic) || null,
      sharesDiluted: parseInt(row.shares_diluted) || null,
      filingDate: row.filing_date,
      currency: row.currency,
      fetchedAt: row.fetched_at
    };
  }

  /**
   * Check if data for a symbol needs refresh
   * @param {string} symbol - Stock symbol
   * @returns {Promise<boolean>} True if refresh needed
   */
  static async needsRefresh(symbol) {
    const query = `
      SELECT MAX(fetched_at) as last_fetch
      FROM stock_financials_cache
      WHERE symbol = $1
    `;

    try {
      const result = await db.query(query, [symbol.toUpperCase()]);
      if (!result.rows[0] || !result.rows[0].last_fetch) {
        return true;
      }

      const lastFetch = new Date(result.rows[0].last_fetch);
      const ageHours = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);

      // Refresh if older than 24 hours
      return ageHours > 24;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get crypto profile from Finnhub
   * @param {string} symbol - Crypto symbol (e.g., 'BTC', 'ETH')
   * @returns {Promise<Object>} Crypto profile data
   */
  static async getCryptoProfile(symbol) {
    const symbolUpper = symbol.toUpperCase();

    try {
      const profile = await finnhub.getCryptoProfile(symbolUpper);
      return profile;
    } catch (error) {
      console.warn(`[FUNDAMENTAL] Failed to get crypto profile for ${symbolUpper}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a symbol is a cryptocurrency
   * Uses the common crypto symbols list from finnhub client
   * @param {string} symbol - Symbol to check
   * @returns {Promise<boolean>} True if crypto
   */
  static async isCryptoSymbol(symbol) {
    // Only use the known crypto symbols list to avoid misidentifying stocks as crypto
    return finnhub.isCryptoSymbol(symbol);
  }

  /**
   * Extract a value from SEC reported data array
   * Used for SEC filings display
   * @param {Array} data - Array of {concept, label, value, unit}
   * @param {string} conceptName - Partial concept name to search for
   * @returns {number|null} The value or null
   */
  static extractReportedValue(data, conceptName) {
    if (!Array.isArray(data)) return null;

    const nameLower = conceptName.toLowerCase();
    const item = data.find(d =>
      d.concept && d.concept.toLowerCase().includes(nameLower)
    );

    return item?.value ?? null;
  }
}

module.exports = FundamentalDataService;

const db = require('../config/database');

class YearWrappedService {

  /**
   * Record a login for the user (call this on successful authentication)
   */
  static async recordLogin(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Upsert login history entry for today
      await db.query(`
        INSERT INTO user_login_history (user_id, login_date, login_count)
        VALUES ($1, $2, 1)
        ON CONFLICT (user_id, login_date)
        DO UPDATE SET login_count = user_login_history.login_count + 1
      `, [userId, today]);

      // Update login streaks
      await this.updateLoginStreaks(userId);

      return true;
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error recording login:', error);
      // Don't throw - login recording should not block authentication
      return false;
    }
  }

  /**
   * Update the user's login streak in gamification stats
   */
  static async updateLoginStreaks(userId) {
    try {
      // Get the user's login dates ordered descending
      const result = await db.query(`
        SELECT login_date
        FROM user_login_history
        WHERE user_id = $1
        ORDER BY login_date DESC
      `, [userId]);

      if (result.rows.length === 0) {
        return;
      }

      const loginDates = result.rows.map(r => new Date(r.login_date));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate current streak (consecutive days including today or yesterday)
      let currentStreak = 0;
      let checkDate = new Date(today);

      // Check if user logged in today or yesterday to start counting
      const mostRecentLogin = loginDates[0];
      mostRecentLogin.setHours(0, 0, 0, 0);

      const daysSinceLastLogin = Math.floor((today - mostRecentLogin) / (1000 * 60 * 60 * 24));

      if (daysSinceLastLogin <= 1) {
        // Start counting from the most recent login
        checkDate = new Date(mostRecentLogin);

        for (const loginDate of loginDates) {
          loginDate.setHours(0, 0, 0, 0);

          if (loginDate.getTime() === checkDate.getTime()) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else if (loginDate.getTime() < checkDate.getTime()) {
            // Gap in streak
            break;
          }
        }
      }

      // Calculate longest streak ever
      let longestStreak = 0;
      let tempStreak = 0;
      let prevDate = null;

      // Sort ascending for longest streak calculation
      const sortedDates = [...loginDates].sort((a, b) => a - b);

      for (const loginDate of sortedDates) {
        loginDate.setHours(0, 0, 0, 0);

        if (prevDate === null) {
          tempStreak = 1;
        } else {
          const diffDays = Math.floor((loginDate - prevDate) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
        prevDate = loginDate;
      }
      longestStreak = Math.max(longestStreak, tempStreak);

      // Update gamification stats
      await db.query(`
        INSERT INTO user_gamification_stats (user_id, current_login_streak_days, longest_login_streak_days, last_login_streak_date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id)
        DO UPDATE SET
          current_login_streak_days = $2,
          longest_login_streak_days = GREATEST(user_gamification_stats.longest_login_streak_days, $3),
          last_login_streak_date = $4,
          updated_at = NOW()
      `, [userId, currentStreak, longestStreak, today.toISOString().split('T')[0]]);

    } catch (error) {
      console.error('[YEAR_WRAPPED] Error updating login streaks:', error);
    }
  }

  /**
   * Check if the Year Wrapped banner should be shown for a user
   * Banner appears only during the last 2 weeks of the year (Dec 17-31)
   */
  static async shouldShowBanner(userId) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed (11 = December)
      const currentDay = now.getDate();

      // Only show banner in the last 2 weeks of December (Dec 17-31)
      // After the year ends, banner should not appear
      if (currentMonth !== 11 || currentDay < 17) {
        return { show: false, year: null };
      }

      // Show wrapped for the current year
      const wrappedYear = currentYear;

      // Check if user has trades for that year
      const tradesCheck = await db.query(`
        SELECT COUNT(*) as count
        FROM trades
        WHERE user_id = $1
          AND EXTRACT(YEAR FROM trade_date) = $2
          AND exit_price IS NOT NULL
      `, [userId, wrappedYear]);

      if (parseInt(tradesCheck.rows[0].count) === 0) {
        return { show: false, year: null };
      }

      // Banner dismiss is session-based (handled in frontend store)
      // No persistent preference check needed

      return { show: true, year: wrappedYear };
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error checking banner status:', error);
      return { show: false, year: null };
    }
  }

  /**
   * Dismiss the banner for a specific year
   */
  static async dismissBanner(userId, year) {
    try {
      await db.query(`
        INSERT INTO year_wrapped_preferences (user_id, show_banner, last_dismissed_year)
        VALUES ($1, true, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET last_dismissed_year = $2, updated_at = NOW()
      `, [userId, year]);

      return true;
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error dismissing banner:', error);
      throw error;
    }
  }

  /**
   * Mark Year Wrapped as viewed
   */
  static async markAsViewed(userId, year) {
    try {
      await db.query(`
        UPDATE year_wrapped_data
        SET viewed_at = NOW()
        WHERE user_id = $1 AND year = $2
      `, [userId, year]);

      return true;
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error marking as viewed:', error);
      throw error;
    }
  }

  /**
   * Get Year Wrapped data (from cache or generate)
   */
  static async getYearWrapped(userId, year, forceRegenerate = false) {
    try {
      // Check cache first (unless forcing regeneration)
      if (!forceRegenerate) {
        const cached = await db.query(`
          SELECT data, generated_at
          FROM year_wrapped_data
          WHERE user_id = $1 AND year = $2
        `, [userId, year]);

        if (cached.rows.length > 0) {
          // Return cached data if it's less than 24 hours old or the year has ended
          const generatedAt = new Date(cached.rows[0].generated_at);
          const now = new Date();
          const hoursSinceGeneration = (now - generatedAt) / (1000 * 60 * 60);
          const yearEnded = year < now.getFullYear();

          if (yearEnded || hoursSinceGeneration < 24) {
            return cached.rows[0].data;
          }
        }
      }

      // Generate fresh data
      const data = await this.generateYearWrapped(userId, year);

      // Cache the result
      await db.query(`
        INSERT INTO year_wrapped_data (user_id, year, data, generated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, year)
        DO UPDATE SET data = $3, generated_at = NOW()
      `, [userId, year, JSON.stringify(data)]);

      return data;
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error getting year wrapped:', error);
      throw error;
    }
  }

  /**
   * Generate Year Wrapped data for a user
   */
  static async generateYearWrapped(userId, year) {
    console.log(`[YEAR_WRAPPED] Generating wrapped for user ${userId}, year ${year}`);

    const [
      coreMetrics,
      topTrades,
      topSymbol,
      patterns,
      streaks,
      comparison,
      monthlyBreakdown
    ] = await Promise.all([
      this.getCoreMetrics(userId, year),
      this.getTopTrades(userId, year),
      this.getTopSymbol(userId, year),
      this.getTradingPatterns(userId, year),
      this.getStreaks(userId, year),
      this.getYearOverYearComparison(userId, year),
      this.getMonthlyBreakdown(userId, year)
    ]);

    return {
      year,
      generatedAt: new Date().toISOString(),

      // Core metrics
      totalTrades: coreMetrics.totalTrades,
      winningTrades: coreMetrics.winningTrades,
      losingTrades: coreMetrics.losingTrades,
      breakevenTrades: coreMetrics.breakevenTrades,
      totalPnL: coreMetrics.totalPnL,
      winRate: coreMetrics.winRate,
      avgPnL: coreMetrics.avgPnL,
      uniqueSymbolsTraded: coreMetrics.uniqueSymbolsTraded,
      tradingDays: coreMetrics.tradingDays,

      // Top performers
      bestTrade: topTrades.best,
      worstTrade: topTrades.worst,
      topSymbol,

      // Patterns
      patterns,

      // Streaks
      streaks,

      // Year comparison
      comparison,

      // Monthly data for chart
      monthlyBreakdown
    };
  }

  /**
   * Get core trading metrics for the year
   */
  static async getCoreMetrics(userId, year) {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
        COUNT(*) FILTER (WHERE pnl < 0) as losing_trades,
        COUNT(*) FILTER (WHERE pnl = 0) as breakeven_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_pnl,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE pnl > 0)::float / COUNT(*) * 100)
          ELSE 0
        END as win_rate,
        COUNT(DISTINCT symbol) as unique_symbols,
        COUNT(DISTINCT trade_date) as trading_days
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
    `, [userId, year]);

    const row = result.rows[0];

    return {
      totalTrades: parseInt(row.total_trades) || 0,
      winningTrades: parseInt(row.winning_trades) || 0,
      losingTrades: parseInt(row.losing_trades) || 0,
      breakevenTrades: parseInt(row.breakeven_trades) || 0,
      totalPnL: parseFloat(row.total_pnl) || 0,
      avgPnL: parseFloat(row.avg_pnl) || 0,
      winRate: parseFloat(row.win_rate) || 0,
      uniqueSymbolsTraded: parseInt(row.unique_symbols) || 0,
      tradingDays: parseInt(row.trading_days) || 0
    };
  }

  /**
   * Get best and worst trades of the year
   */
  static async getTopTrades(userId, year) {
    const result = await db.query(`
      WITH ranked_trades AS (
        SELECT
          id, symbol, pnl, pnl_percent, trade_date,
          ROW_NUMBER() OVER (ORDER BY pnl DESC) as best_rank,
          ROW_NUMBER() OVER (ORDER BY pnl ASC) as worst_rank
        FROM trades
        WHERE user_id = $1
          AND EXTRACT(YEAR FROM trade_date) = $2
          AND exit_price IS NOT NULL
      )
      SELECT * FROM ranked_trades
      WHERE best_rank = 1 OR worst_rank = 1
    `, [userId, year]);

    let best = null;
    let worst = null;

    for (const row of result.rows) {
      const trade = {
        id: row.id,
        symbol: row.symbol,
        pnl: parseFloat(row.pnl),
        percentGain: parseFloat(row.pnl_percent) || 0,
        date: row.trade_date
      };

      if (parseInt(row.best_rank) === 1) {
        best = trade;
      }
      if (parseInt(row.worst_rank) === 1) {
        worst = trade;
      }
    }

    return { best, worst };
  }

  /**
   * Get the top symbol by total P&L
   */
  static async getTopSymbol(userId, year) {
    const result = await db.query(`
      SELECT
        symbol,
        SUM(pnl) as total_pnl,
        COUNT(*) as trade_count,
        COUNT(*) FILTER (WHERE pnl > 0) as wins,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE pnl > 0)::float / COUNT(*) * 100)
          ELSE 0
        END as win_rate
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
      GROUP BY symbol
      ORDER BY total_pnl DESC
      LIMIT 1
    `, [userId, year]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      symbol: row.symbol,
      totalPnL: parseFloat(row.total_pnl),
      tradeCount: parseInt(row.trade_count),
      wins: parseInt(row.wins),
      winRate: parseFloat(row.win_rate)
    };
  }

  /**
   * Get trading patterns (day of week, time of day, strategy, hold time)
   */
  static async getTradingPatterns(userId, year) {
    // Most traded day of week
    const dayResult = await db.query(`
      SELECT
        EXTRACT(DOW FROM trade_date) as day_of_week,
        COUNT(*) as trade_count
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
      GROUP BY day_of_week
      ORDER BY trade_count DESC
      LIMIT 1
    `, [userId, year]);

    // Most traded hour
    const hourResult = await db.query(`
      SELECT
        EXTRACT(HOUR FROM entry_time) as hour,
        COUNT(*) as trade_count
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
        AND entry_time IS NOT NULL
      GROUP BY hour
      ORDER BY trade_count DESC
      LIMIT 1
    `, [userId, year]);

    // Favorite strategy
    const strategyResult = await db.query(`
      SELECT
        strategy,
        COUNT(*) as trade_count,
        SUM(pnl) as total_pnl
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
        AND strategy IS NOT NULL
        AND strategy != ''
      GROUP BY strategy
      ORDER BY trade_count DESC
      LIMIT 1
    `, [userId, year]);

    // Average hold time
    const holdTimeResult = await db.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 3600) as avg_hold_hours
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
        AND entry_time IS NOT NULL
        AND exit_time IS NOT NULL
    `, [userId, year]);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      mostTradedDay: dayResult.rows.length > 0 ? {
        day: dayNames[parseInt(dayResult.rows[0].day_of_week)],
        dayNumber: parseInt(dayResult.rows[0].day_of_week),
        count: parseInt(dayResult.rows[0].trade_count)
      } : null,

      mostTradedHour: hourResult.rows.length > 0 ? {
        hour: parseInt(hourResult.rows[0].hour),
        count: parseInt(hourResult.rows[0].trade_count)
      } : null,

      favoriteStrategy: strategyResult.rows.length > 0 ? {
        name: strategyResult.rows[0].strategy,
        count: parseInt(strategyResult.rows[0].trade_count),
        totalPnL: parseFloat(strategyResult.rows[0].total_pnl)
      } : null,

      avgHoldTimeHours: holdTimeResult.rows[0]?.avg_hold_hours
        ? parseFloat(holdTimeResult.rows[0].avg_hold_hours)
        : null
    };
  }

  /**
   * Get login and trading streaks for the year
   */
  static async getStreaks(userId, year) {
    // Login days and streak for the year
    const loginResult = await db.query(`
      WITH login_dates AS (
        SELECT DISTINCT login_date
        FROM user_login_history
        WHERE user_id = $1 AND EXTRACT(YEAR FROM login_date) = $2
        ORDER BY login_date
      ),
      streaks AS (
        SELECT
          login_date,
          login_date - (ROW_NUMBER() OVER (ORDER BY login_date))::int as streak_group
        FROM login_dates
      ),
      streak_lengths AS (
        SELECT
          streak_group,
          COUNT(*) as streak_length
        FROM streaks
        GROUP BY streak_group
      )
      SELECT
        (SELECT COUNT(*) FROM login_dates) as login_days_total,
        COALESCE(MAX(streak_length), 0) as longest_login_streak
      FROM streak_lengths
    `, [userId, year]);

    // Trading days and streak for the year
    const tradingResult = await db.query(`
      WITH trading_dates AS (
        SELECT DISTINCT trade_date
        FROM trades
        WHERE user_id = $1
          AND EXTRACT(YEAR FROM trade_date) = $2
          AND exit_price IS NOT NULL
        ORDER BY trade_date
      ),
      streaks AS (
        SELECT
          trade_date,
          trade_date - (ROW_NUMBER() OVER (ORDER BY trade_date))::int as streak_group
        FROM trading_dates
      ),
      streak_lengths AS (
        SELECT
          streak_group,
          COUNT(*) as streak_length
        FROM streaks
        GROUP BY streak_group
      )
      SELECT
        (SELECT COUNT(*) FROM trading_dates) as trading_days_total,
        COALESCE(MAX(streak_length), 0) as longest_trading_streak
      FROM streak_lengths
    `, [userId, year]);

    // Get all-time streaks from gamification stats
    const allTimeResult = await db.query(`
      SELECT
        current_login_streak_days,
        longest_login_streak_days,
        current_streak_days as current_trading_streak_days,
        longest_streak_days as longest_trading_streak_days
      FROM user_gamification_stats
      WHERE user_id = $1
    `, [userId]);

    const loginRow = loginResult.rows[0] || {};
    const tradingRow = tradingResult.rows[0] || {};
    const allTimeRow = allTimeResult.rows[0] || {};

    return {
      loginDaysTotal: parseInt(loginRow.login_days_total) || 0,
      longestLoginStreak: parseInt(loginRow.longest_login_streak) || 0,
      tradingDaysTotal: parseInt(tradingRow.trading_days_total) || 0,
      longestTradingStreak: parseInt(tradingRow.longest_trading_streak) || 0,

      // All-time stats
      allTime: {
        currentLoginStreak: parseInt(allTimeRow.current_login_streak_days) || 0,
        longestLoginStreak: parseInt(allTimeRow.longest_login_streak_days) || 0,
        currentTradingStreak: parseInt(allTimeRow.current_trading_streak_days) || 0,
        longestTradingStreak: parseInt(allTimeRow.longest_trading_streak_days) || 0
      }
    };
  }

  /**
   * Get year-over-year comparison
   */
  static async getYearOverYearComparison(userId, year) {
    const prevYear = year - 1;

    const result = await db.query(`
      SELECT
        EXTRACT(YEAR FROM trade_date) as year,
        COUNT(*) as total_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE pnl > 0)::float / COUNT(*) * 100)
          ELSE 0
        END as win_rate
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) IN ($2, $3)
        AND exit_price IS NOT NULL
      GROUP BY year
      ORDER BY year
    `, [userId, prevYear, year]);

    const yearData = {};
    for (const row of result.rows) {
      yearData[parseInt(row.year)] = {
        totalTrades: parseInt(row.total_trades),
        totalPnL: parseFloat(row.total_pnl),
        winRate: parseFloat(row.win_rate)
      };
    }

    const currentYearData = yearData[year];
    const prevYearData = yearData[prevYear];

    if (!currentYearData) {
      return { hasPreviousYear: false };
    }

    if (!prevYearData) {
      return {
        hasPreviousYear: false,
        currentYear: currentYearData
      };
    }

    const pnlGrowthPercent = prevYearData.totalPnL !== 0
      ? ((currentYearData.totalPnL - prevYearData.totalPnL) / Math.abs(prevYearData.totalPnL)) * 100
      : null;

    const tradeGrowthPercent = prevYearData.totalTrades !== 0
      ? ((currentYearData.totalTrades - prevYearData.totalTrades) / prevYearData.totalTrades) * 100
      : null;

    return {
      hasPreviousYear: true,
      previousYearPnL: prevYearData.totalPnL,
      currentYearPnL: currentYearData.totalPnL,
      pnlGrowthPercent,
      previousYearTrades: prevYearData.totalTrades,
      currentYearTrades: currentYearData.totalTrades,
      tradeGrowthPercent,
      previousYearWinRate: prevYearData.winRate,
      currentYearWinRate: currentYearData.winRate,
      winRateChange: currentYearData.winRate - prevYearData.winRate
    };
  }

  /**
   * Get monthly breakdown for the year
   */
  static async getMonthlyBreakdown(userId, year) {
    const result = await db.query(`
      SELECT
        EXTRACT(MONTH FROM trade_date) as month,
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE pnl > 0) as wins,
        COUNT(*) FILTER (WHERE pnl < 0) as losses,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_pnl,
        MAX(pnl) as best_trade,
        MIN(pnl) as worst_trade,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE pnl > 0)::float / COUNT(*) * 100)
          ELSE 0
        END as win_rate
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM trade_date) = $2
        AND exit_price IS NOT NULL
      GROUP BY month
      ORDER BY month
    `, [userId, year]);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Create array with all 12 months (fill in zeros for missing months)
    const monthlyData = [];
    const monthMap = {};

    for (const row of result.rows) {
      monthMap[parseInt(row.month)] = {
        month: parseInt(row.month),
        monthName: monthNames[parseInt(row.month) - 1],
        trades: parseInt(row.total_trades),
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        pnl: parseFloat(row.total_pnl),
        avgPnl: parseFloat(row.avg_pnl),
        bestTrade: parseFloat(row.best_trade),
        worstTrade: parseFloat(row.worst_trade),
        winRate: parseFloat(row.win_rate)
      };
    }

    // Fill in all 12 months
    for (let i = 1; i <= 12; i++) {
      monthlyData.push(monthMap[i] || {
        month: i,
        monthName: monthNames[i - 1],
        trades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        avgPnl: 0,
        bestTrade: null,
        worstTrade: null,
        winRate: 0
      });
    }

    return monthlyData;
  }
}

module.exports = YearWrappedService;

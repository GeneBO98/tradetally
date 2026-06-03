const Trade = require('../models/Trade');
const Diary = require('../models/Diary');
const Account = require('../models/Account');

/**
 * Creates sample data for new users on billing-enabled instances.
 * All sample trades are tagged with 'sample' and broker 'Sample'
 * so they can be easily identified and removed.
 */
class SampleDataService {
  /**
   * Generate trading dates relative to today, skipping weekends
   */
  static getTradingDays(count) {
    const days = [];
    const now = new Date();
    let d = new Date(now);
    d.setDate(d.getDate() - 1); // Start from yesterday

    while (days.length < count) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(d));
      }
      d.setDate(d.getDate() - 1);
    }

    return days.reverse(); // Oldest first
  }

  /**
   * Format a Date as YYYY-MM-DD
   */
  static fmt(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Create all sample data for a new user
   */
  static async createForUser(userId) {
    console.log(`[SAMPLE-DATA] Creating sample data for user ${userId}`);

    const tradingDays = this.getTradingDays(10);
    const today = new Date();
    const todayStr = this.fmt(today);

    // Sample trades: ~12 closed (8 winners, 4 losers) + 1 open AAPL
    const closedTrades = [
      // Day 1 - NVDA winner (day trade)
      // MAE: dipped $0.50 to 118.00 before running. MFE: peaked at 122.10 (+$3.60), exited early at 121.30.
      {
        symbol: 'NVDA', side: 'long',
        entryPrice: 118.50, exitPrice: 121.30, quantity: 50,
        tradeDate: this.fmt(tradingDays[0]),
        entryTime: `${this.fmt(tradingDays[0])}T10:15:00`,
        exitTime: `${this.fmt(tradingDays[0])}T14:30:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 117.00, takeProfit: 122.00,
        mae: 25.00, mfe: 180.00,
      },
      // Day 2 - SPY loser (day trade)
      // MAE: stopped out at 571.45 (-$1.75/sh). MFE: briefly ticked to 573.80 before reversing.
      {
        symbol: 'SPY', side: 'long',
        entryPrice: 573.20, exitPrice: 571.45, quantity: 100,
        tradeDate: this.fmt(tradingDays[1]),
        entryTime: `${this.fmt(tradingDays[1])}T09:35:00`,
        exitTime: `${this.fmt(tradingDays[1])}T11:20:00`,
        commission: 1.00, strategy: 'day_trading', stopLoss: 571.00, takeProfit: 576.00,
        mae: 175.00, mfe: 60.00,
      },
      // Day 2 - META winner (day trade)
      // MAE: small dip to 584.35. MFE: ran to 593.80, exited at 592.75 — left $26.25 on table.
      {
        symbol: 'META', side: 'long',
        entryPrice: 585.00, exitPrice: 592.75, quantity: 25,
        tradeDate: this.fmt(tradingDays[1]),
        entryTime: `${this.fmt(tradingDays[1])}T13:00:00`,
        exitTime: `${this.fmt(tradingDays[1])}T15:30:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 582.00, takeProfit: 594.00,
        mae: 16.25, mfe: 222.50,
      },
      // Day 3 - TSLA loser (day trade, short)
      // Adverse (short): price ran to 255.60 before we stopped at 255.10. MFE (short): briefly dipped to 251.80.
      {
        symbol: 'TSLA', side: 'short',
        entryPrice: 252.80, exitPrice: 255.10, quantity: 40,
        tradeDate: this.fmt(tradingDays[2]),
        entryTime: `${this.fmt(tradingDays[2])}T10:45:00`,
        exitTime: `${this.fmt(tradingDays[2])}T13:15:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 255.50, takeProfit: 249.00,
        mae: 112.00, mfe: 40.00,
      },
      // Day 4 - MSFT winner (swing trade, held 2 days)
      // MAE: overnight dip to 394.85. MFE: touched 403.50, exited at 402.20.
      {
        symbol: 'MSFT', side: 'long',
        entryPrice: 395.50, exitPrice: 402.20, quantity: 30,
        tradeDate: this.fmt(tradingDays[3]),
        entryTime: `${this.fmt(tradingDays[3])}T10:00:00`,
        exitTime: `${this.fmt(tradingDays[4])}T14:00:00`,
        commission: 0.50, strategy: 'swing_trading', stopLoss: 392.00, takeProfit: 405.00,
        mae: 19.50, mfe: 240.00,
      },
      // Day 5 - AMD winner (day trade)
      // MAE: tested 117.00 support. MFE: hit 120.60 before pulling back to 119.80 exit.
      {
        symbol: 'AMD', side: 'long',
        entryPrice: 117.25, exitPrice: 119.80, quantity: 75,
        tradeDate: this.fmt(tradingDays[4]),
        entryTime: `${this.fmt(tradingDays[4])}T09:45:00`,
        exitTime: `${this.fmt(tradingDays[4])}T12:30:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 116.00, takeProfit: 120.50,
        mae: 18.75, mfe: 251.25,
      },
      // Day 6 - GOOGL winner (day trade)
      // MAE: quick wick to 163.05. MFE: extended to 166.85 before we exited at 166.10.
      {
        symbol: 'GOOGL', side: 'long',
        entryPrice: 163.40, exitPrice: 166.10, quantity: 60,
        tradeDate: this.fmt(tradingDays[5]),
        entryTime: `${this.fmt(tradingDays[5])}T11:00:00`,
        exitTime: `${this.fmt(tradingDays[5])}T15:00:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 162.00, takeProfit: 167.00,
        mae: 21.00, mfe: 207.00,
      },
      // Day 7 - SPY winner (day trade)
      // MAE: opened with small dip to 574.15. MFE: ran to 578.40 past TP, exited at 577.80.
      {
        symbol: 'SPY', side: 'long',
        entryPrice: 574.50, exitPrice: 577.80, quantity: 100,
        tradeDate: this.fmt(tradingDays[6]),
        entryTime: `${this.fmt(tradingDays[6])}T09:32:00`,
        exitTime: `${this.fmt(tradingDays[6])}T11:45:00`,
        commission: 1.00, strategy: 'day_trading', stopLoss: 573.00, takeProfit: 578.00,
        mae: 35.00, mfe: 390.00,
      },
      // Day 7 - NVDA loser (day trade)
      // MAE: hit stop at 120.00 (-$2.00/sh). MFE: only got to 122.80 before reversing hard.
      {
        symbol: 'NVDA', side: 'long',
        entryPrice: 122.00, exitPrice: 120.15, quantity: 50,
        tradeDate: this.fmt(tradingDays[6]),
        entryTime: `${this.fmt(tradingDays[6])}T13:30:00`,
        exitTime: `${this.fmt(tradingDays[6])}T15:15:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 120.00, takeProfit: 124.50,
        mae: 100.00, mfe: 40.00,
      },
      // Day 8 - TSLA winner (day trade, short)
      // MAE (short): briefly squeezed to 259.20. MFE (short): fell to 252.50, exited at 253.20.
      {
        symbol: 'TSLA', side: 'short',
        entryPrice: 258.40, exitPrice: 253.20, quantity: 30,
        tradeDate: this.fmt(tradingDays[7]),
        entryTime: `${this.fmt(tradingDays[7])}T10:30:00`,
        exitTime: `${this.fmt(tradingDays[7])}T14:45:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 261.00, takeProfit: 253.00,
        mae: 24.00, mfe: 177.00,
      },
      // Day 9 - META winner (swing trade, held to day 10)
      // MAE: initial pullback to 589.60. MFE: pushed to 600.50 past TP, exited at 598.60.
      {
        symbol: 'META', side: 'long',
        entryPrice: 590.25, exitPrice: 598.60, quantity: 20,
        tradeDate: this.fmt(tradingDays[8]),
        entryTime: `${this.fmt(tradingDays[8])}T11:15:00`,
        exitTime: `${this.fmt(tradingDays[9])}T10:30:00`,
        commission: 0.50, strategy: 'swing_trading', stopLoss: 586.00, takeProfit: 600.00,
        mae: 13.00, mfe: 205.00,
      },
      // Day 10 - AMD loser (day trade)
      // MAE: dropped to 118.80, stopped out at 118.90. MFE: briefly ran to 121.30 before collapsing.
      {
        symbol: 'AMD', side: 'long',
        entryPrice: 120.50, exitPrice: 118.90, quantity: 60,
        tradeDate: this.fmt(tradingDays[9]),
        entryTime: `${this.fmt(tradingDays[9])}T09:40:00`,
        exitTime: `${this.fmt(tradingDays[9])}T12:00:00`,
        commission: 0.50, strategy: 'day_trading', stopLoss: 118.50, takeProfit: 123.00,
        mae: 102.00, mfe: 48.00,
      },
    ];

    // Open position - AAPL long, entered yesterday
    const yesterday = tradingDays[tradingDays.length - 1];
    const openTrade = {
      symbol: 'AAPL',
      side: 'long',
      entryPrice: 217.50,
      exitPrice: null,
      exitTime: null,
      quantity: 50,
      tradeDate: this.fmt(yesterday),
      entryTime: `${this.fmt(yesterday)}T10:00:00`,
      commission: 0.50,
      strategy: 'swing_trading',
      stopLoss: 213.00,
      takeProfit: 225.00,
    };

    // Create all trades
    const allTrades = [...closedTrades, openTrade];
    let created = 0;

    for (const trade of allTrades) {
      try {
        await Trade.create(userId, {
          ...trade,
          broker: 'Sample',
          tags: ['sample'],
          account_identifier: 'SAMPLE',
        }, { skipApiCalls: true });
        created++;
      } catch (err) {
        console.log(`[SAMPLE-DATA] Failed to create trade ${trade.symbol}: ${err.message}`);
      }
    }

    console.log(`[SAMPLE-DATA] Created ${created}/${allTrades.length} sample trades`);

    // Create sample journal entry for today
    try {
      await Diary.create(userId, {
        entryDate: todayStr,
        entryType: 'diary',
        title: 'Sample Journal Entry',
        content: 'This is an example journal entry to show you how the trading journal works. Use this space to document your pre-market analysis, trade plan, and post-market reflections.\n\nPre-market thoughts:\n- Watching SPY for a breakout above 575\n- AAPL holding strong, keeping my swing position open\n- NVDA earnings coming up, staying cautious on size\n\nEnd of day reflection:\n- Stuck to my plan today, avoided overtrading\n- Need to work on taking profits earlier on day trades',
        marketBias: 'bullish',
        keyLevels: 'SPY 575 resistance, AAPL 220 target, NVDA 125 support',
        watchlist: ['SPY', 'AAPL', 'NVDA', 'TSLA'],
        followedPlan: true,
        lessonsLearned: 'Patience with swing trades is paying off. The AAPL position is working because I gave it room with a wider stop.',
        tags: ['sample'],
      });
      console.log('[SAMPLE-DATA] Created sample journal entry');
    } catch (err) {
      console.log(`[SAMPLE-DATA] Failed to create journal entry: ${err.message}`);
    }

    // Create sample account
    try {
      await Account.create(userId, {
        accountName: 'Sample Account',
        accountIdentifier: 'SAMPLE',
        broker: 'Other',
        initialBalance: 25000,
        initialBalanceDate: this.fmt(tradingDays[0]),
        isPrimary: true,
        notes: 'Sample trading account with demo data. You can remove this after importing your own trades.',
      });
      console.log('[SAMPLE-DATA] Created sample account');
    } catch (err) {
      console.log(`[SAMPLE-DATA] Failed to create sample account: ${err.message}`);
    }

    // Seed behavioural settings and run the historical analyzers in-process so
    // the Behavioral Analytics page shows real findings on first load, without
    // the user having to click "Analyze". Best-effort: never block signup.
    await this._seedBehavioralSettings(userId);
    await this._runHistoricalAnalyzers(userId);

    console.log(`[SAMPLE-DATA] Sample data creation complete for user ${userId}`);
  }

  /**
   * Ensure default behavioural & overconfidence settings rows exist so the
   * Behavioral Analytics overview can render for the new user.
   */
  static async _seedBehavioralSettings(userId) {
    const db = require('../config/database');
    try {
      await db.query(`
        INSERT INTO behavioral_settings
          (user_id, revenge_trading_enabled, revenge_trading_sensitivity,
           cooling_period_minutes, enable_trade_blocking, loss_aversion_sensitivity, min_trades_for_analysis)
        VALUES ($1, true, 'medium', 30, false, 'medium', 10)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);
      await db.query(`
        INSERT INTO overconfidence_settings
          (user_id, detection_enabled, min_streak_length, position_increase_threshold, sensitivity)
        VALUES ($1, true, 4, 40.00, 'medium')
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);
    } catch (err) {
      console.log(`[SAMPLE-DATA] Failed to seed behavioural settings: ${err.message}`);
    }
  }

  /**
   * Run each behavioural analyzer once over the freshly-created sample trades
   * so their findings are persisted for the Behavioral Analytics page. Each is
   * wrapped so a single failure never blocks the others (or signup).
   */
  static async _runHistoricalAnalyzers(userId) {
    try {
      const LossAversionAnalyticsService = require('./lossAversionAnalyticsService');
      const result = await LossAversionAnalyticsService.analyzeLossAversion(userId);
      if (result?.error) {
        console.log(`[SAMPLE-DATA] Loss aversion analyzer skipped: ${result.error}`);
      } else {
        console.log('[SAMPLE-DATA] Loss aversion analysis persisted');
      }
    } catch (err) {
      console.log(`[SAMPLE-DATA] Loss aversion analyzer failed: ${err.message}`);
    }

    try {
      const OverconfidenceAnalyticsService = require('./overconfidenceAnalyticsService');
      await OverconfidenceAnalyticsService.analyzeHistoricalTrades(userId);
      console.log('[SAMPLE-DATA] Overconfidence analysis persisted');
    } catch (err) {
      console.log(`[SAMPLE-DATA] Overconfidence analyzer failed: ${err.message}`);
    }

    try {
      const BehavioralAnalyticsServiceV2 = require('./behavioralAnalyticsServiceV2');
      await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2(userId);
      console.log('[SAMPLE-DATA] Revenge-trade historical analysis persisted');
    } catch (err) {
      console.log(`[SAMPLE-DATA] Revenge-trade analyzer failed: ${err.message}`);
    }
  }

  /**
   * Remove all sample data for a user
   */
  static async removeForUser(userId) {
    const db = require('../config/database');
    const AnalyticsCache = require('./analyticsCache');

    console.log(`[SAMPLE-DATA] Removing sample data for user ${userId}`);

    // Delete sample trades (tagged with 'sample')
    const tradeResult = await db.query(
      `DELETE FROM trades WHERE user_id = $1 AND 'sample' = ANY(tags) RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${tradeResult.rowCount} sample trades`);

    // Delete sample journal entries (tagged with 'sample')
    const diaryResult = await db.query(
      `DELETE FROM diary_entries WHERE user_id = $1 AND 'sample' = ANY(tags) RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${diaryResult.rowCount} sample journal entries`);

    // Delete sample account
    const accountResult = await db.query(
      `DELETE FROM user_accounts WHERE user_id = $1 AND account_identifier = 'SAMPLE' RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${accountResult.rowCount} sample accounts`);

    try {
      await AnalyticsCache.invalidate(userId);
    } catch (err) {
      console.log(`[SAMPLE-DATA] Cache invalidation warning: ${err.message}`);
    }

    return {
      trades_deleted: tradeResult.rowCount,
      diary_entries_deleted: diaryResult.rowCount,
      accounts_deleted: accountResult.rowCount,
    };
  }

  /**
   * Check if a user has sample data
   */
  static async hasSampleData(userId) {
    const db = require('../config/database');
    const result = await db.query(
      `SELECT COUNT(*) as count FROM trades WHERE user_id = $1 AND 'sample' = ANY(tags)`,
      [userId]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}

module.exports = SampleDataService;

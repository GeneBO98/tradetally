const Trade = require('../models/Trade');
const Diary = require('../models/Diary');
const Account = require('../models/Account');
const db = require('../config/database');

/**
 * Creates sample data for new users on billing-enabled instances.
 *
 * Trades are engineered so that pro-only behavioural analytics show
 * compelling, deterministic findings the moment a verified user lands on
 * the Behavioral Analytics page during their trial:
 *   - a same-symbol revenge trade (TSLA loss, then a larger TSLA loss 22 min later)
 *   - premature winning exits with high MFE (loss aversion + missed profit)
 *   - extended losing holds (loss aversion)
 *   - a four-trade winning streak with growing position size, broken by an
 *     oversized loser (overconfidence)
 *
 * Sample rows are tagged with 'sample' and broker 'Sample' for cleanup.
 */
class SampleDataService {
  static getTradingDays(count) {
    const days = [];
    const now = new Date();
    let d = new Date(now);
    d.setDate(d.getDate() - 1);

    while (days.length < count) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(d));
      }
      d.setDate(d.getDate() - 1);
    }

    return days.reverse();
  }

  static fmt(date) {
    return date.toISOString().split('T')[0];
  }

  static buildTradeFixtures(tradingDays) {
    const day = (i) => this.fmt(tradingDays[i]);
    const at = (i, hhmm) => `${day(i)}T${hhmm}:00`;

    return [
      // --- Baseline normal trades (Days 0-3) ---
      {
        key: 'baseline_spy_w', symbol: 'SPY', side: 'long',
        entryPrice: 572.40, exitPrice: 575.70, quantity: 100,
        entryTime: at(0, '10:05'), exitTime: at(0, '11:35'),
        commission: 1.00, strategy: 'day_trading',
        stopLoss: 570.50, takeProfit: 576.00,
      },
      {
        key: 'baseline_nvda_w', symbol: 'NVDA', side: 'long',
        entryPrice: 118.50, exitPrice: 121.30, quantity: 50,
        entryTime: at(1, '10:15'), exitTime: at(1, '11:30'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 117.00, takeProfit: 122.00,
      },
      {
        key: 'baseline_amd_l', symbol: 'AMD', side: 'long',
        entryPrice: 117.25, exitPrice: 115.75, quantity: 60,
        entryTime: at(2, '09:55'), exitTime: at(2, '10:45'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 115.50, takeProfit: 119.50,
      },
      {
        key: 'baseline_googl_w', symbol: 'GOOGL', side: 'long',
        entryPrice: 163.40, exitPrice: 167.50, quantity: 60,
        entryTime: at(3, '11:00'), exitTime: at(3, '12:50'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 162.00, takeProfit: 168.00,
      },

      // --- Revenge trade scenario (Day 4) ---
      // Trigger loss: TSLA long, -$600
      {
        key: 'revenge_trigger', symbol: 'TSLA', side: 'long',
        entryPrice: 250.00, exitPrice: 244.00, quantity: 100,
        entryTime: at(4, '10:00'), exitTime: at(4, '11:30'),
        commission: 1.00, strategy: 'day_trading',
        stopLoss: 247.00, takeProfit: 256.00,
      },
      // Revenge: 22 min later, same symbol, 30% larger position, also a loss
      {
        key: 'revenge_followup', symbol: 'TSLA', side: 'long',
        entryPrice: 245.00, exitPrice: 242.00, quantity: 130,
        entryTime: at(4, '11:52'), exitTime: at(4, '12:45'),
        commission: 1.00, strategy: 'day_trading',
        stopLoss: 243.00, takeProfit: 250.00,
      },

      // --- Day 5: filler winner ---
      {
        key: 'filler_meta_w', symbol: 'META', side: 'long',
        entryPrice: 585.00, exitPrice: 591.50, quantity: 30,
        entryTime: at(5, '10:30'), exitTime: at(5, '12:05'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 582.00, takeProfit: 594.00,
      },

      // --- Premature winning exits (Days 6-7) ---
      // Day 6: NVDA winner exited at 12 min for +$150, MFE was $400 (only captured 28% of move)
      {
        key: 'premature_nvda', symbol: 'NVDA', side: 'long',
        entryPrice: 120.00, exitPrice: 123.00, quantity: 50,
        entryTime: at(6, '10:08'), exitTime: at(6, '10:20'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 118.50, takeProfit: 128.00,
        mae: -75, mfe: 400,
      },
      // Day 7: GOOGL winner exited at 8 min for +$120, MFE $480
      {
        key: 'premature_googl', symbol: 'GOOGL', side: 'long',
        entryPrice: 164.00, exitPrice: 166.00, quantity: 60,
        entryTime: at(7, '09:38'), exitTime: at(7, '09:46'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 162.50, takeProfit: 172.00,
        mae: -60, mfe: 480,
      },

      // --- Extended loss holds (Days 8-9) ---
      // Day 8: META held 180 min for -$300
      {
        key: 'extended_meta_l', symbol: 'META', side: 'long',
        entryPrice: 590.00, exitPrice: 580.00, quantity: 30,
        entryTime: at(8, '10:00'), exitTime: at(8, '13:00'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 583.00, takeProfit: 600.00,
        mae: -360, mfe: 90,
      },
      // Day 9: TSLA short held 160 min for -$280
      {
        key: 'extended_tsla_l', symbol: 'TSLA', side: 'short',
        entryPrice: 254.00, exitPrice: 261.00, quantity: 40,
        entryTime: at(9, '10:15'), exitTime: at(9, '12:55'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 263.00, takeProfit: 248.00,
        mae: -360, mfe: 80,
      },

      // --- Overconfidence streak (Days 10-13): 4 wins, growing position ---
      // Trade 1 (baseline ~$8,050)
      {
        key: 'streak_1', symbol: 'AMD', side: 'long',
        entryPrice: 115.00, exitPrice: 118.00, quantity: 70,
        entryTime: at(10, '09:50'), exitTime: at(10, '10:50'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 113.50, takeProfit: 119.00,
      },
      // Trade 2 (~$9,225, +15%)
      {
        key: 'streak_2', symbol: 'NVDA', side: 'long',
        entryPrice: 123.00, exitPrice: 125.50, quantity: 75,
        entryTime: at(11, '10:00'), exitTime: at(11, '10:45'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 121.50, takeProfit: 126.50,
      },
      // Trade 3 (~$11,020, +37%)
      {
        key: 'streak_3', symbol: 'AMD', side: 'long',
        entryPrice: 116.00, exitPrice: 119.00, quantity: 95,
        entryTime: at(12, '10:30'), exitTime: at(12, '11:40'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 114.50, takeProfit: 120.00,
      },
      // Trade 4 (~$12,400, +54% — peak streak position)
      {
        key: 'streak_4', symbol: 'NVDA', side: 'long',
        entryPrice: 124.00, exitPrice: 127.20, quantity: 100,
        entryTime: at(13, '10:00'), exitTime: at(13, '10:50'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 122.50, takeProfit: 128.00,
      },

      // --- Day 14: Overconfidence outcome — oversized loser breaks streak ---
      {
        key: 'overconfidence_outcome', symbol: 'AMD', side: 'long',
        entryPrice: 118.00, exitPrice: 112.00, quantity: 130,
        entryTime: at(14, '09:50'), exitTime: at(14, '11:35'),
        commission: 0.50, strategy: 'day_trading',
        stopLoss: 116.00, takeProfit: 122.00,
      },
    ];
  }

  static buildOpenTrade(tradingDays) {
    const yesterday = tradingDays[tradingDays.length - 1];
    return {
      symbol: 'AAPL', side: 'long',
      entryPrice: 217.50, exitPrice: null, exitTime: null, quantity: 50,
      tradeDate: this.fmt(yesterday),
      entryTime: `${this.fmt(yesterday)}T10:00:00`,
      commission: 0.50, strategy: 'swing_trading',
      stopLoss: 213.00, takeProfit: 225.00,
    };
  }

  /**
   * Create all sample data for a new user.
   */
  static async createForUser(userId) {
    console.log(`[SAMPLE-DATA] Creating sample data for user ${userId}`);

    const tradingDays = this.getTradingDays(15);
    const todayStr = this.fmt(new Date());

    const fixtures = this.buildTradeFixtures(tradingDays);
    const tradeMap = {};

    // We intentionally do NOT add the 'sample' tag here — analytics views
    // exclude tagged trades via SAMPLE_DATA_EXCLUSION_WHERE, which would hide
    // them from the calendar, dashboard, and analytics during the trial. The
    // broker='Sample' marker is enough to identify them for cleanup.
    for (const fixture of fixtures) {
      const { key, ...trade } = fixture;
      try {
        const created = await Trade.create(userId, {
          ...trade,
          tradeDate: trade.entryTime.split('T')[0],
          broker: 'Sample',
          account_identifier: 'SAMPLE',
        }, { skipApiCalls: true });
        tradeMap[key] = created;
      } catch (err) {
        console.log(`[SAMPLE-DATA] Failed to create trade ${trade.symbol} (${key}): ${err.message}`);
      }
    }

    try {
      const open = this.buildOpenTrade(tradingDays);
      await Trade.create(userId, {
        ...open,
        broker: 'Sample',
        account_identifier: 'SAMPLE',
      }, { skipApiCalls: true });
    } catch (err) {
      console.log(`[SAMPLE-DATA] Failed to create open trade: ${err.message}`);
    }

    console.log(`[SAMPLE-DATA] Created ${Object.keys(tradeMap).length}/${fixtures.length} sample trades`);

    // Run the real behavioural analyzers in-process. They each persist
    // findings to their event tables (loss_aversion_events, trade_hold_patterns,
    // overconfidence_events, revenge_trading_events, behavioral_patterns,
    // behavioral_alerts) — exactly what the Behavioural Analytics page reads
    // on first load. This way the user lands on populated cards without
    // having to click "Analyze". Tier access is required, so the caller
    // (auth.controller.register) must grant the trial before calling us.
    await this._seedBehavioralSettings(userId);
    await this._runHistoricalAnalyzers(userId);

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

    console.log(`[SAMPLE-DATA] Sample data creation complete for user ${userId}`);
  }

  /**
   * Ensure the user has the default behavioural & overconfidence settings
   * rows so the Behavioural Analytics overview can render.
   */
  static async _seedBehavioralSettings(userId) {
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
   * Run each behavioural analyzer once over the freshly-created sample
   * trades. Each is wrapped so a single failure doesn't block the others.
   */
  static async _runHistoricalAnalyzers(userId) {
    try {
      const LossAversionAnalyticsService = require('./lossAversionAnalyticsService');
      const result = await LossAversionAnalyticsService.analyzeLossAversion(userId);
      if (result?.error) {
        console.log(`[SAMPLE-DATA] Loss aversion analyzer skipped: ${result.error} - ${result.message}`);
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
   * Remove all sample data for a user.
   */
  static async removeForUser(userId) {
    const AnalyticsCache = require('./analyticsCache');

    console.log(`[SAMPLE-DATA] Removing sample data for user ${userId}`);

    // Capture sample trade IDs first so we can clean up referencing analytics
    // rows. Sample trades are identified by broker='Sample' so they remain
    // visible in calendar/analytics during the trial (the 'sample' tag would
    // exclude them from those views).
    const sampleTradesResult = await db.query(
      `SELECT id FROM trades WHERE user_id = $1 AND broker = 'Sample'`,
      [userId]
    );
    const sampleTradeIds = sampleTradesResult.rows.map((row) => row.id);

    if (sampleTradeIds.length > 0) {
      await db.query(
        `DELETE FROM trade_hold_patterns WHERE user_id = $1 AND trade_id = ANY($2::uuid[])`,
        [userId, sampleTradeIds]
      );
      await db.query(
        `DELETE FROM behavioral_alerts WHERE user_id = $1
           AND pattern_id IN (
             SELECT id FROM behavioral_patterns
             WHERE user_id = $1 AND trigger_trade_id = ANY($2::uuid[])
           )`,
        [userId, sampleTradeIds]
      );
      await db.query(
        `DELETE FROM behavioral_patterns
           WHERE user_id = $1 AND trigger_trade_id = ANY($2::uuid[])`,
        [userId, sampleTradeIds]
      );
      await db.query(
        `DELETE FROM revenge_trading_events
           WHERE user_id = $1
             AND (trigger_trade_id = ANY($2::uuid[]) OR revenge_trades && $2::uuid[])`,
        [userId, sampleTradeIds]
      );
      await db.query(
        `DELETE FROM overconfidence_events
           WHERE user_id = $1
             AND (outcome_trade_id = ANY($2::uuid[]) OR streak_trades && $2::uuid[])`,
        [userId, sampleTradeIds]
      );
      await db.query(
        `DELETE FROM win_loss_streaks
           WHERE user_id = $1 AND trade_ids && $2::uuid[]`,
        [userId, sampleTradeIds]
      );
    }

    // loss_aversion_events are aggregate (no FK to trades) so we can't
    // target sample rows precisely. If the user has no other trades, all
    // existing rows must have come from sample analysis — safe to wipe.
    // Otherwise leave them alone; the next analyze run will append new ones.
    const remaining = await db.query(
      `SELECT COUNT(*) AS count FROM trades WHERE user_id = $1`,
      [userId]
    );
    if (parseInt(remaining.rows[0].count, 10) === sampleTradeIds.length) {
      await db.query(`DELETE FROM loss_aversion_events WHERE user_id = $1`, [userId]);
    }

    const tradeResult = await db.query(
      `DELETE FROM trades WHERE user_id = $1 AND broker = 'Sample' RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${tradeResult.rowCount} sample trades`);

    const diaryResult = await db.query(
      `DELETE FROM diary_entries WHERE user_id = $1 AND 'sample' = ANY(tags) RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${diaryResult.rowCount} sample journal entries`);

    const accountResult = await db.query(
      `DELETE FROM user_accounts WHERE user_id = $1 AND account_identifier = 'SAMPLE' RETURNING id`,
      [userId]
    );
    console.log(`[SAMPLE-DATA] Deleted ${accountResult.rowCount} sample accounts`);

    // Wipe achievements + gamification stats so the user starts fresh once
    // they've removed the sample data. Achievements earned from sample
    // trading shouldn't carry forward into their real journal.
    let achievementsDeleted = 0;
    try {
      const achievementResult = await db.query(
        `DELETE FROM user_achievements WHERE user_id = $1 RETURNING id`,
        [userId]
      );
      achievementsDeleted = achievementResult.rowCount;
      await db.query(
        `UPDATE user_gamification_stats
           SET total_points = 0,
               achievement_count = 0,
               experience_points = 0,
               level = 1,
               current_streak_days = 0,
               last_achievement_date = NULL,
               updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );
      console.log(`[SAMPLE-DATA] Deleted ${achievementsDeleted} achievements and reset gamification stats`);
    } catch (err) {
      console.log(`[SAMPLE-DATA] Achievement cleanup warning: ${err.message}`);
    }

    try {
      await AnalyticsCache.invalidate(userId);
    } catch (err) {
      console.log(`[SAMPLE-DATA] Cache invalidation warning: ${err.message}`);
    }

    return {
      trades_deleted: tradeResult.rowCount,
      diary_entries_deleted: diaryResult.rowCount,
      accounts_deleted: accountResult.rowCount,
      achievements_deleted: achievementsDeleted,
    };
  }

  static async hasSampleData(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM trades WHERE user_id = $1 AND broker = 'Sample'`,
      [userId]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}

module.exports = SampleDataService;

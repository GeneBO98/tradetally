const cron = require('node-cron');
const db = require('../config/database');
const Trade = require('../models/Trade');
const Account = require('../models/Account');

const DEMO_EMAIL = process.env.DEMO_TRADE_AUTOMATION_EMAIL || 'demo@example.com';
const DEMO_ACCOUNT_IDENTIFIER = process.env.DEMO_TRADE_AUTOMATION_ACCOUNT_IDENTIFIER || 'DEMO-ACTIVE';
const DEMO_ACCOUNT_NAME = process.env.DEMO_TRADE_AUTOMATION_ACCOUNT_NAME || 'Demo Active Trading';
const DEMO_BROKER = 'Demo';
const AUTOMATION_TAG = 'demo-activity';

const TRADE_TEMPLATES = [
  { symbol: 'AAPL', basePrice: 188, strategy: 'breakout', setup: 'Opening range continuation' },
  { symbol: 'AMD', basePrice: 164, strategy: 'pullback', setup: 'VWAP reclaim' },
  { symbol: 'AMZN', basePrice: 184, strategy: 'momentum', setup: 'Trend day continuation' },
  { symbol: 'GOOGL', basePrice: 176, strategy: 'breakout', setup: 'Prior high break' },
  { symbol: 'META', basePrice: 514, strategy: 'pullback', setup: 'Higher low pullback' },
  { symbol: 'MSFT', basePrice: 418, strategy: 'reversal', setup: 'Failed breakdown reversal' },
  { symbol: 'NVDA', basePrice: 124, strategy: 'momentum', setup: 'Relative strength continuation' },
  { symbol: 'QQQ', basePrice: 456, strategy: 'trend_following', setup: 'Index trend continuation' },
  { symbol: 'SPY', basePrice: 526, strategy: 'scalp', setup: 'Market structure scalp' },
  { symbol: 'TSLA', basePrice: 178, strategy: 'reversal', setup: 'Liquidity sweep reversal' }
];

function hashDate(dateString) {
  let hash = 0;
  for (const char of dateString) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((nth - 1) * 7));
  return date;
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCDay() === 0) date.setUTCDate(day + 1);
  if (date.getUTCDay() === 6) date.setUTCDate(day - 1);
  return date;
}

function calculateEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function getMarketHolidaySet(year) {
  const goodFriday = calculateEasterDate(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);

  return new Set([
    isoDate(observedFixedHoliday(year, 0, 1)),
    isoDate(nthWeekdayOfMonth(year, 0, 1, 3)),
    isoDate(nthWeekdayOfMonth(year, 1, 1, 3)),
    isoDate(goodFriday),
    isoDate(lastWeekdayOfMonth(year, 4, 1)),
    isoDate(observedFixedHoliday(year, 5, 19)),
    isoDate(observedFixedHoliday(year, 6, 4)),
    isoDate(nthWeekdayOfMonth(year, 8, 1, 1)),
    isoDate(nthWeekdayOfMonth(year, 10, 4, 4)),
    isoDate(observedFixedHoliday(year, 11, 25))
  ]);
}

function isActiveTradingDay(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;

  const year = date.getUTCFullYear();
  return !getMarketHolidaySet(year).has(isoDate(date));
}

function addUtcMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildDemoTradesForDate(tradeDate) {
  const random = seededRandom(hashDate(tradeDate));
  const tradeCount = 3 + Math.floor(random() * 3);
  const startOffset = Math.floor(random() * TRADE_TEMPLATES.length);
  const trades = [];

  for (let index = 0; index < tradeCount; index += 1) {
    const template = TRADE_TEMPLATES[(startOffset + index * 2) % TRADE_TEMPLATES.length];
    const side = random() > 0.32 ? 'long' : 'short';
    const quantity = [25, 50, 75, 100, 125][Math.floor(random() * 5)];
    const drift = 1 + ((random() - 0.5) * 0.05);
    const entryPrice = roundMoney(template.basePrice * drift);
    const isWinner = random() > 0.42;
    const movePercent = (isWinner ? 0.004 + (random() * 0.018) : 0.003 + (random() * 0.012));
    const direction = side === 'long' ? 1 : -1;
    const exitMultiplier = 1 + (direction * movePercent * (isWinner ? 1 : -1));
    const exitPrice = roundMoney(entryPrice * exitMultiplier);
    const commission = 0;
    const fees = roundMoney(quantity * 0.003);
    const pnl = Trade.calculatePnL(entryPrice, exitPrice, quantity, side, commission, fees);
    const marketOpenUtc = new Date(`${tradeDate}T13:30:00.000Z`);
    const entryTime = addUtcMinutes(marketOpenUtc, 20 + index * 47 + Math.floor(random() * 21));
    const holdMinutes = 18 + Math.floor(random() * 115);
    const exitTime = addUtcMinutes(entryTime, holdMinutes);
    const stopLoss = roundMoney(side === 'long' ? entryPrice * 0.992 : entryPrice * 1.008);
    const takeProfit = roundMoney(side === 'long' ? entryPrice * 1.016 : entryPrice * 0.984);

    trades.push({
      symbol: template.symbol,
      tradeDate,
      entryTime: entryTime.toISOString(),
      exitTime: exitTime.toISOString(),
      entryPrice,
      exitPrice,
      quantity,
      side,
      commission,
      fees,
      pnl,
      strategy: template.strategy,
      setup: template.setup,
      notes: `Demo automation: plausible ${template.symbol} ${side} ${isWinner ? 'winner' : 'loss'} for ${tradeDate}.`,
      tags: [AUTOMATION_TAG],
      broker: DEMO_BROKER,
      accountIdentifier: DEMO_ACCOUNT_IDENTIFIER,
      instrumentType: 'stock',
      stopLoss,
      takeProfit,
      confidence: 5,
      isPublic: false
    });
  }

  return trades;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

class DemoTradeActivityScheduler {
  constructor() {
    this.job = null;
    this.running = false;
  }

  start() {
    if (this.job) return;

    this.job = cron.schedule(process.env.DEMO_TRADE_AUTOMATION_CRON || '15 22 * * 1-5', () => {
      this.runForDate().catch((error) => {
        console.error('[DEMO TRADES] Scheduled run failed:', error.message);
      });
    });

    console.log('[DEMO TRADES] Scheduler started');

    if (process.env.DEMO_TRADE_AUTOMATION_RUN_ON_START !== 'false') {
      this.runForDate().catch((error) => {
        console.error('[DEMO TRADES] Startup run failed:', error.message);
      });
    }
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[DEMO TRADES] Scheduler stopped');
    }
  }

  async runForDate(date = new Date()) {
    if (this.running) return { skipped: true, reason: 'already_running' };
    this.running = true;

    try {
      if (!isActiveTradingDay(date)) {
        return { skipped: true, reason: 'market_closed' };
      }

      const tradeDate = isoDate(date);
      const now = new Date();
      const isToday = tradeDate === isoDate(now);
      const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (isToday && utcMinutes < 22 * 60) {
        return { skipped: true, reason: 'market_session_not_finished', tradeDate };
      }
      const user = await this.findDemoUser();
      if (!user) {
        console.warn(`[DEMO TRADES] Demo user ${DEMO_EMAIL} not found; skipping`);
        return { skipped: true, reason: 'missing_demo_user' };
      }

      await this.ensureDemoAccount(user.id, tradeDate);

      const alreadyCreated = await this.hasAutomationTradesForDate(user.id, tradeDate);
      if (alreadyCreated) {
        return { skipped: true, reason: 'already_seeded', tradeDate };
      }

      const tradeData = buildDemoTradesForDate(tradeDate);
      const created = [];
      for (const trade of tradeData) {
        created.push(await Trade.create(user.id, trade, {
          skipApiCalls: true,
          skipAchievements: true
        }));
      }

      console.log(`[DEMO TRADES] Created ${created.length} trades for ${DEMO_EMAIL} on ${tradeDate}`);
      return { skipped: false, tradeDate, created: created.length };
    } finally {
      this.running = false;
    }
  }

  async findDemoUser() {
    const result = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND COALESCE(is_active, true) = true',
      [DEMO_EMAIL]
    );
    return result.rows[0] || null;
  }

  async ensureDemoAccount(userId, tradeDate) {
    const existing = await db.query(
      'SELECT id FROM user_accounts WHERE user_id = $1 AND account_identifier = $2',
      [userId, DEMO_ACCOUNT_IDENTIFIER]
    );
    if (existing.rows.length > 0) return existing.rows[0];

    return Account.create(userId, {
      accountName: DEMO_ACCOUNT_NAME,
      accountIdentifier: DEMO_ACCOUNT_IDENTIFIER,
      broker: DEMO_BROKER,
      initialBalance: 50000,
      initialBalanceDate: tradeDate,
      isPrimary: false,
      notes: 'Used by the demo trade activity automation.'
    });
  }

  async hasAutomationTradesForDate(userId, tradeDate) {
    const result = await db.query(
      `SELECT 1
       FROM trades
       WHERE user_id = $1
         AND trade_date = $2::date
         AND account_identifier = $3
         AND $4 = ANY(tags)
       LIMIT 1`,
      [userId, tradeDate, DEMO_ACCOUNT_IDENTIFIER, AUTOMATION_TAG]
    );
    return result.rows.length > 0;
  }
}

module.exports = new DemoTradeActivityScheduler();
module.exports.buildDemoTradesForDate = buildDemoTradesForDate;
module.exports.isActiveTradingDay = isActiveTradingDay;
module.exports.getMarketHolidaySet = getMarketHolidaySet;

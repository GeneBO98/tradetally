# TradeTally Tier Structure

## Overview

TradeTally uses a simple two-tier system: **Free** and **Pro ($8/month)**

---

## 🟢 Free Tier
**Tagline:** "Get started journaling easily"

### Features Included:
- ✅ Basic dashboard
- ✅ **Unlimited** trade journaling + core metrics (P/L, win rate, profit factor, etc.)
- ✅ **Unlimited** journal entries
- ✅ Calendar view (P/L per day)
- ✅ Leaderboard (view-only, top 10 rankings)
- ✅ Basic charts (equity curve, volume, performance by day)
- ✅ Trade import from brokers
- ✅ Trade tags (strategies, setups)

### Limits:
- **Trades:** Unlimited total trades
- **Batch Import:** Up to 100 trades per import (to prevent abuse)
- **Journal Entries:** Unlimited
- **Watchlists:** 0 (Pro only)
- **Price Alerts:** 0 (Pro only)
- **Leaderboard:** View-only (cannot participate)
- **API Access:** No

---

## 🔵 Pro Tier
**Price:** $8/month
**Tagline:** "Unlock your trading edge"
**Message:** *"Upgrade to Pro to understand why you win or lose — not just how often."*

### Features Included:

#### Unlimited Batch Imports
- ✅ **Unlimited batch imports** (no 100-trade import limit)
- ✅ Import large CSV files without restrictions

#### News & Market Data
- ✅ **Financial news feed** (for open positions)
- ✅ **Upcoming earnings calendar** (for tracked symbols)

#### Advanced Analytics
- ✅ **SQN** (System Quality Number)
- ✅ **Kelly Criterion** (optimal position sizing)
- ✅ **MAE/MFE** (Maximum Adverse/Favorable Excursion)
- ✅ **K-Ratio** (risk-adjusted performance)
- ✅ **Sector breakdowns**
- ✅ **Time-of-day analysis**
- ✅ **Day of week patterns**
- ✅ **Per-symbol analytics**
- ✅ **Per-strategy analytics**

#### Behavioral Analytics Suite
- ✅ **Revenge trading detection**
- ✅ **Overconfidence analytics** (win streak position sizing analysis)
- ✅ **Loss aversion** (holding losers too long)
- ✅ **Trading personality typing**
- ✅ **Behavioral alerts** (real-time)

#### Health Analytics
- ✅ **Heart rate tracking** (correlation with trading)
- ✅ **Sleep tracking** (quality vs performance)
- ✅ **Stress tracking** (stress level correlation)

#### Watchlists & Alerts
- ✅ **Up to 20 watchlists** (100 symbols each)
- ✅ **Up to 100 price alerts**
- ✅ **Email alerts**
- ✅ **iOS push notifications**
- ✅ **Real-time price monitoring**

#### Leaderboard
- ✅ **Advanced filters** (compare by strategy, timeframe)
- ✅ **Participate in rankings**
- ✅ **View all rankings** (unlimited)

#### API & Integrations
- ✅ **API access** (10,000 calls/day)
- ✅ **Webhooks**

#### AI Features
- ✅ **AI Insights** (powered by configurable AI providers)
- ✅ **AI trade analysis**

#### Other Pro Features
- ✅ **Advanced filtering**
- ✅ **Custom metrics**
- ✅ **Export reports**
- ✅ **Automatic trade blocking** (based on behavioral triggers)

---

## Implementation Details

### Database
- `features` table with 47 defined features
- `users.tier` column ('free' or 'pro')
- `subscriptions` table for Stripe integration
- `tier_overrides` table for admin manual tier assignments

### Backend

#### Configuration Files:
- `/backend/src/config/tierLimits.js` - Defines all tier limits and quotas
- `/backend/src/services/tierService.js` - Tier logic and feature access
- `/backend/src/middleware/tierAuth.js` - Middleware for protecting routes

#### Key Methods:
```javascript
// Check feature access
await TierService.hasFeatureAccess(userId, 'behavioral_analytics');

// Get user tier
const tier = await TierService.getUserTier(userId);

// Check trade limits
const canAdd = await TierService.canAddTrades(userId, 10);
// Returns: { allowed: true, remaining: 90, current: 10, max: 100, tier: 'free' }

// Get usage stats
const usage = await TierService.getUserUsageStats(userId);

// Get pricing info
const pricing = TierService.getPricing();

// Get tier comparison
const comparison = TierService.getTierComparison();
```

### Protected Routes

Routes protected by tier (require Pro):
- `/api/behavioral-analytics/*` - All behavioral analytics
- `/api/watchlist/*` - All watchlist features
- `/api/price-alerts/*` - All price alerts
- `/api/health/*` - All health analytics
- `/api/notifications/stream` - SSE notifications

### Billing

- **Self-hosted:** Billing automatically disabled (all users get Pro features)
- **SaaS (tradetally.io):** Billing enabled, Stripe integration
- Admin users always get Pro tier
- Tier overrides allow manual Pro access with optional expiration

---

## Feature Keys Reference

### Free Tier Features:
- `dashboard`
- `news_feed`
- `earnings_calendar`
- `basic_journaling`
- `trade_import`
- `trade_tagging`
- `core_metrics`
- `basic_charts`
- `calendar_view`
- `leaderboard_view`

### Pro Tier Features:
- `unlimited_trades`
- `unlimited_journals`
- `advanced_analytics`
- `sqn_analysis`
- `kelly_criterion`
- `mae_mfe`
- `k_ratio`
- `sector_breakdown`
- `time_analysis`
- `day_of_week`
- `symbol_analytics`
- `strategy_analytics`
- `behavioral_analytics`
- `revenge_trading_detection`
- `overconfidence_analytics`
- `loss_aversion`
- `personality_typing`
- `behavioral_alerts`
- `health_analytics`
- `heart_rate_tracking`
- `sleep_tracking`
- `stress_tracking`
- `watchlists`
- `price_alerts`
- `email_alerts`
- `push_notifications`
- `realtime_monitoring`
- `leaderboard_filters`
- `leaderboard_compete`
- `api_access`
- `webhooks`
- `ai_insights`
- `ai_trade_analysis`
- `advanced_filtering`
- `custom_metrics`
- `export_reports`
- `trade_blocking`

---

## Upgrade Messaging

### For Locked Features:
On hover or click of locked features, show:
> "Unlock Kelly ratio, SQN, and advanced metrics with Pro — only $8/month."

### Main Positioning:
> "Upgrade to Pro to understand **why** you win or lose — not just **how often**."

---

## Migration

Database migration `101_update_feature_tiers.sql` has been applied to set up the new tier structure.

All features are now properly configured with appropriate tier requirements.

/**
 * Tier limits configuration
 * Defines usage limits for Free and Pro tiers
 *
 * FREE TIER PHILOSOPHY:
 * - Unlimited total trades (no storage limit)
 * - Unlimited journal entries (journaling is always free)
 * - Limited batch imports (100 at once) to prevent abuse
 *
 * The free tier removes barriers to entry while preventing resource abuse.
 * Users can journal as much as they want, but large imports require Pro.
 */

const TIER_LIMITS = {
  free: {
    // Trade Limits
    maxTrades: null, // Unlimited total trades (no storage limit)
    maxTradesPerImport: 100, // Limit per batch import to prevent abuse
    maxTradesPerMonth: null, // No monthly limit

    // Journal Limits
    maxJournalEntries: null, // Unlimited journal entries (journaling is free for everyone)

    // Leaderboard
    leaderboardRankingsVisible: 10, // Can only see top 10 rankings
    leaderboardParticipation: false, // Cannot participate in leaderboard

    // Watchlists
    maxWatchlists: 0, // No watchlists for free tier
    maxSymbolsPerWatchlist: 0,

    // Alerts
    maxPriceAlerts: 0, // No price alerts for free tier
    emailAlerts: false,
    pushNotifications: false,

    // Analytics
    advancedAnalytics: false,
    behavioralAnalytics: false,
    healthAnalytics: false,

    // AI
    aiCreditsPerMonth: 0, // No AI credits for free tier
    aiMaxFollowups: 0, // No follow-up questions

    // API
    apiAccess: false,
    apiCallsPerDay: 0,

    // Features
    features: {
      dashboard: true,
      newsFeed: true,
      earningsCalendar: true,
      basicJournaling: true,
      tradeImport: true,
      tradeTagging: true,
      coreMetrics: true,
      basicCharts: true,
      calendarView: true,
      leaderboardView: true
    }
  },

  pro: {
    // Trade Limits
    maxTrades: null, // Unlimited
    maxTradesPerImport: null, // Unlimited per batch import
    maxTradesPerMonth: null, // Unlimited

    // Journal Limits
    maxJournalEntries: null, // Unlimited

    // Leaderboard
    leaderboardRankingsVisible: null, // Can see all rankings
    leaderboardParticipation: true, // Can participate

    // Watchlists
    maxWatchlists: 20,
    maxSymbolsPerWatchlist: 100,

    // Alerts
    maxPriceAlerts: 100,
    emailAlerts: true,
    pushNotifications: true,

    // Analytics
    advancedAnalytics: true,
    behavioralAnalytics: true,
    healthAnalytics: true,

    // AI
    aiCreditsPerMonth: 100, // 100 credits per month for AI conversations
    aiMaxFollowups: 5, // Up to 5 follow-up questions per session

    // API
    apiAccess: true,
    apiCallsPerDay: 10000,

    // Features (All features unlocked)
    features: {
      // Everything from free tier, plus:
      unlimitedTrades: true,
      unlimitedJournals: true,
      advancedAnalytics: true,
      sqnAnalysis: true,
      kellyCriterion: true,
      maeMfe: true,
      kRatio: true,
      sectorBreakdown: true,
      timeAnalysis: true,
      dayOfWeek: true,
      symbolAnalytics: true,
      strategyAnalytics: true,
      behavioralAnalytics: true,
      revengeTrading: true,
      overconfidence: true,
      lossAversion: true,
      personalityTyping: true,
      behavioralAlerts: true,
      healthAnalytics: true,
      heartRate: true,
      sleepTracking: true,
      stressTracking: true,
      watchlists: true,
      priceAlerts: true,
      emailAlerts: true,
      pushNotifications: true,
      realtimeMonitoring: true,
      leaderboardFilters: true,
      leaderboardCompete: true,
      apiAccess: true,
      webhooks: true,
      aiInsights: true,
      aiTradeAnalysis: true,
      aiConversations: true, // Multi-turn AI conversations with follow-ups
      advancedFiltering: true,
      customMetrics: true,
      exportReports: true,
      tradeBlocking: true
    }
  }
};

/**
 * Get tier limits for a specific tier
 * @param {string} tier - 'free' or 'pro'
 * @returns {object} Tier limits
 */
function getTierLimits(tier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}

/**
 * Check if user has reached a specific limit
 * @param {string} tier - User's tier
 * @param {string} limitKey - The limit to check (e.g., 'maxTrades')
 * @param {number} currentUsage - Current usage count
 * @returns {boolean} True if limit reached
 */
function hasReachedLimit(tier, limitKey, currentUsage) {
  const limits = getTierLimits(tier);
  const limit = limits[limitKey];

  // If limit is null or undefined, it's unlimited
  if (limit === null || limit === undefined) {
    return false;
  }

  return currentUsage >= limit;
}

/**
 * Get remaining quota for a limit
 * @param {string} tier - User's tier
 * @param {string} limitKey - The limit to check
 * @param {number} currentUsage - Current usage count
 * @returns {number|null} Remaining quota, or null if unlimited
 */
function getRemainingQuota(tier, limitKey, currentUsage) {
  const limits = getTierLimits(tier);
  const limit = limits[limitKey];

  // If limit is null or undefined, it's unlimited
  if (limit === null || limit === undefined) {
    return null;
  }

  const remaining = limit - currentUsage;
  return Math.max(0, remaining);
}

/**
 * Pricing information
 */
const PRICING = {
  pro: {
    monthly: {
      price: 8.00,
      currency: 'USD',
      interval: 'month',
      description: 'Pro - Monthly'
    },
    yearly: {
      price: 80.00, // $6.67/month billed annually
      currency: 'USD',
      interval: 'year',
      description: 'Pro - Yearly (Save 17%)'
    }
  }
};

module.exports = {
  TIER_LIMITS,
  PRICING,
  getTierLimits,
  hasReachedLimit,
  getRemainingQuota
};

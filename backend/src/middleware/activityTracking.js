const activityTrackingService = require('../services/activityTrackingService');
const { getClientIp } = require('../utils/clientIp');

// Map routes to meaningful event types
const ROUTE_EVENT_MAP = {
  // Auth
  'POST /api/auth/login': { type: 'auth.login', category: 'auth' },
  'POST /api/auth/register': { type: 'auth.register', category: 'auth' },
  'POST /api/auth/logout': { type: 'auth.logout', category: 'auth' },
  'POST /api/auth/forgot-password': { type: 'auth.password_reset_request', category: 'auth' },
  'POST /api/auth/reset-password': { type: 'auth.password_reset', category: 'auth' },
  'POST /api/2fa/setup': { type: 'auth.2fa_setup', category: 'auth' },
  'POST /api/auth/verify-2fa': { type: 'auth.2fa_verified', category: 'auth' },

  // Trades
  'POST /api/trades': { type: 'trade.created', category: 'trade' },
  'DELETE /api/trades': { type: 'trade.bulk_deleted', category: 'trade' },

  // Import
  'POST /api/trades/import': { type: 'import.started', category: 'import' },

  // Diary
  'POST /api/diary': { type: 'diary.created', category: 'feature' },
  'GET /api/diary': { type: 'diary.viewed', category: 'feature', feature: 'diary' },

  // Broker sync
  'POST /api/broker-sync/connections': { type: 'broker_sync.connection_created', category: 'sync' },

  // AI
  'POST /api/ai/sessions': { type: 'ai.query', category: 'feature', feature: 'ai' },

  // Billing
  'POST /api/billing/upgrade': { type: 'subscription.started', category: 'billing' },
  'POST /api/billing/cancel': { type: 'subscription.canceled', category: 'billing' },

  // Settings
  'PUT /api/settings': { type: 'settings.updated', category: 'settings' },

  // Accounts
  'POST /api/accounts': { type: 'account.created', category: 'account' },
  'DELETE /api/accounts': { type: 'account.deleted', category: 'account' },
};

// Routes tracked on GET for feature usage (only specific paths, not high-frequency)
const FEATURE_VIEW_MAP = {
  '/api/trades/analytics': { type: 'analytics.viewed', category: 'feature', feature: 'analytics' },
  '/api/behavioral-analytics': { type: 'behavioral_analytics.viewed', category: 'feature', feature: 'behavioral_analytics' },
  '/api/watchlists': { type: 'watchlist.viewed', category: 'feature', feature: 'watchlist' },
  '/api/scanner': { type: 'scanner.viewed', category: 'feature', feature: 'scanner' },
  '/api/investments': { type: 'investments.viewed', category: 'feature', feature: 'investments' },
  '/api/year-wrapped': { type: 'year_wrapped.viewed', category: 'feature', feature: 'year_wrapped' },
  '/api/gamification': { type: 'gamification.viewed', category: 'feature', feature: 'gamification' },
};

// Paths to skip entirely
const SKIP_PATHS = [
  '/api/health',
  '/api/features',
  '/api/notifications/stream',
  '/api/symbols/search',
  '/api/csp-report',
  '/.well-known',
  '/api-docs',
];

// High-frequency GET paths to skip (polling, quotes)
const SKIP_PREFIXES = [
  '/api/notifications',
  '/api/symbols',
];

function activityTrackingMiddleware(req, res, next) {
  // Skip OPTIONS
  if (req.method === 'OPTIONS') return next();

  const path = req.path;

  // Skip health/static/high-frequency endpoints
  for (const skip of SKIP_PATHS) {
    if (path === skip || path.startsWith(skip)) return next();
  }

  // For GET requests, only track specific feature views
  if (req.method === 'GET') {
    for (const prefix of SKIP_PREFIXES) {
      if (path.startsWith(prefix)) return next();
    }
  }

  const startTime = Date.now();

  // Capture response finish to log with timing
  const originalEnd = res.end;
  res.end = function (...args) {
    originalEnd.apply(res, args);

    // Only track after response is sent (non-blocking)
    setImmediate(() => {
      try {
        const responseTimeMs = Date.now() - startTime;
        const userId = req.user?.id || req.user?.userId || null;

        // Skip if no user and not an auth event
        if (!userId && !path.startsWith('/api/auth')) return;

        const routeKey = `${req.method} ${path}`;
        let eventInfo = ROUTE_EVENT_MAP[routeKey];

        // For PUT/DELETE with IDs, try matching without the ID segment
        if (!eventInfo && (req.method === 'PUT' || req.method === 'DELETE')) {
          const basePath = path.replace(/\/[0-9a-f-]{36}$/i, '');
          const baseKey = `${req.method} ${basePath}`;
          eventInfo = ROUTE_EVENT_MAP[baseKey];

          // Special case for trade update/delete
          if (!eventInfo && basePath.startsWith('/api/trades')) {
            eventInfo = {
              type: req.method === 'PUT' ? 'trade.updated' : 'trade.deleted',
              category: 'trade'
            };
          }
        }

        // For GET requests, check feature view map
        if (!eventInfo && req.method === 'GET') {
          // Try exact match first, then prefix match
          eventInfo = FEATURE_VIEW_MAP[path];
          if (!eventInfo) {
            for (const [viewPath, info] of Object.entries(FEATURE_VIEW_MAP)) {
              if (path.startsWith(viewPath)) {
                eventInfo = info;
                break;
              }
            }
          }
        }

        // For POST broker sync with ID (sync trigger)
        if (!eventInfo && req.method === 'POST' && path.match(/\/api\/broker-sync\/connections\/[^/]+\/sync/)) {
          eventInfo = { type: 'broker_sync.started', category: 'sync', feature: 'broker_sync' };
        }

        if (!eventInfo) return;

        // Only log successful responses (2xx, 3xx)
        if (res.statusCode >= 400) return;

        const metadata = {};
        if (req.params?.id) metadata.entity_id = req.params.id;
        if (req.query?.broker) metadata.broker = req.query.broker;
        if (path.includes('/import') && req.body?.broker) metadata.broker = req.body.broker;

        const reqContext = {
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'],
          sessionId: req.user?.sessionId || null,
          responseTimeMs,
          marketingConsent: req.user?.marketing_consent
        };

        activityTrackingService.trackEvent(
          userId,
          eventInfo.type,
          eventInfo.category,
          metadata,
          reqContext
        );

        // Track feature usage for engagement summary
        if (eventInfo.feature && userId) {
          activityTrackingService.trackFeatureUsage(userId, eventInfo.feature);
        }
      } catch (err) {
        // Never let tracking errors affect the response
        console.error('[ACTIVITY_TRACKING] Middleware error:', err.message);
      }
    });
  };

  next();
}

module.exports = activityTrackingMiddleware;

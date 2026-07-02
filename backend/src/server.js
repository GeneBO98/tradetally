const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local'), override: false });
const { validateEnv } = require('./config/env');

const { migrate } = require('./utils/migrate');
const { ensurePostExitSchema } = require('./utils/ensurePostExitSchema');
const { initializePostHogTelemetry, shutdown: shutdownPostHogTelemetry } = require('./posthog-telemetry');
const { securityMiddleware } = require('./middleware/security');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const tradeRoutes = require('./routes/trade.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const settingsRoutes = require('./routes/settings.routes');
const equityRoutes = require('./routes/equity.routes');
const twoFactorRoutes = require('./routes/twoFactor');
const apiKeyRoutes = require('./routes/apiKey.routes');
const apiRoutes = require('./routes/api.routes');
const v1Routes = require('./routes/v1');
const wellKnownRoutes = require('./routes/well-known.routes');
const ogRoutes = require('./routes/og.routes');
const adminRoutes = require('./routes/admin.routes');
const featuresRoutes = require('./routes/features.routes');
const behavioralAnalyticsRoutes = require('./routes/behavioralAnalytics.routes');
const billingRoutes = require('./routes/billing.routes');
const watchlistRoutes = require('./routes/watchlist.routes');
const priceAlertsRoutes = require('./routes/priceAlerts.routes');
const webMentionsRoutes = require('./routes/webMentions.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const newsEnrichmentRoutes = require('./routes/newsEnrichment.routes');
const newsCorrelationRoutes = require('./routes/newsCorrelation.routes');
const notificationPreferencesRoutes = require('./routes/notificationPreferences.routes');
const cusipMappingsRoutes = require('./routes/cusipMappings.routes');
const csvMappingRoutes = require('./routes/csvMapping.routes');
const diaryRoutes = require('./routes/diary.routes');
const diaryTemplateRoutes = require('./routes/diaryTemplate.routes');
const healthRoutes = require('./routes/health.routes');
const oauth2Routes = require('./routes/oauth2.routes');
const tagsRoutes = require('./routes/tags.routes');
const backupRoutes = require('./routes/backup.routes');
const brokerSyncRoutes = require('./routes/brokerSync.routes');
const yearWrappedRoutes = require('./routes/yearWrapped.routes');
const investmentsRoutes = require('./routes/investments.routes');
const stockScannerRoutes = require('./routes/stockScanner.routes');
const accountRoutes = require('./routes/account.routes');
const plaidWebhookRoutes = require('./routes/plaidWebhook.routes');
const instrumentTemplatesRoutes = require('./routes/instrumentTemplates.routes');
const tradeManagementRoutes = require('./routes/tradeManagement.routes');
const playbookRoutes = require('./routes/playbook.routes');
const aiRoutes = require('./routes/ai.routes');
const symbolsRoutes = require('./routes/symbols.routes');
const unsubscribeRoutes = require('./routes/unsubscribe.routes');
const trialFeedbackRoutes = require('./routes/trialFeedback.routes');
const passkeyRoutes = require('./routes/passkey.routes');
const testimonialsRoutes = require('./routes/testimonials.routes');
const supportRoutes = require('./routes/support.routes');
const internalRoutes = require('./routes/internal.routes');
const edgeReportRoutes = require('./routes/edgeReport.routes');
const replayRoutes = require('./routes/replay.routes');
const backtestRoutes = require('./routes/backtest.routes');
const propFirmRoutes = require('./routes/propFirm.routes');
const BillingService = require('./services/billingService');
const priceMonitoringService = require('./services/priceMonitoringService');
const backupScheduler = require('./services/backupScheduler.service');
const stockScannerScheduler = require('./services/stockScannerScheduler');
const watchlistPillarsScheduler = require('./services/watchlistPillarsScheduler');
const GamificationScheduler = require('./services/gamificationScheduler');
const TrialScheduler = require('./services/trialScheduler');
const RetentionEmailScheduler = require('./services/retentionEmailScheduler');
const OptionsScheduler = require('./services/optionsScheduler');
const brokerSyncScheduler = require('./services/brokerSync/brokerSyncScheduler');
const plaidFundingScheduler = require('./services/plaid/plaidFundingScheduler');
const dividendScheduler = require('./services/dividendScheduler');
const newsScheduler = require('./services/newsScheduler');
const earningsScheduler = require('./services/earningsScheduler');
const symbolCategoryScheduler = require('./services/symbolCategoryScheduler');
const portfolioSnapshotScheduler = require('./services/portfolioSnapshotScheduler');
const webMentionScheduler = require('./services/webMentionScheduler');
const webhookEventBridge = require('./services/webhookEventBridge');
const crmSyncScheduler = require('./services/crmSyncScheduler');
const edgeReportScheduler = require('./services/edgeReportScheduler');
const activityTrackingService = require('./services/activityTrackingService');
const engagementScheduler = require('./services/engagementScheduler');
const activityTrackingMiddleware = require('./middleware/activityTracking');
const emailTrackingRoutes = require('./routes/emailTracking.routes');
const backgroundWorker = require('./workers/backgroundWorker');
const jobRecoveryService = require('./services/jobRecoveryService');
const pushNotificationService = require('./services/pushNotificationService');
const globalEnrichmentCacheCleanupService = require('./services/globalEnrichmentCacheCleanupService');
const storageHealthService = require('./services/storageHealth.service');
const { buildHealthStatus } = require('./services/healthStatus.service');
const { buildSwaggerSpec, swaggerUi } = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');
const requestIdMiddleware = require('./middleware/requestId');
const { isV1Request, sendV1Error } = require('./utils/apiResponse');
const { ensureCsrfCookie, requireCsrf } = require('./middleware/csrf');
const { createRateLimiter } = require('./utils/rateLimit');
const { isBackgroundJobsDisabled } = require('./utils/runtimeScope');

const app = express();
const PORT = process.env.PORT || 5001;

function getApiDocsOrigin(req) {
  return process.env.API_BASE_URL || process.env.INSTANCE_URL || `${req.protocol}://${req.get('host')}`;
}

function parseTrustProxySetting(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
  return value;
}

// Disable X-Powered-By header to prevent server fingerprinting
app.disable('x-powered-by');

// Trust proxy headers only when explicitly configured.
const trustProxySetting = parseTrustProxySetting(process.env.TRUST_PROXY);
app.set('trust proxy', trustProxySetting);

// Rate limiting configuration - can be disabled or adjusted via environment variables
// RATE_LIMIT_ENABLED=false disables rate limiting entirely (useful for self-hosted instances)
// RATE_LIMIT_MAX sets the maximum requests per window (default: 1000)
// RATE_LIMIT_WINDOW_MS sets the window duration in milliseconds (default: 15 minutes)
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX) || 1000;
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

// Custom key generator to properly identify clients behind proxies
const { getClientIp } = require('./utils/clientIp');

const limiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  skip: () => !rateLimitEnabled
});

// Log rate limit configuration on startup
if (rateLimitEnabled) {
  logger.info(`Rate limiting enabled: ${rateLimitMax} requests per ${rateLimitWindowMs / 1000}s window`, 'rate-limit');
} else {
  logger.info('Rate limiting is disabled via RATE_LIMIT_ENABLED=false', 'rate-limit');
}
logger.info(`Express trust proxy setting: ${String(trustProxySetting)}`, 'security');

// Skip rate limiting for certain paths (legacy function kept for compatibility)
const skipRateLimit = (req, res, next) => {
  return limiter(req, res, next);
};

// Apply security middleware (CSP, anti-clickjacking, etc.)
app.use(securityMiddleware());
app.use(requestIdMiddleware);

// Optimized CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [])
];

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost'
  );
}

logger.info(`CORS configuration initialized with ${allowedOrigins.length} allowed origins`, 'cors');
logger.debug(`Allowed origins: ${allowedOrigins.join(', ')}`, 'cors');

const corsOptions = {
  origin: (origin, callback) => {
    logger.debug(`CORS check for origin: ${origin || 'null'}`, 'cors');
    
    if (!origin) {
      logger.debug('No origin header present - allowing request', 'cors');
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      logger.debug(`Origin ${origin} is allowed`, 'cors');
      callback(null, true);
    } else {
      logger.warn(`Origin ${origin} not allowed. Allowed origins: ${allowedOrigins.join(', ')}`, 'cors');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'X-Device-ID', 'X-App-Version', 'X-Platform', 'X-Request-ID', 'X-CSRF-Token'],
  exposedHeaders: ['X-API-Version', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset', 'X-Request-ID'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

morgan.token('request-id', (req) => req.requestId || '-');
app.use(morgan(':method :url :status :response-time ms req_id=:request-id', {
  skip: function (req, res) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    return req.path.includes('/import/history') ||
           req.path.includes('/health') ||
           (req.path.includes('/trades') && req.query && req.query.page);
  }
}));

// Cookie parser middleware
app.use(cookieParser());
app.use(ensureCsrfCookie);

// Body parsing middleware (skip for webhook routes that need raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhooks/stripe' || req.originalUrl.split('?')[0] === '/api/plaid/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));
app.use('/api', skipRateLimit);
app.use('/api', requireCsrf);

// Activity tracking middleware (auto-logs user actions to user_activity_events)
app.use(activityTrackingMiddleware);

// Email tracking routes (public, no auth - triggered by email clients)
app.use('/api/email-track', emailTrackingRoutes);

// V1 API routes (mobile-optimized)
app.use('/api/v1', v1Routes);

// Legacy API routes (backward compatibility)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/equity', equityRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/v2', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/behavioral-analytics', behavioralAnalyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/price-alerts', priceAlertsRoutes);
app.use('/api/web-mentions', webMentionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/news-enrichment', newsEnrichmentRoutes);
app.use('/api/news-correlation', newsCorrelationRoutes);
app.use('/api/notification-preferences', notificationPreferencesRoutes);
app.use('/api/cusip-mappings', cusipMappingsRoutes);
app.use('/api/csv-mappings', csvMappingRoutes);
app.use('/api/diary', diaryRoutes);
app.use('/api/diary-templates', diaryTemplateRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/admin/backup', backupRoutes);
app.use('/api/broker-sync', brokerSyncRoutes);
app.use('/api/year-wrapped', yearWrappedRoutes);
app.use('/api/investments', investmentsRoutes);
app.use('/api/scanner', stockScannerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/plaid/webhook', plaidWebhookRoutes);
app.use('/api/instrument-templates', instrumentTemplatesRoutes);
app.use('/api/trade-management', tradeManagementRoutes);
app.use('/api/playbooks', playbookRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/symbols', symbolsRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);
app.use('/api/trial-feedback', trialFeedbackRoutes);
app.use('/api/auth/passkey', passkeyRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/edge-reports', edgeReportRoutes);
app.use('/api/replay', replayRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/prop-firm', propFirmRoutes);

// OAuth2 Provider endpoints
app.use('/oauth', oauth2Routes);
app.use('/api/oauth', oauth2Routes);

// Well-known endpoints for mobile discovery
app.use('/.well-known', wellKnownRoutes);

// Open Graph endpoints for crawler link previews (nginx routes bot UAs here).
app.use('/og', ogRoutes);

// Swagger API Documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.get('/api-docs.json', (req, res) => {
    res.json(buildSwaggerSpec(getApiDocsOrigin(req)));
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TradeTally API Documentation',
    swaggerOptions: {
      url: '/api-docs.json',
    },
  }));
  logger.info('📚 Swagger documentation available at /api-docs');
}

// Health endpoint with database connection check and background worker status
app.get('/api/health', async (req, res) => {
  const health = await buildHealthStatus();
  res.json(health);
});

// Readiness probe for load-balancer failover. Returns 200 only when this node's
// database is a writable PRIMARY; a streaming standby returns 503 so the load
// balancer will not route to it until it has been promoted.
app.get('/api/ready', async (req, res) => {
  try {
    const db = require('./config/database');
    const { rows } = await db.query('SELECT pg_is_in_recovery() AS in_recovery');
    if (rows[0] && rows[0].in_recovery === true) {
      return res.status(503).json({ ready: false, db_role: 'standby' });
    }
    return res.status(200).json({ ready: true, db_role: 'primary' });
  } catch (err) {
    return res.status(503).json({ ready: false, error: 'db_unreachable' });
  }
});

// CSP violation reporting endpoint (OWASP CWE-693 mitigation)
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const cspReport = req.body;
  console.warn('CSP Violation Report:', JSON.stringify(cspReport, null, 2));
  
  // Log CSP violations for OWASP compliance monitoring
  // In production, you might want to store these in a database or send to a monitoring service
  if (cspReport && cspReport['csp-report']) {
    const violation = cspReport['csp-report'];
    console.warn(`CSP Violation: ${violation['violated-directive']} blocked ${violation['blocked-uri']} on ${violation['document-uri']}`);
  }
  
  res.status(204).end(); // No content response
});

// Admin endpoint to check enrichment status
const { requireAdmin } = require('./middleware/auth');
app.get('/api/admin/enrichment-status', requireAdmin, async (req, res) => {
  try {
    const db = require('./config/database');
    
    // Get job queue status
    const jobs = await db.query('SELECT type, status, COUNT(*) as count FROM job_queue GROUP BY type, status ORDER BY type, status');
    
    // Get trade enrichment status
    const trades = await db.query('SELECT enrichment_status, COUNT(*) as count FROM trades GROUP BY enrichment_status ORDER BY enrichment_status');
    
    res.json({
      backgroundWorker: backgroundWorker.getStatus(),
      jobRecovery: jobRecoveryService.getStatus(),
      jobQueue: jobs.rows,
      tradeEnrichment: trades.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to trigger manual recovery
app.post('/api/admin/trigger-recovery', requireAdmin, async (req, res) => {
  try {
    await jobRecoveryService.triggerRecovery();
    res.json({ 
      success: true, 
      message: 'Recovery triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(errorHandler);

app.use((req, res) => {
  if (isV1Request(req)) {
    return sendV1Error(res, 404, 'NOT_FOUND', 'Route not found');
  }

  res.status(404).json({ error: 'Route not found' });
});

function getPositiveIntEnv(name, fallback) {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function scheduleDeferredStartupTask(name, task, delayMs) {
  const timer = setTimeout(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[STARTUP] ${name} failed:`, error.message);
    }
  }, delayMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

async function runPnlBackfillIfNeeded() {
  if (process.env.SKIP_PNL_BACKFILL === 'true') {
    console.log('[BACKFILL] Skipping P&L engine backfill (SKIP_PNL_BACKFILL=true).');
    return;
  }

  if (process.env.RUN_PNL_BACKFILL_ON_START !== 'true') {
    console.log('[BACKFILL] Startup P&L engine backfill disabled (RUN_PNL_BACKFILL_ON_START=true to enable).');
    return;
  }

  const db = require('./config/database');

  try {
    const status = await db.query(
      `SELECT applied_at FROM pnl_engine_backfill_status WHERE id = 1`
    );
    if (status.rows[0]?.applied_at) {
      console.log(`[BACKFILL] P&L engine backfill already applied at ${status.rows[0].applied_at}.`);
      return;
    }
  } catch (error) {
    if (error.code === '42P01') {
      console.log('[BACKFILL] Status table missing; skipping startup backfill until migrations create it.');
      return;
    }
    throw error;
  }

  const { execFile } = require('child_process');
  const pathMod = require('path');
  const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'backfill-pnl-engine.js');

  console.log('[BACKFILL] Spawning canonical P&L engine backfill in background...');
  const child = execFile('node', [scriptPath, '--apply'], {
    env: process.env,
    cwd: pathMod.join(__dirname, '..')
  }, (err, stdout, stderr) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (err) {
      console.error(`[BACKFILL] Background backfill failed: ${err.message}`);
    } else {
      console.log('[BACKFILL] Background backfill complete.');
    }
  });

  if (typeof child.unref === 'function') {
    child.unref();
  }
}

async function runDollarStopLossRepairIfNeeded() {
  if (process.env.SKIP_DOLLAR_STOP_REPAIR === 'true') {
    console.log('[STOP LOSS] Skipping dollar stop-loss repair (SKIP_DOLLAR_STOP_REPAIR=true).');
    return;
  }

  const Trade = require('./models/Trade');
  await Trade.syncDollarDefaultStopLossesForAffectedUsers();
}

async function startTradeEnrichmentWorker() {
  console.log('Starting background worker for trade enrichment...');
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      await backgroundWorker.start();
      console.log('[SUCCESS] Background worker started for trade enrichment');
      return;
    } catch (error) {
      attempts++;
      console.error(`[ERROR] Failed to start background worker (attempt ${attempts}/${maxAttempts}):`, error.message);

      if (attempts >= maxAttempts) {
        console.error('[ERROR] CRITICAL: Background worker failed to start after multiple attempts');
        console.error('[ERROR] This will affect PRO tier trade enrichment features');

        if (process.env.NODE_ENV === 'production') {
          console.error('[ERROR] Exiting due to critical service failure in production');
          process.exit(1);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

function scheduleBackgroundServices(backgroundJobsDisabled) {
  const initialDelayMs = getPositiveIntEnv('BACKGROUND_JOB_START_DELAY_MS', 5000);
  const spacingMs = getPositiveIntEnv('BACKGROUND_JOB_START_SPACING_MS', 1000);
  let nextDelayMs = initialDelayMs;

  const defer = (name, task) => {
    scheduleDeferredStartupTask(name, task, nextDelayMs);
    nextDelayMs += spacingMs;
  };

  defer('pnl-backfill', runPnlBackfillIfNeeded);
  defer('dollar-stop-loss-repair', runDollarStopLossRepairIfNeeded);

  if (backgroundJobsDisabled) {
    console.log('CUSIP queue processing disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else {
    defer('cusip-queue', () => {
      const cusipQueue = require('./utils/cusipQueue');
      cusipQueue.startProcessing();
    });
  }

  if (backgroundJobsDisabled) {
    console.log('Price monitoring disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_PRICE_MONITORING !== 'false') {
    defer('price-monitoring', async () => {
      console.log('Starting price monitoring service...');
      await priceMonitoringService.start();
    });
  } else {
    console.log('Price monitoring disabled (ENABLE_PRICE_MONITORING=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Gamification disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_GAMIFICATION !== 'false') {
    defer('gamification', () => {
      console.log('Starting gamification scheduler...');
      GamificationScheduler.startScheduler();
    });
  } else {
    console.log('Gamification disabled (ENABLE_GAMIFICATION=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Trial scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_TRIAL_EMAILS !== 'false') {
    defer('trial-scheduler', () => {
      console.log('Starting trial scheduler...');
      TrialScheduler.startScheduler();
    });
  } else {
    console.log('Trial emails disabled (ENABLE_TRIAL_EMAILS=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Retention email scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_RETENTION_EMAILS !== 'false') {
    defer('retention-email-scheduler', () => {
      console.log('Starting retention email scheduler...');
      RetentionEmailScheduler.startScheduler();
    });
  } else {
    console.log('Retention emails disabled (ENABLE_RETENTION_EMAILS=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Options scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_OPTIONS_SCHEDULER !== 'false') {
    defer('options-scheduler', () => {
      console.log('Starting options scheduler...');
      OptionsScheduler.start();
    });
  } else {
    console.log('Options scheduler disabled (ENABLE_OPTIONS_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Broker sync scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_BROKER_SYNC_SCHEDULER !== 'false') {
    defer('broker-sync-scheduler', () => {
      console.log('Starting broker sync scheduler...');
      brokerSyncScheduler.start();
      console.log('[SUCCESS] Broker sync scheduler started');
    });
  } else {
    console.log('Broker sync scheduler disabled (ENABLE_BROKER_SYNC_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Plaid funding scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_PLAID_SYNC_SCHEDULER !== 'false') {
    defer('plaid-funding-scheduler', () => {
      console.log('Starting Plaid funding scheduler...');
      plaidFundingScheduler.start();
      console.log('[SUCCESS] Plaid funding scheduler started');
    });
  } else {
    console.log('Plaid funding scheduler disabled (ENABLE_PLAID_SYNC_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Dividend scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_DIVIDEND_SCHEDULER !== 'false') {
    defer('dividend-scheduler', () => {
      console.log('Starting dividend scheduler...');
      dividendScheduler.start();
      console.log('[SUCCESS] Dividend scheduler started');
    });
  } else {
    console.log('Dividend scheduler disabled (ENABLE_DIVIDEND_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('News scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_NEWS_SCHEDULER !== 'false') {
    defer('news-scheduler', () => {
      console.log('Starting news scheduler...');
      newsScheduler.start();
      console.log('[SUCCESS] News scheduler started');
    });
  } else {
    console.log('News scheduler disabled (ENABLE_NEWS_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Earnings scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_EARNINGS_SCHEDULER !== 'false') {
    defer('earnings-scheduler', () => {
      console.log('Starting earnings scheduler...');
      earningsScheduler.start();
      console.log('[SUCCESS] Earnings scheduler started');
    });
  } else {
    console.log('Earnings scheduler disabled (ENABLE_EARNINGS_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Symbol category scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_CATEGORY_SCHEDULER !== 'false') {
    defer('symbol-category-scheduler', () => {
      console.log('Starting symbol category scheduler...');
      symbolCategoryScheduler.start();
      console.log('[SUCCESS] Symbol category scheduler started');
    });
  } else {
    console.log('Symbol category scheduler disabled (ENABLE_CATEGORY_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Portfolio snapshot scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_PORTFOLIO_SNAPSHOT_SCHEDULER !== 'false') {
    defer('portfolio-snapshot-scheduler', () => {
      console.log('Starting portfolio snapshot scheduler...');
      portfolioSnapshotScheduler.start();
      console.log('[SUCCESS] Portfolio snapshot scheduler started');
    });
  } else {
    console.log('Portfolio snapshot scheduler disabled (ENABLE_PORTFOLIO_SNAPSHOT_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Web mention scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_WEB_MENTION_SCHEDULER !== 'false') {
    defer('web-mention-scheduler', () => {
      console.log('Starting web mention scheduler...');
      webMentionScheduler.start();
      console.log('[SUCCESS] Web mention scheduler started');
    });
  } else {
    console.log('Web mention scheduler disabled (ENABLE_WEB_MENTION_SCHEDULER=false)');
  }

  if (process.env.ENABLE_V1_WEBHOOKS === 'true') {
    defer('v1-webhook-bridge', () => webhookEventBridge.start());
  }

  if (backgroundJobsDisabled) {
    console.log('Edge report scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_EDGE_REPORTS !== 'false') {
    defer('edge-report-scheduler', () => {
      console.log('Starting edge report scheduler...');
      edgeReportScheduler.start();
      console.log('[SUCCESS] Edge report scheduler started');
    });
  } else {
    console.log('Edge report scheduler disabled (ENABLE_EDGE_REPORTS=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('CRM sync disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_CRM_SYNC === 'true') {
    defer('crm-sync-scheduler', () => {
      console.log('Starting CRM sync scheduler...');
      crmSyncScheduler.start();
      console.log('[SUCCESS] CRM sync scheduler started');
    });
  } else {
    console.log('CRM sync disabled (ENABLE_CRM_SYNC=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Activity tracking disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_ACTIVITY_TRACKING !== 'false') {
    defer('activity-tracking', () => {
      console.log('Starting activity tracking service...');
      activityTrackingService.start();
      console.log('[SUCCESS] Activity tracking service started');
    });
  } else {
    console.log('Activity tracking disabled (ENABLE_ACTIVITY_TRACKING=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Engagement tracking disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_ENGAGEMENT_TRACKING !== 'false') {
    defer('engagement-scheduler', () => {
      console.log('Starting engagement scheduler...');
      engagementScheduler.start();
      console.log('[SUCCESS] Engagement scheduler started');
    });
  } else {
    console.log('Engagement tracking disabled (ENABLE_ENGAGEMENT_TRACKING=false)');
  }

  if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
    console.log('Push notification service loaded');
  } else {
    console.log('Push notifications disabled (ENABLE_PUSH_NOTIFICATIONS=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Trade enrichment disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_TRADE_ENRICHMENT !== 'false') {
    defer('trade-enrichment-worker', startTradeEnrichmentWorker);
  } else {
    console.log('Trade enrichment disabled (ENABLE_TRADE_ENRICHMENT=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Job recovery disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_JOB_RECOVERY !== 'false') {
    defer('job-recovery', () => {
      console.log('Starting automatic job recovery service...');
      jobRecoveryService.start();
      console.log('[SUCCESS] Job recovery service started (prevents stuck enrichment jobs)');
    });
  } else {
    console.log('Job recovery disabled (ENABLE_JOB_RECOVERY=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Enrichment cache cleanup disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_ENRICHMENT_CACHE_CLEANUP !== 'false') {
    defer('enrichment-cache-cleanup', () => {
      console.log('Starting global enrichment cache cleanup service...');
      globalEnrichmentCacheCleanupService.start();
      console.log('[SUCCESS] Global enrichment cache cleanup service started');
    });
  } else {
    console.log('Enrichment cache cleanup disabled (ENABLE_ENRICHMENT_CACHE_CLEANUP=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Backup scheduler disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_BACKUP_SCHEDULER !== 'false') {
    defer('backup-scheduler', async () => {
      console.log('Initializing backup scheduler...');
      await backupScheduler.initialize();
      console.log('[SUCCESS] Backup scheduler initialized');
    });
  } else {
    console.log('Backup scheduler disabled (ENABLE_BACKUP_SCHEDULER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Stock scanner disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_STOCK_SCANNER !== 'false') {
    defer('stock-scanner-scheduler', async () => {
      console.log('Initializing stock scanner scheduler...');
      const StockScannerService = require('./services/stockScannerService');
      const cleanedUp = await StockScannerService.cleanupStuckScans();
      if (cleanedUp > 0) {
        console.log(`[SUCCESS] Cleaned up ${cleanedUp} stuck scan(s)`);
      }

      stockScannerScheduler.initialize();
      console.log('[SUCCESS] Stock scanner scheduler initialized (Russell 2000 scan runs quarterly at 3 AM)');

      watchlistPillarsScheduler.initialize();
      console.log('[SUCCESS] Watchlist pillars scheduler initialized (daily at 4 AM)');
    });
  } else {
    console.log('Stock scanner disabled (ENABLE_STOCK_SCANNER=false)');
  }

  if (backgroundJobsDisabled) {
    console.log('Stock split monitoring disabled (DISABLE_BACKGROUND_JOBS=true)');
  } else if (process.env.ENABLE_STOCK_SPLIT_MONITORING !== 'false') {
    defer('stock-split-monitoring', () => {
      const stockSplitService = require('./services/stockSplitService');
      stockSplitService.startDailyCheck();
      console.log('[SUCCESS] Stock split monitoring started');
    });
  } else {
    console.log('Stock split monitoring disabled (ENABLE_STOCK_SPLIT_MONITORING=false)');
  }
}

// Detect a read-only standby (e.g. a streaming-replication hot standby).
// Auto-detected via pg_is_in_recovery(); STANDBY_MODE=true/false overrides.
// In standby mode the app performs NO boot-time writes (migrations, schema
// repair, billing init) and starts NO background schedulers, so a warm-standby
// box can run safely against a read-only replica without crashing or
// double-processing jobs with shared credentials.
async function detectStandbyMode() {
  if (process.env.STANDBY_MODE === 'true') return true;
  if (process.env.STANDBY_MODE === 'false') return false;
  try {
    const db = require('./config/database');
    const result = await db.query('SELECT pg_is_in_recovery() AS in_recovery');
    return !!(result.rows[0] && result.rows[0].in_recovery === true);
  } catch (err) {
    logger.warn(`Could not determine database recovery state (${err.message}); assuming primary.`, 'startup');
    return false;
  }
}

// Function to start server with migration
async function startServer() {
  try {
    const { warnings } = validateEnv();
    logger.info('Starting TradeTally server...');
    warnings.forEach((warning) => logger.warn(warning, 'startup'));
    const storageHealth = await storageHealthService.getHealth();
    storageHealth.warnings.forEach((warning) => logger.warn(warning, 'startup'));
    // A read-only standby must never write on boot or start schedulers.
    const standbyMode = await detectStandbyMode();
    const backgroundJobsDisabled = isBackgroundJobsDisabled() || standbyMode;
    if (standbyMode) {
      logger.warn('STANDBY MODE: database is a read-only replica — skipping migrations, schema repair, billing init, and ALL background jobs. Promote the database and restart to run as primary.', 'startup');
    }

    // Initialize PostHog telemetry (optional)
    await initializePostHogTelemetry();

    // Run database migrations first (never against a read-only standby)
    if (standbyMode) {
      logger.info('Standby: skipping migrations');
    } else if (process.env.RUN_MIGRATIONS !== 'false') {
      logger.info('Running database migrations...');
      await migrate();
    } else {
      logger.info('Skipping migrations (RUN_MIGRATIONS=false)');
    }

    if (!standbyMode) {
      const schemaRepair = await ensurePostExitSchema();
      if (schemaRepair.repairedTradeColumns.length > 0 || schemaRepair.repairedUserSettingsColumns.length > 0) {
        logger.warn(
          `Repaired missing post-exit schema columns. trades: ${
            schemaRepair.repairedTradeColumns.join(', ') || 'none'
          }; user_settings: ${schemaRepair.repairedUserSettingsColumns.join(', ') || 'none'}`,
          'startup'
        );
      }

      // Initialize billing service (conditional)
      await BillingService.initialize();
    }

    // Start the server
    app.listen(PORT, () => {
      logger.info(`✓ TradeTally server running on port ${PORT}`);
      logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`✓ Log level: ${process.env.LOG_LEVEL || 'INFO'}`);
      if (standbyMode) {
        logger.warn('STANDBY MODE: not starting any background schedulers.', 'startup');
      } else {
        scheduleBackgroundServices(backgroundJobsDisabled);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await priceMonitoringService.stop();
  OptionsScheduler.stop();
  brokerSyncScheduler.stop();
  plaidFundingScheduler.stop();
  newsScheduler.stop();
  earningsScheduler.stop();
  symbolCategoryScheduler.stop();
  portfolioSnapshotScheduler.stop();
  webMentionScheduler.stop();
  edgeReportScheduler.stop();
  if (typeof GamificationScheduler.stopScheduler === 'function') GamificationScheduler.stopScheduler();
  if (typeof TrialScheduler.stopScheduler === 'function') TrialScheduler.stopScheduler();
  if (RetentionEmailScheduler.stopScheduler) RetentionEmailScheduler.stopScheduler();
  webhookEventBridge.stop();
  jobRecoveryService.stop();
  globalEnrichmentCacheCleanupService.stop();
  backupScheduler.stopAll();
  stockScannerScheduler.stop();
  watchlistPillarsScheduler.stop();
  await backgroundWorker.stop();
  await shutdownPostHogTelemetry();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await priceMonitoringService.stop();
  OptionsScheduler.stop();
  brokerSyncScheduler.stop();
  plaidFundingScheduler.stop();
  newsScheduler.stop();
  earningsScheduler.stop();
  symbolCategoryScheduler.stop();
  portfolioSnapshotScheduler.stop();
  webMentionScheduler.stop();
  edgeReportScheduler.stop();
  if (typeof GamificationScheduler.stopScheduler === 'function') GamificationScheduler.stopScheduler();
  if (typeof TrialScheduler.stopScheduler === 'function') TrialScheduler.stopScheduler();
  if (RetentionEmailScheduler.stopScheduler) RetentionEmailScheduler.stopScheduler();
  webhookEventBridge.stop();
  jobRecoveryService.stop();
  globalEnrichmentCacheCleanupService.stop();
  backupScheduler.stopAll();
  stockScannerScheduler.stop();
  watchlistPillarsScheduler.stop();
  await backgroundWorker.stop();
  await shutdownPostHogTelemetry();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildHealthStatus,
  startServer
};

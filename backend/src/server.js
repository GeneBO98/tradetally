const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { migrate } = require('./utils/migrate');
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
const adminRoutes = require('./routes/admin.routes');
const adminAnalyticsRoutes = require('./routes/adminAnalytics.routes');
const featuresRoutes = require('./routes/features.routes');
const behavioralAnalyticsRoutes = require('./routes/behavioralAnalytics.routes');
const billingRoutes = require('./routes/billing.routes');
const watchlistRoutes = require('./routes/watchlist.routes');
const priceAlertsRoutes = require('./routes/priceAlerts.routes');
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
const instrumentTemplatesRoutes = require('./routes/instrumentTemplates.routes');
const tradeManagementRoutes = require('./routes/tradeManagement.routes');
const aiRoutes = require('./routes/ai.routes');
const BillingService = require('./services/billingService');
const priceMonitoringService = require('./services/priceMonitoringService');
const backupScheduler = require('./services/backupScheduler.service');
const stockScannerScheduler = require('./services/stockScannerScheduler');
const GamificationScheduler = require('./services/gamificationScheduler');
const TrialScheduler = require('./services/trialScheduler');
const RetentionEmailScheduler = require('./services/retentionEmailScheduler');
const OptionsScheduler = require('./services/optionsScheduler');
const brokerSyncScheduler = require('./services/brokerSync/brokerSyncScheduler');
const dividendScheduler = require('./services/dividendScheduler');
const backgroundWorker = require('./workers/backgroundWorker');
const jobRecoveryService = require('./services/jobRecoveryService');
const pushNotificationService = require('./services/pushNotificationService');
const globalEnrichmentCacheCleanupService = require('./services/globalEnrichmentCacheCleanupService');
const { swaggerSpec, swaggerUi } = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5001;

// Trust proxy headers for rate limiting and forwarded headers
app.set('trust proxy', true);

// Rate limiting configuration - can be disabled or adjusted via environment variables
// RATE_LIMIT_ENABLED=false disables rate limiting entirely (useful for self-hosted instances)
// RATE_LIMIT_MAX sets the maximum requests per window (default: 1000)
// RATE_LIMIT_WINDOW_MS sets the window duration in milliseconds (default: 15 minutes)
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX) || 1000;
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

// Custom key generator to properly identify clients behind proxies
const getClientIp = (req) => {
  // Try X-Forwarded-For header first (set by nginx/proxies)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs; the first one is the client
    return forwarded.split(',')[0].trim();
  }
  // Fall back to X-Real-IP (also set by nginx)
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  // Finally fall back to connection remote address
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  keyGenerator: getClientIp, // Use our custom IP extractor
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Too many requests, please try again later.',
    retryAfter: Math.ceil(rateLimitWindowMs / 1000)
  },
  skip: (req) => {
    // Skip rate limiting if disabled via environment variable
    if (!rateLimitEnabled) return true;
    // Skip rate limiting for import endpoints
    if (req.path.includes('/import')) return true;
    return false;
  }
});

// Log rate limit configuration on startup
if (rateLimitEnabled) {
  logger.info(`Rate limiting enabled: ${rateLimitMax} requests per ${rateLimitWindowMs / 1000}s window`, 'rate-limit');
} else {
  logger.info('Rate limiting is disabled via RATE_LIMIT_ENABLED=false', 'rate-limit');
}

// Skip rate limiting for certain paths (legacy function kept for compatibility)
const skipRateLimit = (req, res, next) => {
  return limiter(req, res, next);
};

// Apply security middleware (CSP, anti-clickjacking, etc.)
app.use(securityMiddleware());

// Optimized CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [])
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
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'X-Device-ID', 'X-App-Version', 'X-Platform', 'X-Request-ID'],
  exposedHeaders: ['X-API-Version', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset', 'X-Request-ID'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Use morgan for logging in development, but not in production
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev', {
    skip: function (req, res) {
      // Skip logging for frequently polled endpoints
      return req.path.includes('/import/history') || 
             req.path.includes('/health') ||
             (req.path.includes('/trades') && req.query && req.query.page);
    }
  }));
}

// Cookie parser middleware
app.use(cookieParser());

// Body parsing middleware (skip for webhook routes that need raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhooks/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));
app.use('/api', skipRateLimit);

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
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/behavioral-analytics', behavioralAnalyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/price-alerts', priceAlertsRoutes);
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
app.use('/api/instrument-templates', instrumentTemplatesRoutes);
app.use('/api/trade-management', tradeManagementRoutes);
app.use('/api/ai', aiRoutes);

// OAuth2 Provider endpoints
app.use('/oauth', oauth2Routes);
app.use('/api/oauth', oauth2Routes);

// Well-known endpoints for mobile discovery
app.use('/.well-known', wellKnownRoutes);

// Swagger API Documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TradeTally API Documentation',
  }));
  logger.info('📚 Swagger documentation available at /api-docs');
}

// Health endpoint with database connection check and background worker status
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'OK',
      backgroundWorker: backgroundWorker.getStatus(),
      jobRecovery: jobRecoveryService.getStatus(),
      enrichmentCacheCleanup: globalEnrichmentCacheCleanupService.getStatus()
    }
  };
  
  // Check database connection
  try {
    await require('./config/database').query('SELECT 1');
  } catch (error) {
    health.services.database = 'ERROR';
    health.status = 'DEGRADED';
  }
  
  // Check if background worker is running (critical for PRO features)
  if (!health.services.backgroundWorker.isRunning || !health.services.backgroundWorker.queueProcessing) {
    health.status = 'DEGRADED';
    health.services.backgroundWorker.status = 'ERROR';
  } else {
    health.services.backgroundWorker.status = 'OK';
  }

  // Check if job recovery is running
  if (!health.services.jobRecovery.isRunning) {
    health.status = 'DEGRADED';
    health.services.jobRecovery.status = 'ERROR';
  } else {
    health.services.jobRecovery.status = 'OK';
  }
  
  res.json(health);
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

// OWASP-compliant security headers test endpoint
app.get('/api/security-test', (req, res) => {
  res.json({
    message: 'OWASP-compliant security headers applied',
    timestamp: new Date().toISOString(),
    owasp_compliance: {
      'HTTP_Headers_Cheat_Sheet': 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html',
      'HSTS_Cheat_Sheet': 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html',
      'CWE-693': 'Protection Mechanism Failure - Mitigated with strict CSP directives',
      'CWE-1021': 'Improper Restriction of Rendered UI Layers - Mitigated with enhanced anti-clickjacking',
      'WASC-15': 'Application Misconfiguration - Addressed with OWASP-compliant headers',
      'OWASP_A05_2021': 'Security Misconfiguration - Comprehensive header implementation',
      'WSTG-v42-CLNT-09': 'Clickjacking Testing - Multiple protection layers implemented'
    },
    headers: {
      'X-Frame-Options': res.getHeader('X-Frame-Options') || 'Not Set',
      'X-Content-Type-Options': res.getHeader('X-Content-Type-Options') || 'Not Set',
      'X-XSS-Protection': 'Disabled (OWASP Recommended)',
      'Content-Security-Policy': res.getHeader('Content-Security-Policy') ? 'Set with OWASP Level 3 directives' : 'Not Set',
      'Strict-Transport-Security': res.getHeader('Strict-Transport-Security') ? 'Set (2-year max-age)' : 'Not Set',
      'Referrer-Policy': res.getHeader('Referrer-Policy') || 'Not Set',
      'Cross-Origin-Resource-Policy': res.getHeader('Cross-Origin-Resource-Policy') || 'Not Set',
      'Cross-Origin-Opener-Policy': res.getHeader('Cross-Origin-Opener-Policy') || 'Not Set',
      'Permissions-Policy': res.getHeader('Permissions-Policy') ? 'Set' : 'Not Set',
      'Server': res.getHeader('Server') || 'Hidden'
    },
    security_measures: {
      'CWE-693_Mitigation': 'Comprehensive CSP with report-uri, strict directives',
      'CWE-1021_Mitigation': 'Enhanced anti-clickjacking with multiple protection layers',
      'WASC-15_Mitigation': 'OWASP-compliant headers, secure configuration',
      'OWASP_A05_2021_Mitigation': 'Security misconfiguration prevention with comprehensive headers',
      'WSTG-v42-CLNT-09_Mitigation': 'Multi-layered clickjacking protection (CSP + X-Frame-Options + legacy headers)',
      'CSP_Level': '3 (Latest)',
      'CSP_Violations': 'Monitored via /api/csp-report endpoint',
      'Clickjacking_Protection': 'frame-ancestors none, X-Frame-Options DENY, legacy CSP headers',
      'XSS_Protection': 'Explicitly disabled per OWASP recommendation - modern browsers have better protection',
      'HSTS_MaxAge': '63072000 seconds (2 years) as per OWASP guidelines',
      'CSP_FrameAncestors': 'Complete UI layer restriction for CWE-1021 compliance'
    }
  });
});

// Admin endpoint to check enrichment status
app.get('/api/admin/enrichment-status', async (req, res) => {
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
app.post('/api/admin/trigger-recovery', async (req, res) => {
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
  res.status(404).json({ error: 'Route not found' });
});

// Function to start server with migration
async function startServer() {
  try {
    logger.info('Starting TradeTally server...');
    
    // Run database migrations first
    if (process.env.RUN_MIGRATIONS !== 'false') {
      logger.info('Running database migrations...');
      await migrate();
    } else {
      logger.info('Skipping migrations (RUN_MIGRATIONS=false)');
    }
    
    // Initialize billing service (conditional)
    await BillingService.initialize();
    
    // Start price monitoring service for Pro users
    if (process.env.ENABLE_PRICE_MONITORING !== 'false') {
      console.log('Starting price monitoring service...');
      await priceMonitoringService.start();
    } else {
      console.log('Price monitoring disabled (ENABLE_PRICE_MONITORING=false)');
    }
    
    // Start gamification scheduler
    if (process.env.ENABLE_GAMIFICATION !== 'false') {
      console.log('Starting gamification scheduler...');
      GamificationScheduler.startScheduler();
    } else {
      console.log('Gamification disabled (ENABLE_GAMIFICATION=false)');
    }
    
    // Start trial scheduler (for trial expiration emails)
    if (process.env.ENABLE_TRIAL_EMAILS !== 'false') {
      console.log('Starting trial scheduler...');
      TrialScheduler.startScheduler();
    } else {
      console.log('Trial emails disabled (ENABLE_TRIAL_EMAILS=false)');
    }

    // Start retention email scheduler (weekly digest, inactive re-engagement)
    if (process.env.ENABLE_RETENTION_EMAILS !== 'false') {
      console.log('Starting retention email scheduler...');
      RetentionEmailScheduler.startScheduler();
    } else {
      console.log('Retention emails disabled (ENABLE_RETENTION_EMAILS=false)');
    }

    // Start options scheduler (for automatic expired options closure)
    if (process.env.ENABLE_OPTIONS_SCHEDULER !== 'false') {
      console.log('Starting options scheduler...');
      OptionsScheduler.start();
    } else {
      console.log('Options scheduler disabled (ENABLE_OPTIONS_SCHEDULER=false)');
    }

    // Start broker sync scheduler (for automatic trade syncing from connected brokers)
    if (process.env.ENABLE_BROKER_SYNC_SCHEDULER !== 'false') {
      console.log('Starting broker sync scheduler...');
      brokerSyncScheduler.start();
      console.log('[SUCCESS] Broker sync scheduler started');
    } else {
      console.log('Broker sync scheduler disabled (ENABLE_BROKER_SYNC_SCHEDULER=false)');
    }

    // Start dividend scheduler (for automatic dividend tracking on open positions)
    if (process.env.ENABLE_DIVIDEND_SCHEDULER !== 'false') {
      console.log('Starting dividend scheduler...');
      dividendScheduler.start();
      console.log('[SUCCESS] Dividend scheduler started');
    } else {
      console.log('Dividend scheduler disabled (ENABLE_DIVIDEND_SCHEDULER=false)');
    }

    // Initialize push notification service
    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      console.log('✓ Push notification service loaded');
    } else {
      console.log('Push notifications disabled (ENABLE_PUSH_NOTIFICATIONS=false)');
    }

    // Start background worker for trade enrichment - CRITICAL for PRO tier
    if (process.env.ENABLE_TRADE_ENRICHMENT !== 'false') {
      console.log('Starting background worker for trade enrichment...');
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          await backgroundWorker.start();
          console.log('✓ Background worker started for trade enrichment');
          break;
        } catch (error) {
          attempts++;
          console.error(`[ERROR] Failed to start background worker (attempt ${attempts}/${maxAttempts}):`, error.message);
          
          if (attempts >= maxAttempts) {
            console.error('[ERROR] CRITICAL: Background worker failed to start after multiple attempts');
            console.error('[ERROR] This will affect PRO tier trade enrichment features');
            
            // In production, we should fail fast for critical services
            if (process.env.NODE_ENV === 'production') {
              console.error('[ERROR] Exiting due to critical service failure in production');
              process.exit(1);
            }
          } else {
            // Wait 2 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    } else {
      console.log('Trade enrichment disabled (ENABLE_TRADE_ENRICHMENT=false)');
    }

    // Start automatic job recovery service - CRITICAL for PRO tier reliability
    if (process.env.ENABLE_JOB_RECOVERY !== 'false') {
      console.log('Starting automatic job recovery service...');
      jobRecoveryService.start();
      console.log('✓ Job recovery service started (prevents stuck enrichment jobs)');
    } else {
      console.log('Job recovery disabled (ENABLE_JOB_RECOVERY=false)');
    }

    // Start global enrichment cache cleanup service
    if (process.env.ENABLE_ENRICHMENT_CACHE_CLEANUP !== 'false') {
      console.log('Starting global enrichment cache cleanup service...');
      globalEnrichmentCacheCleanupService.start();
      console.log('✓ Global enrichment cache cleanup service started');
    } else {
      console.log('Enrichment cache cleanup disabled (ENABLE_ENRICHMENT_CACHE_CLEANUP=false)');
    }

    // Initialize backup scheduler
    if (process.env.ENABLE_BACKUP_SCHEDULER !== 'false') {
      console.log('Initializing backup scheduler...');
      await backupScheduler.initialize();
      console.log('✓ Backup scheduler initialized');
    } else {
      console.log('Backup scheduler disabled (ENABLE_BACKUP_SCHEDULER=false)');
    }

    // Initialize stock scanner scheduler (3 AM quarterly Russell 2000 scan)
    if (process.env.ENABLE_STOCK_SCANNER !== 'false') {
      console.log('Initializing stock scanner scheduler...');
      
      // Clean up any stuck scans on startup
      const StockScannerService = require('./services/stockScannerService');
      const cleanedUp = await StockScannerService.cleanupStuckScans();
      if (cleanedUp > 0) {
        console.log(`✓ Cleaned up ${cleanedUp} stuck scan(s)`);
      }
      
      stockScannerScheduler.initialize();
      console.log('✓ Stock scanner scheduler initialized (Russell 2000 scan runs quarterly at 3 AM)');
    } else {
      console.log('Stock scanner disabled (ENABLE_STOCK_SCANNER=false)');
    }

    // Start the server
    app.listen(PORT, () => {
      logger.info(`✓ TradeTally server running on port ${PORT}`);
      logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`✓ Log level: ${process.env.LOG_LEVEL || 'INFO'}`);
      
      // Start stock split daily checks
      const stockSplitService = require('./services/stockSplitService');
      stockSplitService.startDailyCheck();
      console.log('✓ Stock split monitoring started');
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
  GamificationScheduler.stopScheduler();
  TrialScheduler.stopScheduler();
  if (RetentionEmailScheduler.stopScheduler) RetentionEmailScheduler.stopScheduler();
  jobRecoveryService.stop();
  globalEnrichmentCacheCleanupService.stop();
  backupScheduler.stopAll();
  stockScannerScheduler.stop();
  await backgroundWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await priceMonitoringService.stop();
  OptionsScheduler.stop();
  brokerSyncScheduler.stop();
  GamificationScheduler.stopScheduler();
  TrialScheduler.stopScheduler();
  if (RetentionEmailScheduler.stopScheduler) RetentionEmailScheduler.stopScheduler();
  jobRecoveryService.stop();
  globalEnrichmentCacheCleanupService.stop();
  backupScheduler.stopAll();
  stockScannerScheduler.stop();
  await backgroundWorker.stop();
  process.exit(0);
});

// Start the server
startServer();
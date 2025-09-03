const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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
const BillingService = require('./services/billingService');
const priceMonitoringService = require('./services/priceMonitoringService');
const GamificationScheduler = require('./services/gamificationScheduler');
const TrialScheduler = require('./services/trialScheduler');
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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  validate: {
    trustProxy: false, // Disable trust proxy validation for rate limiting
    xForwardedForHeader: false // Disable X-Forwarded-For validation
  }
});

// Skip rate limiting for certain paths
const skipRateLimit = (req, res, next) => {
  // Skip rate limiting for import endpoints
  if (req.path.includes('/import')) {
    return next();
  }
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
          console.error(`❌ Failed to start background worker (attempt ${attempts}/${maxAttempts}):`, error.message);
          
          if (attempts >= maxAttempts) {
            console.error('🚨 CRITICAL: Background worker failed to start after multiple attempts');
            console.error('🚨 This will affect PRO tier trade enrichment features');
            
            // In production, we should fail fast for critical services
            if (process.env.NODE_ENV === 'production') {
              console.error('🚨 Exiting due to critical service failure in production');
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
  jobRecoveryService.stop();
  globalEnrichmentCacheCleanupService.stop();
  await backgroundWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await priceMonitoringService.stop();
  jobRecoveryService.stop();
  await backgroundWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await priceMonitoringService.stop();
  process.exit(0);
});

// Start the server
startServer();
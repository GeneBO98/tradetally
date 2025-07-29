const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { migrate } = require('./utils/migrate');
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
const featuresRoutes = require('./routes/features.routes');
const behavioralAnalyticsRoutes = require('./routes/behavioralAnalytics.routes');
const billingRoutes = require('./routes/billing.routes');
const watchlistRoutes = require('./routes/watchlist.routes');
const priceAlertsRoutes = require('./routes/priceAlerts.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const BillingService = require('./services/billingService');
const priceMonitoringService = require('./services/priceMonitoringService');
const GamificationScheduler = require('./services/gamificationScheduler');
const TrialScheduler = require('./services/trialScheduler');
const backgroundWorker = require('./workers/backgroundWorker');
const jobRecoveryService = require('./services/jobRecoveryService');
const pushNotificationService = require('./services/pushNotificationService');
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

app.use(helmet());

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

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
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
  app.use(morgan('dev'));
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
app.use('/api/features', featuresRoutes);
app.use('/api/behavioral-analytics', behavioralAnalyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/price-alerts', priceAlertsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/gamification', gamificationRoutes);

// Well-known endpoints for mobile discovery
app.use('/.well-known', wellKnownRoutes);

// Health endpoint with background worker status
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'OK',
      backgroundWorker: backgroundWorker.getStatus(),
      jobRecovery: jobRecoveryService.getStatus()
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
    console.log('Starting TradeTally server...');
    
    // Run database migrations first
    if (process.env.RUN_MIGRATIONS !== 'false') {
      console.log('Running database migrations...');
      await migrate();
    } else {
      console.log('Skipping migrations (RUN_MIGRATIONS=false)');
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
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`✓ TradeTally server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await priceMonitoringService.stop();
  jobRecoveryService.stop();
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
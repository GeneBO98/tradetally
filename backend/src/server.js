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
const BillingService = require('./services/billingService');
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
app.use(express.json());
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

// Well-known endpoints for mobile discovery
app.use('/.well-known', wellKnownRoutes);

// Legacy health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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

// Start the server
startServer();
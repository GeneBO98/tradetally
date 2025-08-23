const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { migrate } = require('./utils/migrate');
const { securityMiddleware } = require('./middleware/security');
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

// Well-known endpoints for mobile discovery
app.use('/.well-known', wellKnownRoutes);

// Health endpoint with database connection check
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'OK'
    }
  };
  
  // Check database connection
  try {
    await require('./config/database').query('SELECT 1');
  } catch (error) {
    health.services.database = 'ERROR';
    health.status = 'DEGRADED';
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
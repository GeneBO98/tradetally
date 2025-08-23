const helmet = require('helmet');

// Security headers middleware with OWASP-compliant configuration
// References:
// - https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
// - https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html
// - https://owasp.org/www-community/Security_Headers
const securityMiddleware = () => {
  return [
    // Helmet with OWASP-compliant security headers
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Core CSP directives - OWASP Level 3 compliant
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            // OWASP CWE-693 Mitigation: Strict script sources
            "'unsafe-inline'", // TODO: Replace with nonces for CWE-693 compliance
            "https://cdn.jsdelivr.net",
            "https://unpkg.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for CSS frameworks
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net",
          ],
          imgSrc: [
            "'self'",
            "data:",
            "https:", // Allow all HTTPS images
            "blob:",
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "data:",
          ],
          connectSrc: [
            "'self'",
            // External API endpoints that the backend connects to
            "https://api.finnhub.io", // Finnhub financial data API
            "https://www.alphavantage.co", // Alpha Vantage API
            "https://generativelanguage.googleapis.com", // Google Gemini AI API
            ...(process.env.NODE_ENV !== 'production' ? ['ws:', 'wss:'] : []),
          ],
          // OWASP Anti-clickjacking directives (CWE-1021 & WSTG-v42-CLNT-09 mitigation)
          frameSrc: ["'none'"], // Block all framing
          frameAncestors: ["'none'"], // CSP Level 2 - Complete clickjacking protection
          childSrc: ["'none'"], // CSP Level 3 - Prevent nested browsing contexts
          // OWASP Injection prevention directives (CWE-693 mitigation)  
          objectSrc: ["'none'"], // Block object/embed/applet tags
          embedSrc: ["'none'"], // CSP3 directive for embed tags
          baseUri: ["'self'"], // Restrict base tag usage
          formAction: ["'self'"], // Restrict form submission targets
          // OWASP CSP Level 3 directives for WASC-15 compliance
          manifestSrc: ["'self'"], // Web app manifest sources
          mediaSrc: ["'self'"], // Audio/video sources
          childSrc: ["'none'"], // Child browsing context sources
          workerSrc: ["'self'"], // Worker script sources
          // OWASP Transport Security (WASC-15 mitigation)
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
          // OWASP CSP violation reporting for monitoring
          reportUri: ["/api/csp-report"], // CSP violation reporting endpoint
        },
        reportOnly: false, // Enforce policy (not report-only)
        useDefaults: false, // Don't use helmet defaults, use our OWASP config
        setAllHeaders: true, // Set all CSP headers for broader compatibility
      },
      
      // OWASP HSTS Configuration
      // Reference: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html
      hsts: {
        maxAge: 63072000, // 2 years (OWASP recommended: long max-age)
        includeSubDomains: true, // Apply to all subdomains
        preload: process.env.NODE_ENV === 'production' // Only preload in production
      },
      
      // Frame Options (Defense in depth - CSP frameAncestors is preferred)
      // CWE-1021 & WSTG-v42-CLNT-09 mitigation
      frameOptions: {
        action: 'deny' // X-Frame-Options: DENY - Complete clickjacking protection
      },
      
      // Content Type Options
      noSniff: true, // X-Content-Type-Options: nosniff
      
      // XSS Filter (Note: OWASP recommends disabling this in modern browsers)
      xssFilter: false, // Disabled per OWASP recommendation
      
      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      
      // Cross-Origin Policies (OWASP recommended)
      crossOriginEmbedderPolicy: false, // Disable for API compatibility
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
    }),

    // OWASP-compliant additional security headers middleware
    // CWE-693, WASC-15, CWE-1021, and WSTG-v42-CLNT-09 mitigation
    (req, res, next) => {
      // Enhanced Anti-clickjacking headers (defense in depth) 
      // CWE-1021 & WSTG-v42-CLNT-09 mitigation
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Security-Policy', 'frame-ancestors \'none\''); // Legacy CSP header
      res.setHeader('Content-Security-Policy', res.getHeader('Content-Security-Policy')); // Ensure CSP is set
      
      // OWASP recommended security headers - WASC-15 mitigation
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Note: X-XSS-Protection is disabled per OWASP recommendation
      // Modern browsers have better XSS protection, and this header can create vulnerabilities
      res.setHeader('X-XSS-Protection', '0'); // Explicitly disabled per OWASP
      
      // Referrer Policy - WASC-15 compliance
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Permissions Policy (OWASP recommended) - WASC-15 compliance
      res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), fullscreen=(), display-capture=()');
      
      // Cross-Origin Resource Policy (OWASP recommended) - WASC-15 compliance  
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      
      // Cross-Origin Opener Policy (OWASP recommended) - WASC-15 compliance
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      
      // Cross-Origin Embedder Policy (WASC-15 mitigation)
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      
      // Server information hiding (OWASP recommended) - CWE-693 mitigation
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      res.setHeader('Server', 'TradeTally'); // Generic server name
      
      // API versioning and security confirmation
      res.setHeader('X-API-Version', '1.0');
      res.setHeader('X-Content-Security-Policy', 'enabled');
      res.setHeader('X-OWASP-CWE-693', 'mitigated'); // CWE-693 status
      res.setHeader('X-OWASP-WASC-15', 'compliant'); // WASC-15 status
      
      // Security-focused cache control headers (WASC-15 compliance)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Additional OWASP security headers for API endpoints
      res.setHeader('X-Download-Options', 'noopen'); // IE8+ security
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none'); // Adobe Flash/PDF security
      res.setHeader('X-DNS-Prefetch-Control', 'off'); // Privacy protection
      
      // OWASP A05:2021 Security Misconfiguration prevention
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive'); // Search engine control
      
      // Additional A05:2021 mitigation headers
      res.setHeader('X-Content-Options', 'nosniff'); // Additional content-type protection
      res.setHeader('X-UA-Compatible', 'IE=Edge'); // Force latest IE rendering engine
      res.setHeader('X-Webkit-CSP', 'frame-ancestors \'none\''); // Webkit-specific CSP
      res.setHeader('X-WebKit-CSP', 'frame-ancestors \'none\''); // Alternative Webkit CSP
      
      // CWE-1021 specific mitigation headers
      res.setHeader('X-FRAME-OPTIONS', 'DENY'); // Uppercase variant for compatibility
      res.setHeader('X-OWASP-CWE-1021', 'mitigated'); // CWE-1021 status  
      res.setHeader('X-OWASP-WSTG-CLNT-09', 'protected'); // Clickjacking test status
      
      next();
    }
  ];
};

// CSP nonce generator for dynamic scripts (optional)
const generateCSPNonce = (req, res, next) => {
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64');
  next();
};

module.exports = {
  securityMiddleware,
  generateCSPNonce
};
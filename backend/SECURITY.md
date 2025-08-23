# TradeTally Security Implementation

## OWASP-Compliant Security Headers

This document outlines the comprehensive security headers implemented across all API endpoints following OWASP guidelines and best practices.

### References
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP HTTP Strict Transport Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
- [OWASP Security Headers Project](https://owasp.org/www-community/Security_Headers)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

### 1. Content Security Policy (CSP)
**OWASP Reference**: [CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

- **Purpose**: Primary defense against XSS attacks by controlling resource loading
- **Implementation**: Configured in `middleware/security.js`
- **Key Directives**:
  - `default-src 'self'` - Restrict all resources to same origin by default
  - `script-src` - JavaScript sources (⚠️ includes 'unsafe-inline' - consider nonces)
  - `style-src` - CSS sources with Google Fonts support
  - `img-src` - Image sources allowing HTTPS, data URLs, and blobs
  - `connect-src` - AJAX/API endpoints (Finnhub, Alpha Vantage, Gemini)
  - `frame-ancestors 'none'` - Modern replacement for X-Frame-Options
  - `object-src 'none'` - Blocks object/embed/applet tags
  - `base-uri 'self'` - Restricts base tag manipulation
  - `form-action 'self'` - Limits form submission targets

### 2. HTTP Strict Transport Security (HSTS)
**OWASP Reference**: [HSTS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)

- **Header**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- **Max-Age**: 63,072,000 seconds (2 years) - OWASP recommended long duration
- **includeSubDomains**: Applies HSTS to all subdomains
- **preload**: Enables HSTS preload list submission (production only)
- **Purpose**: Forces HTTPS connections and prevents protocol downgrade attacks

### 3. Anti-Clickjacking Protection
**OWASP Reference**: [Clickjacking Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)

- **Primary Protection**: CSP `frame-ancestors 'none'` directive
- **Fallback Header**: `X-Frame-Options: DENY` (for older browsers)
- **Purpose**: Prevents the application from being embedded in frames/iframes
- **Protection**: Complete prevention of clickjacking attacks

### 4. OWASP Recommended Security Headers

#### Content Type Protection
- **Header**: `X-Content-Type-Options: nosniff`
- **Purpose**: Prevents MIME type confusion attacks
- **OWASP Status**: ✅ Essential for all web applications

#### XSS Protection (Explicitly Disabled)
- **Header**: Not set (previously `X-XSS-Protection`)
- **OWASP Recommendation**: Disable this header in modern applications
- **Reason**: Can create vulnerabilities; modern browsers have better built-in protection

#### Referrer Policy
- **Header**: `Referrer-Policy: strict-origin-when-cross-origin`
- **Purpose**: Controls referrer information leakage
- **OWASP Status**: ✅ Recommended for privacy protection

#### Permissions Policy
- **Header**: `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- **Purpose**: Disables sensitive browser APIs
- **OWASP Status**: ✅ Recommended for API security

#### Cross-Origin Policies (New OWASP Requirements)
- **Cross-Origin-Resource-Policy**: `same-site`
- **Cross-Origin-Opener-Policy**: `same-origin`
- **Purpose**: Controls cross-origin resource sharing and popup interactions
- **OWASP Status**: ✅ Required for modern web security

#### Server Information Hiding
- **Removed Headers**: `X-Powered-By` (completely removed)
- **Modified Headers**: `Server: TradeTally` (generic identifier)
- **Purpose**: Reduces information disclosure to attackers
- **OWASP Status**: ✅ Security through obscurity

## Testing Security Headers

### OWASP Compliance Test Endpoint
Visit `/api/security-test` to verify OWASP-compliant headers:

```json
{
  "message": "Security headers applied",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "headers": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "Not Set (OWASP Recommended)",
    "Content-Security-Policy": "Set",
    "Strict-Transport-Security": "Set (2-year max-age)",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "Set"
  }
}
```

### Browser Developer Tools
1. Open browser developer tools (F12)
2. Navigate to Network tab
3. Make any API request
4. Check response headers in the Headers tab

### Command Line Testing
```bash
curl -I https://your-api-domain.com/api/health
```

Look for security headers in the response.

## Files Modified

1. **`src/server.js`** - Applied security middleware
2. **`src/middleware/security.js`** - New comprehensive security middleware
3. **`.gitignore`** - Enhanced to prevent committing sensitive files

## Security Considerations

### Environment-Specific Configuration
- Development allows WebSocket connections for hot reloading
- Production enforces stricter HSTS settings
- CSP can be set to report-only mode for testing

### API Integration
- Finnhub API (https://api.finnhub.io)
- Alpha Vantage API (https://www.alphavantage.co)  
- Google Gemini AI (https://generativelanguage.googleapis.com)

### Mobile App Compatibility
- CORS configured for mobile origins
- CSP allows necessary resources for hybrid apps

## Monitoring and Maintenance

### CSP Violation Reporting
To enable CSP violation reporting, add a report-uri directive:
```javascript
contentSecurityPolicy: {
  directives: {
    // ... existing directives
    reportUri: '/api/csp-report'
  }
}
```

### Regular Security Audits
- Review CSP directives quarterly
- Monitor for new external dependencies
- Update security headers as needed
- Test with security scanning tools

## OWASP Compliance & Standards

### OWASP Guidelines Implemented
- ✅ **OWASP Top 10 2021** - Protection against injection, broken authentication, XSS
- ✅ **OWASP Secure Headers Project** - All recommended headers implemented
- ✅ **OWASP CSP Guidelines** - Comprehensive Content Security Policy
- ✅ **OWASP HSTS Recommendations** - 2-year max-age with subdomains and preload

### Additional Compliance Benefits
- **PCI DSS** - Enhanced security headers for payment processing
- **SOC 2** - Security controls for SaaS applications
- **NIST Cybersecurity Framework** - Preventive security controls
- **ISO 27001** - Information security management

### OWASP Security Testing
Use these OWASP-recommended tools to validate implementation:
- [Mozilla Observatory](https://observatory.mozilla.org/) - Header analysis
- [OWASP ZAP](https://owasp.org/www-project-zap/) - Security scanning
- [Security Headers](https://securityheaders.com/) - Header validation

## Troubleshooting

### Common CSP Issues
1. **Blocked inline scripts** - Add `'unsafe-inline'` temporarily, then refactor
2. **External resource blocked** - Add domain to appropriate directive
3. **Font loading issues** - Ensure `font-src` includes necessary origins

### Testing CSP
Set `reportOnly: true` in CSP config to monitor violations without blocking:
```javascript
contentSecurityPolicy: {
  reportOnly: true, // Set to false when ready to enforce
  directives: { /* ... */ }
}
```

## OWASP-Compliant Updates Process

### Adding New External Services
1. **Security Review**: Assess service security posture
2. **CSP Updates**: Add to appropriate CSP directives
3. **OWASP Testing**: Validate with Mozilla Observatory
4. **Monitoring**: Deploy with CSP violation monitoring
5. **Documentation**: Update security documentation

### Regular OWASP Compliance Checks
1. **Quarterly Reviews**: Check for new OWASP recommendations
2. **Tool Scans**: Run OWASP ZAP automated scans
3. **Header Validation**: Use SecurityHeaders.com for verification
4. **Vulnerability Assessments**: Follow OWASP Testing Guide

### OWASP Resources for Maintenance
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)

### Implementation Notes
- **CSP Nonces**: Consider replacing 'unsafe-inline' with nonces for better security
- **HSTS Preload**: Only enabled in production to avoid development issues
- **XSS Protection**: Explicitly disabled following latest OWASP guidance
- **Cross-Origin Policies**: Configured for same-site/same-origin restrictions
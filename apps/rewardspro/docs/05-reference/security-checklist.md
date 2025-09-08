# RewardsPro Security Checklist

## Pre-Development Security Checklist

### Environment Setup
- [ ] All dependencies updated to latest secure versions
- [ ] `npm audit` shows no critical/high vulnerabilities
- [ ] TypeScript strict mode enabled
- [ ] ESLint security plugin configured
- [ ] Environment variables properly configured
- [ ] No secrets in code repository
- [ ] Git pre-commit hooks installed

### Development Tools
- [ ] IDE security extensions installed
- [ ] Snyk/dependency scanning enabled
- [ ] Local HTTPS configured for testing
- [ ] Browser DevTools security panel checked

## Development Security Checklist

### Input Validation
- [ ] All user inputs validated with Zod schemas
- [ ] Email addresses validated and normalized
- [ ] Numeric inputs have min/max bounds
- [ ] String inputs have length limits
- [ ] File uploads restricted by type and size
- [ ] GraphQL query depth limited
- [ ] SQL queries use parameterized statements

### Output Encoding
- [ ] User content properly escaped in React
- [ ] No `dangerouslySetInnerHTML` with user data
- [ ] HTML content sanitized with DOMPurify
- [ ] JSON responses properly encoded
- [ ] CSV exports properly escaped
- [ ] URLs validated before rendering

### Authentication & Authorization (CRITICAL - 88% of breaches)

#### Shopify-Specific Requirements
- [ ] **HMAC verification on ALL OAuth endpoints**
- [ ] **Session tokens (JWT) with 1-minute expiry**
- [ ] **Multi-tenant isolation - shop scoping on all queries**
- [ ] **Webhook HMAC validation using timing-safe comparison**
- [ ] **App proxy signature verification**
- [ ] OAuth state parameter for CSRF protection
- [ ] Timestamp validation on OAuth requests (< 60 seconds)
- [ ] Shop domain format validation (/^[a-z0-9-]+\.myshopify\.com$/)
- [ ] Online/offline token management
- [ ] Token exchange implementation for online tokens
- [ ] App uninstall webhook handling

#### General Security Requirements
- [ ] **Tokens stored server-side only (never in client)**
- [ ] **All API routes require session token verification**
- [ ] **Session token claims validation (iss, dest, aud, exp, nbf)**
- [ ] Session tokens encrypted (AES-256-GCM) in database
- [ ] Automatic token refresh before expiry
- [ ] Authentication required on all app routes
- [ ] Server-side route protection (not just client-side)
- [ ] Authorization checks for data access
- [ ] Staff permission handling for online tokens
- [ ] Rate limiting on auth endpoints
- [ ] Audit logging for all auth events

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] TLS 1.3 for data in transit
- [ ] PII properly masked in logs
- [ ] Credit card data tokenized
- [ ] Database connections use SSL
- [ ] Backups encrypted
- [ ] Data retention policies defined

### Session Management
- [ ] Sessions stored securely (Aurora)
- [ ] Session timeout configured
- [ ] Session invalidation on logout
- [ ] Concurrent session handling
- [ ] Session fixation prevention
- [ ] Secure session cookies

### Error Handling
- [ ] Generic error messages to users
- [ ] Detailed errors only in logs
- [ ] Stack traces hidden in production
- [ ] Error boundaries implemented
- [ ] Security errors logged separately
- [ ] No sensitive data in error messages

## API Security Checklist

### Request Validation
- [ ] Content-Type validation
- [ ] Request size limits
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] HTTP methods restricted
- [ ] API versioning implemented

### Response Security
- [ ] Security headers set
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options configured
- [ ] X-XSS-Protection enabled
- [ ] CSP headers implemented
- [ ] HSTS enabled

### GraphQL Specific
- [ ] Query depth limited
- [ ] Query complexity calculated
- [ ] Introspection disabled in production
- [ ] Field-level authorization
- [ ] Query whitelisting
- [ ] Batch query limits

## Database Security Checklist

### Query Security
- [ ] No string concatenation in queries
- [ ] Parameterized queries used
- [ ] Stored procedures where appropriate
- [ ] Query timeouts configured
- [ ] Connection pooling limits
- [ ] Least privilege database users

### Data Security
- [ ] Sensitive columns encrypted
- [ ] Audit logs enabled
- [ ] Regular backups scheduled
- [ ] Backup encryption enabled
- [ ] Data masking in non-production
- [ ] Row-level security configured

## Frontend Security Checklist

### React Components
- [ ] Props validated with TypeScript
- [ ] User input sanitized
- [ ] No inline event handlers with user data
- [ ] External links use rel="noopener noreferrer"
- [ ] URL validation before navigation
- [ ] Form CSRF tokens included

### Browser Security
- [ ] CSP policy configured
- [ ] Trusted Types enabled (if supported)
- [ ] Subresource Integrity (SRI) for CDN
- [ ] Feature Policy configured
- [ ] Secure cookies only
- [ ] SameSite cookie attribute set

### State Management
- [ ] No sensitive data in Redux/Context
- [ ] No tokens in localStorage
- [ ] State properly cleared on logout
- [ ] Immutable state updates
- [ ] No PII in browser storage

## Deployment Security Checklist

### Pre-Deployment
- [ ] Security tests passing
- [ ] SAST scan completed
- [ ] Dependency scan clean
- [ ] Code review completed
- [ ] Security review done
- [ ] Penetration test (if major release)

### Configuration
- [ ] Production secrets rotated
- [ ] Environment variables verified
- [ ] Security headers configured
- [ ] WAF rules updated
- [ ] Rate limiting configured
- [ ] Monitoring alerts set

### Infrastructure
- [ ] HTTPS enforced
- [ ] TLS certificates valid
- [ ] Firewall rules configured
- [ ] Network segmentation
- [ ] DDoS protection enabled
- [ ] Backup strategy confirmed

## Post-Deployment Security Checklist

### Monitoring
- [ ] Security alerts configured
- [ ] Log aggregation working
- [ ] Anomaly detection enabled
- [ ] Performance monitoring
- [ ] Error tracking active
- [ ] Audit logs reviewed

### Validation
- [ ] Security headers verified
- [ ] CSP violations monitored
- [ ] Authentication flows tested
- [ ] Rate limiting verified
- [ ] SSL/TLS configuration checked
- [ ] OWASP ZAP scan run

### Documentation
- [ ] Security documentation updated
- [ ] Incident response plan current
- [ ] Contact list updated
- [ ] Runbooks current
- [ ] Compliance docs updated
- [ ] Training materials updated

## Incident Response Checklist

### Detection
- [ ] Incident verified (not false positive)
- [ ] Severity determined (SEV-1 to SEV-4)
- [ ] Affected systems identified
- [ ] Timeline documented
- [ ] Response team activated
- [ ] Communication channel created

### Containment
- [ ] Immediate threats contained
- [ ] Affected accounts frozen
- [ ] Suspicious IPs blocked
- [ ] Vulnerable endpoints disabled
- [ ] Evidence preserved
- [ ] Legal notified (if required)

### Eradication
- [ ] Root cause identified
- [ ] Vulnerability patched
- [ ] Malicious content removed
- [ ] System hardened
- [ ] Security controls updated
- [ ] Tests updated

### Recovery
- [ ] Systems restored
- [ ] Data integrity verified
- [ ] Monitoring enhanced
- [ ] Normal operations resumed
- [ ] Performance validated
- [ ] User communication sent

### Post-Incident
- [ ] Incident report written
- [ ] Lessons learned documented
- [ ] Action items assigned
- [ ] Timeline reviewed
- [ ] Training needs identified
- [ ] Process improvements made

## Compliance Checklist

### GDPR
- [ ] Privacy policy updated
- [ ] Data processing agreements
- [ ] Consent mechanisms
- [ ] Right to deletion implemented
- [ ] Data portability available
- [ ] Breach notification ready

### PCI DSS
- [ ] No card data stored
- [ ] Tokenization implemented
- [ ] Network segmentation
- [ ] Access controls
- [ ] Audit logging
- [ ] Vulnerability scanning

### Shopify Requirements
- [ ] App review guidelines met
- [ ] OAuth properly implemented
- [ ] Webhook validation
- [ ] API rate limits respected
- [ ] Data usage documented
- [ ] Privacy compliance

## Security Maintenance Checklist

### Daily
- [ ] Security alerts reviewed
- [ ] Failed auth attempts checked
- [ ] Error logs reviewed
- [ ] Rate limit violations checked
- [ ] WAF blocks reviewed

### Weekly
- [ ] Dependency updates checked
- [ ] Security patches reviewed
- [ ] Audit logs analyzed
- [ ] Metrics reviewed
- [ ] Incident tickets reviewed

### Monthly
- [ ] Security scan run
- [ ] Penetration test (if applicable)
- [ ] Access review conducted
- [ ] Documentation updated
- [ ] Training conducted
- [ ] Compliance check

### Quarterly
- [ ] Full security audit
- [ ] Incident response drill
- [ ] Policy review
- [ ] Vendor assessment
- [ ] Risk assessment update
- [ ] Security roadmap review

## Quick Security Commands

```bash
# Check for vulnerabilities
npm audit
npm run security:check

# Run security tests
npm run test:security

# Update dependencies
npm update
npm audit fix

# Run SAST scan
npm run lint:security
npx semgrep --config=.semgrep.yml

# Check TypeScript
npm run typecheck

# Build with security checks
npm run build:secure
```

## Security Resources

### Documentation
- [Security Overview](../08-security/01-security-overview.md)
- [Injection Prevention](../08-security/02-injection-prevention.md)
- [Security Testing](../08-security/03-security-testing.md)
- [Security Tools](../08-security/04-security-tools.md)
- [React Security](../08-security/05-react-security-patterns.md)
- [Incident Response](../08-security/06-incident-response.md)

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Shopify App Security](https://shopify.dev/apps/auth/security)
- [React Security Guide](https://react.dev/learn/security)
- [TypeScript Security](https://www.typescriptlang.org/docs/handbook/security.html)

### Contacts
- Security Team: security@rewardspro.app
- Incident Response: incident@rewardspro.app
- Shopify Security: security@shopify.com

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*
*This checklist should be reviewed before every deployment*
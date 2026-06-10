# Security Checklist (Quick Reference)

> Quick pre-deployment checklist. For the full detailed checklist, see [Checklist](../08-security/checklist.md).

---

## Critical (Must Have)

### Authentication

- [ ] All routes use `authenticate.admin(request)`
- [ ] Session tokens validated (1-minute expiry)
- [ ] HMAC verification on all webhooks
- [ ] Shop domain format validated
- [ ] No tokens in localStorage

### Database

- [ ] Every query includes `shop: session.shop`
- [ ] Parameterized queries only (no string concat)
- [ ] Input validated with Zod schemas

### Headers

- [ ] CSP configured for Shopify iframe
- [ ] X-Frame-Options set
- [ ] HSTS enabled (production)

---

## Important (Should Have)

- [ ] Rate limiting on API endpoints
- [ ] Generic error messages to users
- [ ] Security event logging
- [ ] Input sanitized with DOMPurify

---

## Before Deploy

```bash
# Run these checks
npm audit --audit-level=moderate
npm run typecheck
npm run lint
```

---

## Full Checklist

For comprehensive security audit, see:

- [Checklist](../08-security/checklist.md) - Detailed checklist with code review items
- [Security Patterns](../08-security/security-patterns.md) - Copy-paste security patterns

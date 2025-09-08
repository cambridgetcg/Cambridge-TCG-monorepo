# Security Documentation

> **⚠️ IMPORTANT**: This directory contains sensitive security documentation. Ensure it's in .gitignore.

## ⚡ Quick Start

**NEW:** **[SECURITY-QUICK-GUIDE.md](./SECURITY-QUICK-GUIDE.md)** - Copy-paste security patterns and quick reference

## 📚 Documentation Structure

- **[00-SECURITY-INDEX.md](./00-SECURITY-INDEX.md)** - Complete documentation index with visual navigation
- **[SECURITY-QUICK-GUIDE.md](./SECURITY-QUICK-GUIDE.md)** - Quick implementation patterns (START HERE!)

## 🚨 The 7 Security Commandments

```typescript
1. ✅ EVERY route: await authenticate.admin(request)
2. ✅ EVERY query: where: { shop: session.shop }
3. ✅ EVERY webhook: verifyWebhookHMAC(request, rawBody)
4. ✅ NEVER trust: client-supplied shop domain
5. ✅ NEVER store: tokens in localStorage
6. ✅ ALWAYS use: 1-minute session tokens
7. ✅ ALWAYS validate: /^[a-z0-9-]+\.myshopify\.com$/
```

## 📋 Implementation Path

### For Developers (Start Here)
1. **[SECURITY-QUICK-GUIDE.md](./SECURITY-QUICK-GUIDE.md)** - Copy-paste patterns
2. **[07-authentication-security.md](./07-authentication-security.md)** - Auth deep dive (88% of breaches!)
3. **[11-implementation-checklist.md](./11-implementation-checklist.md)** - Pre-deploy checklist

### For Security Review
1. **[11-implementation-checklist.md](./11-implementation-checklist.md)** - Security audit checklist
2. **[12-implementation-guide.md](./12-implementation-guide.md)** - Complete implementation
3. **[03-security-testing.md](./03-security-testing.md)** - Testing methodology

## 🔐 Current Security Status

### Critical Vulnerabilities
- **CVE-2025-29927**: Update Next.js to 14.2.25+ or 15.2.3+
- **Container Security**: 87% of production containers have vulnerabilities
- **NPM Supply Chain**: Audit all dependencies regularly

### Quick Checklist
- [ ] All routes authenticated
- [ ] Database queries scoped
- [ ] HMAC verification enabled
- [ ] No client-side token storage
- [ ] Environment variables secured
- [ ] Dependencies scanned
- [ ] CSP headers configured

---

For detailed documentation, security patterns, and implementation guides, see [00-SECURITY-INDEX.md](./00-SECURITY-INDEX.md)
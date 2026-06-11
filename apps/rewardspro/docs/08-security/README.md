# Security

> Security guides for building secure Shopify applications. 88% of breaches are authentication-related.

---

## Quick Start

{% hint style="danger" %}
**Critical:** Read [Authentication](./authentication.md) before writing any code.
{% endhint %}

| Your goal | Start here |
|-----------|------------|
| Copy-paste security code | [Security Patterns](./security-patterns.md) |
| Understand authentication | [Authentication](./authentication.md) |
| Shopify-specific patterns | [Shopify Auth](./shopify-auth.md) |
| Pre-deployment checklist | [Checklist](./checklist.md) |

---

## Documentation

### Core

| Page | Description |
|------|-------------|
| [Security Patterns](./security-patterns.md) | Copy-paste code (start here) |
| [Authentication](./authentication.md) | Auth deep dive (must read) |
| [Shopify Auth](./shopify-auth.md) | Shopify-specific patterns |

### Implementation

| Page | Description |
|------|-------------|
| [Checklist](./checklist.md) | Pre-deploy security audit |
| [Implementation Guide](./12-implementation-guide.md) | Step-by-step guide |
| [Environment Config](./13-environment-configurations.md) | Secure env setup |

### Prevention

| Page | Description |
|------|-------------|
| [Injection Prevention](./02-injection-prevention.md) | SQL, XSS prevention |
| [React Security](./05-react-security-patterns.md) | Frontend security |
| [Data Exposure](./10-data-exposure-prevention.md) | Preventing leaks |

### Response

| Page | Description |
|------|-------------|
| [Security Testing](./03-security-testing.md) | Testing methodology |
| [Incident Response](./06-incident-response.md) | Handling breaches |

---

## Pre-Deploy Checklist

- [ ] All routes use `authenticate.admin(request)`
- [ ] All queries include `shop: session.shop`
- [ ] All webhooks verify HMAC
- [ ] No tokens in localStorage
- [ ] CSP headers configured

Full checklist: [Checklist](./checklist.md)

---

## Related Pages

- [Security Checklist (Quick)](../05-reference/security-checklist.md)
- [Security Headers](../05-reference/security-headers.md)

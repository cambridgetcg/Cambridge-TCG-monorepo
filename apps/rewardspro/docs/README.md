# RewardsPro Documentation

> Complete documentation for building, deploying, and maintaining the RewardsPro Shopify loyalty app.

---

## Quick Start

| I want to... | Go to... |
|--------------|----------|
| Set up my environment | [Local Setup](./01-getting-started/local-setup.md) |
| Understand the architecture | [Architecture](./01-getting-started/architecture.md) |
| Deploy to production | [Deployment](./03-deployment/deployment.md) |
| Copy security code patterns | [Security Patterns](./08-security/security-patterns.md) |
| Fix a common issue | [Troubleshooting](./06-troubleshooting/01-common-issues.md) |

{% hint style="warning" %}
**Security First:** Read [Authentication](./08-security/authentication.md) before writing code.
{% endhint %}

---

## Essential Security Rules

| Rule | Requirement |
|------|-------------|
| Every route | Must call `authenticate.admin(request)` |
| Every database query | Must include `shop: session.shop` |
| Every webhook | Must verify HMAC before processing |

For copy-paste code patterns, see [Security Patterns](./08-security/security-patterns.md).

---

## Documentation

### Setup

Getting started and environment setup.

| Page | Description |
|------|-------------|
| [Architecture](./01-getting-started/architecture.md) | System design and tech stack |
| [Local Setup](./01-getting-started/local-setup.md) | Development environment |
| [Node Requirements](./01-getting-started/03-node-version-requirements.md) | Node.js version |

### Guides

Development patterns and best practices.

| Page | Description |
|------|-------------|
| [Database](./02-development/database.md) | Prisma, queries, migrations |
| [TypeScript Patterns](./02-development/02-typescript-remix-patterns.md) | Remix patterns |
| [Webhooks](./02-development/webhook-best-practices.md) | Webhook implementation |
| [Performance](./02-development/04-performance-optimization.md) | Optimization techniques |
| [GraphQL](./02-development/shopify-graphql-api-guide.md) | Shopify API usage |

### Deploy

Deployment and infrastructure.

| Page | Description |
|------|-------------|
| [Deployment](./03-deployment/deployment.md) | Full deployment process |
| [Vercel Setup](./03-deployment/02-vercel-environment-setup.md) | Vercel configuration |
| [AWS Aurora](./03-deployment/aws-aurora-data-api-guide.md) | Database setup |
| [Deploy Checklist](./03-deployment/deployment-checklist.md) | Pre-deploy verification |

### Design

UI components and Polaris patterns.

| Page | Description |
|------|-------------|
| [Polaris Overview](./04-ui-components/01-polaris-overview.md) | Design system intro |
| [RewardsPro Patterns](./04-ui-components/rewardspro-patterns.md) | App-specific UI |
| [Forms](./04-ui-components/03-forms-guide.md) | Form implementation |
| [Design Tokens](./04-ui-components/09-design-tokens.md) | Styling reference |

### Reference

Quick lookup documentation.

| Page | Description |
|------|-------------|
| [Prisma Schema](./05-reference/prisma-schema-reference.md) | Database models |
| [Routes](./05-reference/APP_ROUTES_REFERENCE.md) | All app routes |
| [Components](./05-reference/COMPONENTS_REFERENCE.md) | Component reference |
| [Security Checklist](./05-reference/security-checklist.md) | Quick security check |

### Security

Authentication, authorization, and protection.

| Page | Description |
|------|-------------|
| [Security Patterns](./08-security/security-patterns.md) | Copy-paste code |
| [Authentication](./08-security/authentication.md) | Auth deep dive |
| [Shopify Auth](./08-security/shopify-auth.md) | Shopify-specific |
| [Pre-Deploy Checklist](./08-security/checklist.md) | Full audit |

### Troubleshooting

Debugging and issue resolution.

| Page | Description |
|------|-------------|
| [Common Issues](./06-troubleshooting/01-common-issues.md) | Frequent problems |
| [Debug Guide](./06-troubleshooting/02-debug-communications.md) | API debugging |

### Roadmap

Planned features and improvements.

| Page | Description |
|------|-------------|
| [Feature Status](./09-project-management/FEATURE_STATUS.md) | Completion tracking |
| [Implementation Roadmap](./09-project-management/IMPLEMENTATION_ROADMAP.md) | Development phases |
| [Changelog](./09-project-management/CHANGELOG.md) | Version history |

---

## Learning Paths

### Day 1

1. [Architecture](./01-getting-started/architecture.md)
2. [Local Setup](./01-getting-started/local-setup.md)
3. [Authentication](./08-security/authentication.md)

### Building Features

1. [Security Patterns](./08-security/security-patterns.md)
2. [Database](./02-development/database.md)
3. [Polaris Overview](./04-ui-components/01-polaris-overview.md)

### Before Deploying

1. [Security Checklist](./05-reference/security-checklist.md)
2. [Deploy Checklist](./03-deployment/deployment-checklist.md)
3. [Deployment](./03-deployment/deployment.md)

---

## Frequently Asked Questions

### Where do I find code examples?

Most guides include examples. For security code, see [Security Patterns](./08-security/security-patterns.md). For comprehensive patterns, see [CLAUDE.md](../CLAUDE.md).

### What should I read before deploying?

Complete [Security Checklist](./05-reference/security-checklist.md) and [Deploy Checklist](./03-deployment/deployment-checklist.md).

### How do I report a documentation issue?

Update docs directly. Follow [GitBook Style Guide](./GITBOOK_STYLE_GUIDE.md).

---

## External Resources

- [Shopify Polaris](https://polaris.shopify.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [Remix Docs](https://remix.run/docs)

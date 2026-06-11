# RewardsPro Documentation

> Complete documentation for building, deploying, and maintaining the RewardsPro Shopify loyalty app.

---

## Quick Start

| I want to... | Go to... |
|--------------|----------|
| Understand the system | [CLAUDE.md](../CLAUDE.md) (AI context) |
| Learn the tier system | [Tier System](./01-architecture/tier-system.md) |
| Set up my environment | [Node Requirements](./01-getting-started/03-node-version-requirements.md) |
| Write TypeScript code | [TypeScript Guide](./02-development/typescript-guide.md) |
| Deploy to production | [Deployment Guide](./03-deployment/deployment-guide.md) |
| Fix a security issue | [Security Hub](./05-security/README.md) |
| Debug a problem | [Troubleshooting](./06-troubleshooting/01-common-issues.md) |

---

## Essential Rules

| Rule | Requirement |
|------|-------------|
| Every route | Must call `authenticate.admin(request)` |
| Every database query | Must include `shop: session.shop` |
| Every webhook | Must verify HMAC before processing |

For copy-paste patterns, see [CLAUDE.md](../CLAUDE.md) or [Security Hub](./05-security/README.md).

---

## Documentation Index

### 01 - Architecture

System design and core concepts.

| Page | Description |
|------|-------------|
| [Tier System](./01-architecture/tier-system.md) | Tier purchase flow, resolution, debugging |

### 02 - Development

Development patterns and best practices.

| Page | Description |
|------|-------------|
| [TypeScript Guide](./02-development/typescript-guide.md) | Unified TypeScript + Remix + Shopify patterns |
| [Performance](./02-development/04-performance-optimization.md) | Optimization techniques |
| [Responsive Design](./02-development/05-responsive-design.md) | Polaris responsive patterns |
| [Testing Guide](./02-development/06-testing-guide.md) | Unit, integration, E2E testing |
| [API Integration](./02-development/07-api-data-sync.md) | Customer sync, data flow |
| [GraphQL API](./02-development/shopify-graphql-api-guide.md) | Shopify API reference |
| [Webhooks](./02-development/webhook-best-practices.md) | Webhook implementation |

### 03 - Deployment

Deployment and infrastructure.

| Page | Description |
|------|-------------|
| [Deployment Guide](./03-deployment/deployment-guide.md) | Vercel + Aurora deployment |
| [AWS IAM](./03-deployment/05-aws-iam-configuration.md) | IAM setup for Data API |
| [Checklist](./03-deployment/deployment-checklist.md) | Pre-deploy verification |

### 04 - UI Components

UI patterns and Polaris components.

| Page | Description |
|------|-------------|
| [Component Overview](./04-ui-components/README.md) | Polaris patterns, design tokens |

### 05 - Security

Security audits and patterns.

| Page | Description |
|------|-------------|
| [Security Hub](./05-security/README.md) | Central security reference |
| [General Audit](./05-security/general-audit.md) | Overall security findings |
| [Merchant Audit](./05-security/merchant-audit.md) | Admin user security |
| [Customer Audit](./05-security/customer-audit.md) | End-user security |

### 06 - Troubleshooting

Debugging and issue resolution.

| Page | Description |
|------|-------------|
| [Common Issues](./06-troubleshooting/01-common-issues.md) | Frequent problems |
| [Debug Guide](./06-troubleshooting/02-debug-communications.md) | API debugging |

### 07 - Roadmap

Planned features and improvements.

| Page | Description |
|------|-------------|
| [Analytics Plan](./09-project-management/ANALYTICS_IMPLEMENTATION_PLAN.md) | Analytics expansion |
| [Onboarding Plan](./09-project-management/ONBOARDING_IMPLEMENTATION_GUIDE.md) | User onboarding |

---

## Learning Paths

### Day 1 - Getting Started

1. Read [CLAUDE.md](../CLAUDE.md) for system overview
2. Review [Tier System](./01-architecture/tier-system.md) for core concepts
3. Check [TypeScript Guide](./02-development/typescript-guide.md) for patterns

### Building Features

1. [TypeScript Guide](./02-development/typescript-guide.md) - Coding patterns
2. [Security Hub](./05-security/README.md) - Required security patterns
3. [Testing Guide](./02-development/06-testing-guide.md) - Testing approach

### Before Deploying

1. [Security Hub](./05-security/README.md) - Security checklist
2. [Deployment Guide](./03-deployment/deployment-guide.md) - Deployment process
3. [Checklist](./03-deployment/deployment-checklist.md) - Pre-deploy verification

---

## File Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Server-only | `*.server.ts` | `tier-resolution.server.ts` |
| Route | `app.{name}.tsx` | `app.customers.tsx` |
| API route | `api.{name}.tsx` | `api.customer-lookup.tsx` |
| Webhook | `webhooks.{topic}.tsx` | `webhooks.orders.paid.tsx` |

---

## External Resources

- [Shopify Polaris](https://polaris.shopify.com)
- [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix)
- [Prisma Docs](https://prisma.io/docs)
- [Remix Docs](https://remix.run/docs)

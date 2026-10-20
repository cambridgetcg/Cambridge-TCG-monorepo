# RewardsPro

## Understanding without commercial targets

From 2026-09-23, this project has no KPI, revenue, conversion, growth or
commercialisation requirement. Understanding and exploration are sufficient.
New paid RewardsPro subscriptions and paid plan changes are retired. Existing
agreements retain their records, cancellation, refund and support paths; this
decision does not rewrite their entitlements or cancel them automatically.


A loyalty and rewards platform built with Remix, TypeScript, Prisma, and Postgres
(Supabase). Shopify is the production commerce connector today; the platform is
being separated from Shopify-specific authentication, billing, delivery, and
storefront surfaces so additional connectors can follow.

The source-controlled public site for `rewardspro.io` lives in
[`landing/public`](./landing/public). The platform expansion decision and
truthful connector statuses are recorded in
[`../../docs/decisions/2026-07-23-rewardspro-platform.md`](../../docs/decisions/2026-07-23-rewardspro-platform.md).

## Features

- **Tier System**: Automatic customer tier assignment based on spending, purchases, or subscriptions
- **Store Credit**: Cashback rewards deposited as Shopify store credit
- **Points System**: Earn and redeem points for rewards
- **Tier Products**: Sell membership tiers as Shopify products
- **Analytics**: Customer retention, lifetime value, and engagement metrics
- **Integrations**: Klaviyo, SendGrid email marketing support

## Quick Start

### Prerequisites

- Node.js 20+ (LTS)
- Shopify Partner Account
- Test/Development Store

### Setup

```bash
# Install dependencies
npm install

# Start development
npm run dev
```

Press `P` to open your app in the Shopify admin.

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](./CLAUDE.md) | AI context and quick reference |
| [docs/README.md](./docs/README.md) | Complete documentation index |
| [docs/01-architecture/tier-system.md](./docs/01-architecture/tier-system.md) | Tier system architecture |
| [docs/02-development/typescript-guide.md](./docs/02-development/typescript-guide.md) | TypeScript patterns |
| [DEPLOY.md](./DEPLOY.md) | Deployment guide |
| [docs/DATABASE.md](./docs/DATABASE.md) | Database: connections, TLS, migrations, deploy order |
| [docs/05-security/README.md](./docs/05-security/README.md) | Security documentation |

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Remix |
| **Language** | TypeScript |
| **Database** | PostgreSQL 17 (Supabase) |
| **ORM** | Prisma |
| **Hosting** | Vercel |
| **UI** | Shopify Polaris |
| **Commerce connector** | Shopify GraphQL (2026-01) |

## Project Structure

```
app/
├── routes/           # Remix routes (loaders + actions)
│   ├── app.*.tsx     # Protected admin routes
│   ├── api.*.tsx     # API endpoints
│   └── webhooks.*.tsx # Shopify webhooks
├── services/         # Business logic (*.server.ts)
├── components/       # React/Polaris components
├── hooks/            # Custom React hooks
└── utils/            # Shared utilities

docs/
├── 01-architecture/  # System design
├── 02-development/   # Development patterns
├── DATABASE.md       # Database: connections, TLS, migrations
├── 04-ui-components/ # UI patterns
├── 05-security/      # Security documentation
├── 06-troubleshooting/ # Debug guides
└── 07-roadmap/       # Future features

extensions/
└── theme-app-extension-rewardspro/  # Theme widgets
```

## Critical Rules

```typescript
// EVERY account-data route must authenticate or fail closed
const { admin, session } = await authenticate.admin(request);

// EVERY database query must scope to shop
const data = await db.model.findMany({ where: { shop: session.shop } });

// EVERY webhook must verify its provider signature before persistence or fail closed
const verified = await verifyHmac(rawBody, hmacHeader, secret);
```

## Deployment

- **Database**: Postgres on Supabase through the Supavisor pooler, with TLS
  verified against the bundled Supabase root CA; migrations are an explicit
  deploy step. See [docs/DATABASE.md](./docs/DATABASE.md).
- **Public health**: `/api/health` answers 200 only when a bounded `SELECT 1`
  succeeds, 503 otherwise
- **Operator readiness**: `/api/operator/readiness` performs the same
  read-only database probe, authenticated with the exact `CRON_SECRET` Bearer
  credential
- **Local**: Postgres 17 on loopback; `test:postgres` runs the integration
  suites against it

See the [Deployment Guide](./DEPLOY.md) for details.

## License

MIT

## Resources

- [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix)
- [Shopify Polaris](https://polaris.shopify.com)
- [Remix Docs](https://remix.run/docs)
- [Prisma Docs](https://prisma.io/docs)

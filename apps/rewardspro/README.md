# RewardsPro

A Shopify loyalty and rewards app built with Remix, TypeScript, Prisma, and Aurora Serverless.

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
| [docs/03-deployment/deployment-guide.md](./docs/03-deployment/deployment-guide.md) | Deployment guide |
| [docs/05-security/README.md](./docs/05-security/README.md) | Security documentation |

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Remix |
| **Language** | TypeScript |
| **Database** | PostgreSQL (Aurora Serverless) |
| **ORM** | Prisma |
| **Hosting** | Vercel |
| **UI** | Shopify Polaris |
| **API** | Shopify GraphQL (2025-07) |

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
├── 03-deployment/    # Deployment guides
├── 04-ui-components/ # UI patterns
├── 05-security/      # Security documentation
├── 06-troubleshooting/ # Debug guides
└── 07-roadmap/       # Future features

extensions/
├── rewards-pro-membership/  # Customer account UI extension
└── theme-app-extension-rewardspro/  # Theme widgets
```

## Critical Rules

```typescript
// EVERY route must authenticate
const { admin, session } = await authenticate.admin(request);

// EVERY database query must scope to shop
const data = await db.model.findMany({ where: { shop: session.shop } });

// EVERY webhook must verify HMAC
const verified = await verifyHmac(rawBody, hmacHeader, secret);
```

## Deployment

- **Production**: Direct database connection via Vercel
- **Preview**: Aurora Data API (zero connections)
- **Local**: Direct connection or Data API

See [Deployment Guide](./docs/03-deployment/deployment-guide.md) for details.

## License

MIT

## Resources

- [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix)
- [Shopify Polaris](https://polaris.shopify.com)
- [Remix Docs](https://remix.run/docs)
- [Prisma Docs](https://prisma.io/docs)

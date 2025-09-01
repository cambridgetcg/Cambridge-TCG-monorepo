# RewardsPro - Shopify Rewards & Loyalty App

## 🎯 Project Overview
RewardsPro is a Shopify app that manages customer rewards, loyalty tiers, and store credit. Built with Remix, Prisma, and PostgreSQL, it provides merchants with a comprehensive loyalty program system.

## 🏗️ Architecture

### Tech Stack
- **Framework**: Remix v2.16+ with Vite
- **Database**: PostgreSQL (AWS Aurora Serverless with Data API)
- **ORM**: Prisma v6.15+ with custom Data API adapter
- **UI**: Shopify Polaris v12
- **Authentication**: Shopify App Bridge
- **Session Storage**: Prisma-based sessions
- **Deployment**: Vercel with environment-based connection routing
- **Connection Management**: 
  - Production: Direct connection (5 max)
  - Preview: Aurora Data API (0 connections)
  - Development: Local direct connection

### Key Dependencies
- `@shopify/shopify-app-remix`: Core Shopify app functionality
- `@shopify/app-bridge-react`: Embedded app authentication
- `@shopify/polaris`: Shopify design system
- `@prisma/client`: Database ORM client

## 📁 Project Structure

```
/rewardspro-production
├── /app                    # Remix application code
│   ├── /routes            # Page routes and API endpoints
│   ├── /components        # Reusable React components
│   ├── shopify.server.ts  # Shopify app configuration
│   ├── db.server.ts       # Prisma database client
│   ├── root.tsx           # Root application component
│   └── entry.server.tsx   # Server entry point
├── /prisma                # Database schema and migrations
│   ├── schema.prisma      # Database models
│   └── /migrations        # Database migration history
├── /extensions            # Shopify app extensions
├── /public               # Static assets
├── /.shopify             # Shopify CLI configuration
├── /.vercel              # Vercel deployment config
└── package.json          # Dependencies and scripts
```

## 🗄️ Database Schema

### Core Models
- **Session**: Shopify session management
- **ShopSettings**: Store configuration and preferences
- **Tier**: Loyalty tier definitions with cashback rates
- **Customer**: Customer profiles with store credit balances
- **StoreCreditLedger**: Transaction history for store credit
- **TierChangeLog**: Audit trail for tier changes

### Key Relationships
- Customers belong to Tiers
- Customers have many StoreCreditLedger entries
- Customers have many TierChangeLog entries
- Tiers belong to Shops

## 🛣️ Routes & Endpoints

### App Routes
- `/app` - Main app layout wrapper
- `/app/_index` - Dashboard/home page
- `/app/customers` - Customer management
- `/app/tiers` - Tier configuration

### Auth Routes
- `/auth/login` - OAuth authentication flow
- `/auth/$` - Auth callback handler

### Webhook Routes
- `/webhooks/orders.paid` - Process paid orders
- `/webhooks/app.uninstalled` - Clean up on uninstall
- `/webhooks/shop.update` - Shop data updates
- `/webhooks/compliance` - GDPR compliance

### API Routes
- `/api/test-session` - Session testing endpoint

## 🔧 Commands

### Development
```bash
npm run dev              # Start development server (uses Shopify CLI)
```

### Database
```bash
npx prisma generate      # Generate Prisma client
npx prisma db pull       # Pull schema from database
npx prisma migrate dev   # Create and apply migrations (dev)
npx prisma migrate deploy # Deploy migrations (production)
```

### Build & Deploy
```bash
npm run build           # Build for production
npm run build:migrate   # Build with migrations
npm run deploy          # Deploy to Shopify
```

### Testing & Linting
```bash
npm run lint            # Run ESLint
npm run typecheck       # TypeScript type checking
```

## 🔐 Environment Variables

Required environment variables vary by deployment environment:

### Production Environment
```env
# Database connections
DATABASE_URL=           # Direct connection URL with encoded password
DIRECT_URL=            # Same as DATABASE_URL for migrations

# Aurora Data API (fallback)
AURORA_RESOURCE_ARN=   # Aurora cluster ARN
AURORA_SECRET_ARN=     # Secrets Manager ARN
AURORA_DATABASE_NAME=  # Database name

# AWS Credentials
AWS_ACCESS_KEY_ID=     # IAM access key
AWS_SECRET_ACCESS_KEY= # IAM secret key
AWS_REGION=           # AWS region (eu-north-1)

# Shopify configuration
SHOPIFY_API_KEY=       # App API key
SHOPIFY_API_SECRET=    # App API secret
SCOPES=                # Required OAuth scopes
SHOPIFY_APP_URL=       # App URL
```

### Preview Environment
```env
# NO DATABASE_URL! Forces Data API usage

# Aurora Data API (required)
AURORA_RESOURCE_ARN=   # Aurora cluster ARN
AURORA_SECRET_ARN=     # Secrets Manager ARN
AURORA_DATABASE_NAME=  # Database name

# AWS Credentials
AWS_ACCESS_KEY_ID=     # IAM access key
AWS_SECRET_ACCESS_KEY= # IAM secret key
AWS_REGION=           # AWS region

# Connection override
FORCE_DATA_API=true    # Force Data API usage

# Shopify configuration
SHOPIFY_API_KEY=       # App API key
SHOPIFY_API_SECRET=    # App API secret
SCOPES=                # Required OAuth scopes
```

## 🚀 Deployment

### Vercel Deployment
- Build command: `npm run build:migrate`
- Output directory: `build`
- Install command: `npm install`

### Database Setup
1. AWS Aurora Serverless v2 PostgreSQL cluster
2. Connection strategy by environment:
   - **Production**: Direct connection via DATABASE_URL (5 connections max)
   - **Preview**: Aurora Data API (0 connections, prevents exhaustion)
   - **Development**: Local PostgreSQL or Data API
3. Automatic environment detection via VERCEL_ENV
4. Use `DIRECT_URL` for migrations
5. Connection routing handled by `app/utils/connection-strategy.ts`

## 🏪 Shopify Integration

### OAuth Scopes Required
- `read_products`
- `write_products`
- `read_customers`
- `write_customers`
- `read_orders`

### Webhooks
- `ORDERS_PAID` - Process cashback on paid orders
- `APP_UNINSTALLED` - Cleanup on uninstall
- `SHOP_UPDATE` - Update shop settings
- `COMPLIANCE_WEBHOOKS` - GDPR compliance

## 🎯 Core Features

### Tier Management
- Create and manage loyalty tiers
- Set minimum spend thresholds
- Configure cashback percentages
- Annual or lifetime evaluation periods

### Customer Management
- Track customer spending
- Manage store credit balances
- View tier progression
- Transaction history

### Store Credit System
- Automatic cashback calculation
- Credit ledger with full audit trail
- Manual adjustments support
- Refund handling

## 📝 Development Notes

### Session Storage
- Sessions stored in PostgreSQL via Prisma
- Automatic session cleanup on app uninstall
- Support for online and offline access tokens

### Error Handling
- Global error boundary in `/app/components/ErrorBoundary.tsx`
- Webhook error logging
- Database transaction rollback support

### Performance Considerations
- Database indexes on frequently queried fields
- Efficient pagination for customer lists
- Optimistic UI updates where applicable

## 🔍 Debugging

### Common Issues
1. **Database Connection**: Check `DATABASE_URL` and network access
2. **Session Errors**: Verify Shopify API credentials
3. **Webhook Failures**: Check webhook URLs and HMAC validation

### Useful Commands
```bash
# Check database connection
npx prisma db pull

# View recent migrations
npx prisma migrate status

# Reset database (development only)
npx prisma migrate reset
```

## 📚 Additional Resources
- [Shopify App Development](https://shopify.dev/docs/apps)
- [Remix Documentation](https://remix.run/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Polaris Components](https://polaris.shopify.com)
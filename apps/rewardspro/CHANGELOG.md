# RewardsPro Changelog

All notable changes to the RewardsPro application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🚧 In Progress
- Order processing webhook (webhooks.orders.paid.tsx) - partially implemented
- AWS Aurora Serverless database migration

### ✅ Completed (as of 2025-09-01)

#### Database Layer
- Complete Prisma schema with all models defined
- Session management table for Shopify OAuth
- ShopSettings model for store configuration
- Tier model for loyalty program levels
- Customer model with store credit tracking
- StoreCreditLedger for transaction history
- TierChangeLog for audit trail
- All necessary enums (Currency, EvaluationPeriod, LedgerEntryType, etc.)
- Database indexes for performance optimization

#### Authentication & Core Setup
- Shopify OAuth authentication flow
- Session storage using Prisma
- Remix app structure with Vite
- Vercel deployment configuration
- Environment variable setup

#### Features Implemented
- **Tier Management Page (app.tiers.tsx)**
  - Full CRUD operations for tiers
  - Create new tiers with name, minimum spend, cashback %, and evaluation period
  - Edit existing tiers
  - Delete tiers with confirmation
  - Input validation and error handling
  - Rate limiting protection
  - Unique tier ID generation (format: storename-tiername)

- **Customer List Page (app.customers.tsx)**
  - Display all customers with pagination (50 per page)
  - Show customer email, ID, current tier, and store credit balance
  - Search by email or customer ID
  - Filter by tier (All, No Tier, or specific tier)
  - Responsive design (table for desktop, cards for mobile)
  - Empty state handling
  - Tier badge color coding based on cashback percentage

#### Webhook Infrastructure
- App uninstalled webhook handler
- Shop update webhook handler
- Compliance webhooks (GDPR)
- Scopes update webhook
- Orders paid webhook (partially implemented)

#### Development Infrastructure
- Comprehensive CLAUDE.md documentation files
- Project structure documentation
- Route documentation
- Component guidelines
- Database schema documentation

### 🐛 Known Issues
- Orders paid webhook incomplete (cuts off at line 100)
- No actual Shopify customer data sync
- Customer detail pages return 404
- Store settings not accessible via UI

---

## [0.1.0] - 2025-08-29

### Added
- Initial project setup from Shopify Remix template
- Basic project structure
- Deployment to Vercel
- Database connection setup

### Changed
- Modified template to create RewardsPro application
- Updated package.json with project name

### Security
- Added environment variables for secure configuration
- Implemented HMAC validation for webhooks

---

## Template History

For the original Shopify template changelog, see [CHANGELOG-template.md](./CHANGELOG-template.md)
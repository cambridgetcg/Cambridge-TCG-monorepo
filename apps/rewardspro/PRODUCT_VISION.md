# RewardsPro: Product Vision & Roadmap

> **Last Updated**: July 2026
> **Status**: Living Document

## Executive Summary

RewardsPro is becoming a **commerce-independent loyalty platform**—a system
that transforms customer relationships through intelligent rewards,
personalized engagement, and measurable ROI. Shopify is the only production,
self-serve commerce connector today and becomes the reference connector rather
than the permanent product boundary.

The expansion is a direction, not a shipped-feature claim. WooCommerce is
planned as the first full non-Shopify connector, the headless API is in design,
and Stripe/POS connections are exploratory. The decision and migration shape
are recorded in
[`../../docs/decisions/2026-07-23-rewardspro-platform.md`](../../docs/decisions/2026-07-23-rewardspro-platform.md).

This document outlines both **implemented features** and **future vision**
organized into strategic pillars.

### Implementation Status Legend

| Status | Meaning |
|--------|---------|
| ✅ **LIVE** | Production-ready, actively used |
| 🔨 **PARTIAL** | Core functionality exists, enhancements planned |
| 📋 **PLANNED** | Designed, prioritized for development |
| 💡 **VISION** | Future direction, not yet scheduled |

---

## Current Product Overview

### Current Production State

RewardsPro currently offers:

- **Tier-Based Loyalty**: Spending-based, manual, product purchase, and subscription-based tier assignment
- **Store Credit/Cashback**: Automatic cashback on purchases synced to Shopify
- **Points System**: Earn and redeem points with configurable rules
- **Gamification**: Merchant configuration and engines exist for raffles,
  mystery boxes, and missions; Shopify customer-account participation is
  paused pending verified identity binding
- **Marketing**: Email campaigns, templates, and automation workflows
- **Analytics**: Revenue tracking, cohort analysis, RFM segmentation
- **Integrations**: Klaviyo, SendGrid, Zapier, Slack

### Plan Limits (Rate-Based Model)

All plans access all features—differentiation is through capacity limits:

Capacity entitlement does not override a security pause. Customer-facing
gamification routes remain unavailable until the identity-binding condition
named in Pillar 2 is satisfied.

| Feature | Free Forever | Grow ($29/mo) | Scale ($79/mo) | Corporate ($499/mo) |
|---------|--------------|---------------|----------------|---------------------|
| Reward-eligible orders/month | 1,000 | 10,000 | 25,000 | 100,000 |
| Customer sync | 10,000 | 100,000 | 500,000 | Unlimited |
| Tiers | 5 | 20 | 50 | Unlimited |
| Tier products | 5 | 20 | 50 | Unlimited |
| Emails/month | 1,000 | 10,000 | 25,000 | 100,000 |
| Campaigns | 5 | 25 | 100 | Unlimited |
| Automation flows | 3 | 15 | 50 | Unlimited |
| Active raffles | 3 | 10 | 25 | Unlimited |
| Active challenges | 5 | 25 | 100 | Unlimited |

Annual prices are $290 for Grow, $790 for Scale, and $4,990 for
Corporate. Current plans are fixed-price with no GMV, customer-count, or
per-order overage charge.

---

## Core Philosophy

### Foundational Principles
1. **Merchant-First Simplicity** - Complex loyalty mechanics, simple interface
2. **Transparency** - Clear ROI, actionable metrics
3. **Flexibility** - Multiple tier assignment methods
4. **Reliability** - Idempotent, distributed, fault-tolerant
5. **Privacy & Security** - PII protection, session isolation
6. **Scalability** - Async processing, pagination, chunking
7. **Auditability** - Complete change logs and trails
8. **Deep Connectors** - Native Shopify depth today, equivalent honesty per future platform

### Evolving Principles
9. **Intelligence** - AI-powered insights and automation
10. **Engagement** - Gamification that drives behavior
11. **Omnichannel** - Seamless experience across touchpoints
12. **Community** - Loyalty as social connection
13. **Connector Honesty** - Every platform capability and limitation is explicit
14. **Portable Core** - Identity, ledgers, rules, and events do not belong to one channel

---

## Pillar 1: Core Rewards System

### 1.1 Tier Management ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Multiple tier assignment methods (spending, manual override, product purchase, subscription)
- Tier resolution priority system
- Configurable cashback percentages per tier
- Tier benefits configuration
- Automatic tier recalculation
- Tier change logging and audit trails

**Files**: `tier-resolution.server.ts`, `tier-calculation.server.ts`, `app.tiers.tsx`

### 1.2 Store Credit/Cashback System ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Automatic cashback on order payment
- Store credit ledger with full audit trail
- Manual credit adjustments
- Shopify gift card integration for redemption
- Multi-currency support
- Refund handling (credit clawback)

**Files**: `shopify-store-credit.service.ts`, `webhooks.orders.paid.tsx`

### 1.3 Points System ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Points earning on purchases
- Points redemption for store credit
- Points ledger with transaction history
- Configurable earn rates per tier
- Points display in customer account
- Points metafield sync to Shopify

**Files**: `points-ledger.server.ts`, `points-config.server.ts`, `points-redemption.server.ts`

### 1.4 Tier Products (Sell Memberships) ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Create tier membership products in Shopify
- One-time tier purchases (monthly, annual, lifetime)
- Recurring tier subscriptions via Shopify Subscriptions API
- Automatic tier assignment on purchase
- Expiration tracking and notifications

**Files**: `tier-products/`, `app.tier-products.tsx`, `app.members.products.tsx`

### 1.5 Multi-Currency Rewards 🔨 PARTIAL
**Status**: Store credit works, full multi-currency points planned

**Implemented**:
- Multi-currency store credit (uses Shopify's currency)
- Exchange rate service for normalization

**Planned**:
- Configurable reward currency (name, icon, value ratio)
- Multiple currencies per program (points + cashback hybrid)
- Currency conversion between types

---

## Pillar 2: Gamification & Engagement

### 2.1 Raffles
**Status**: Merchant configuration exists; customer-account access is paused

**Implemented Features**:
- Create time-limited raffles
- Multiple prize tiers
- Points-based or free entry
- Automated drawing system
- Winner notification emails
- Prize delivery tracking
- Customer-account display and entry are paused until verified Shopify Customer Account identity binding exists

**Files**: `raffle-*.server.ts`, `app.rewards.raffles.tsx`

### 2.2 Mystery Boxes
**Status**: Merchant configuration exists; customer-account access is paused

**Implemented Features**:
- Create mystery box campaigns
- Configurable reward pools (points, discounts, products)
- Probability-based rewards
- Customer-account display and opening are paused until verified Shopify Customer Account identity binding exists
- Winner tracking and fulfillment

**Files**: `mystery-box-*.server.ts`, `app.rewards.mystery-boxes.tsx`

### 2.3 Challenges & Missions 📋 PLANNED
**Status**: Public routes are paused pending verified Shopify Customer Account identity binding

**Planned Features**:
- Purchase challenges ("Buy 3 products this month")
- Spending challenges ("Spend $200 in accessories")
- Category exploration ("Try 5 different categories")
- Social challenges ("Share a product on Instagram")
- Review challenges ("Leave 3 reviews")
- Streak challenges ("Order 3 weeks in a row")

**Database Schema Needed**:
```prisma
model Challenge {
  id              String   @id @default(uuid())
  shop            String
  name            String
  description     String
  type            ChallengeType
  criteria        Json     // Flexible goal definition
  rewardType      String   // POINTS | DISCOUNT | BADGE
  rewardValue     Decimal
  startDate       DateTime
  endDate         DateTime?
  isRecurring     Boolean  @default(false)
  maxCompletions  Int?
}

model CustomerChallenge {
  id              String   @id @default(uuid())
  customerId      String
  challengeId     String
  progress        Json
  completedAt     DateTime?
  rewardClaimed   Boolean  @default(false)
}
```

### 2.4 Achievements & Badges 💡 VISION
**Status**: Future feature

**Planned Badge Categories**:
- Tier achievements (reached Gold, Platinum)
- Spending milestones ($100, $500, $1000, $5000)
- Order milestones (1st, 10th, 50th, 100th)
- Category expert (10+ purchases in category)
- Loyalty anniversary (1 year, 2 years, 5 years)

### 2.5 Streaks & Consistency Rewards 💡 VISION
**Status**: Future feature

- Weekly/monthly purchase streaks
- Progressive multipliers
- Streak protection
- Visual streak counter

### 2.6 Referral Program 💡 VISION
**Status**: Future feature

- Unique referral codes per customer
- Two-sided rewards (referrer + referee)
- Tiered referral bonuses
- Fraud prevention

---

## Pillar 3: Marketing & Communications

### 3.1 Email Campaigns ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Campaign creation and scheduling
- Audience segmentation (by tier, spending, activity)
- A/B testing for subject lines
- Performance tracking (opens, clicks)
- Template library

**Files**: `app.marketing.campaigns.tsx`, `email-notifications.server.ts`

### 3.2 Email Templates ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Drag-and-drop template editor
- Personalization variables (name, tier, points)
- Preview functionality
- Template categories

**Files**: `app.marketing.templates.tsx`

### 3.3 Automation Workflows ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Event-based triggers (tier change, purchase, points earned)
- Delay actions
- Email send actions
- Points award actions
- Workflow analytics

**Files**: `app.marketing.automation.tsx`, `EmailAutomation` model

### 3.4 Klaviyo Integration ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- OAuth connection
- Profile sync with loyalty data
- Custom events (tier_changed, points_earned, etc.)
- List sync
- Automated event push

**Files**: `klaviyo*.server.ts`, `app.marketing.klaviyo.tsx`

### 3.5 SendGrid Integration ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Domain verification
- Transactional email sending
- Webhook processing for events

**Files**: `sendgrid.server.ts`, `webhooks.sendgrid.tsx`

### 3.6 SMS & WhatsApp 💡 VISION
**Status**: Future feature

- Twilio SMS integration
- WhatsApp Business API
- Points balance reminders
- Expiration warnings
- Two-way conversational loyalty

---

## Pillar 4: Analytics & Insights

### 4.1 Analytics Dashboard ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Revenue metrics (total, by tier, trends)
- Customer metrics (new, active, churned)
- Order metrics (count, AOV, frequency)
- Store credit metrics (issued, redeemed, outstanding)
- Time period comparisons
- CSV export

**Files**: `app.analytics.tsx`, `analytics/` services

### 4.2 Cohort Analysis ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Acquisition date cohorts
- Retention curves
- Revenue per cohort
- Tier progression tracking

**Files**: `cohort-analysis.server.ts`

### 4.3 RFM Segmentation ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Recency, Frequency, Monetary scoring
- Customer segments (Champions, Loyal, At Risk, etc.)
- Segment-based targeting

**Files**: `rfm-segmentation.server.ts`

### 4.4 Recommendations Engine ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Actionable recommendations based on data
- Tier optimization suggestions
- Engagement improvement tips

**Files**: `analytics-recommendations.server.ts`

### 4.5 AI-Powered Insights 💡 VISION
**Status**: Future feature

**Planned**:
- Predictive churn scoring
- Customer lifetime value prediction
- Smart tier optimization
- Natural language insights

---

## Pillar 5: Integrations

### 5.0 Commerce Platform Connectors

| Connector | Status | Scope |
|-----------|--------|-------|
| Shopify | ✅ LIVE | Full production application and native redemption |
| WooCommerce | 📋 PLANNED | First full non-Shopify connector |
| Headless API | 💡 DESIGN | Canonical identity, event, balance, and redemption contracts |
| Stripe | 💡 EXPLORING | Payment/subscription earning connector first |
| POS providers | 💡 EXPLORING | Later omnichannel work |

The statuses above are deliberately narrower than the third-party app
integrations below. A marketing integration such as Klaviyo consumes loyalty
events; a commerce connector supplies the customers, orders, refunds, and
redemption surface that the loyalty engine operates on.

### 5.1 Current Integrations ✅ LIVE

| Integration | Status | Purpose |
|-------------|--------|---------|
| Klaviyo | ✅ LIVE | Email marketing, customer profiles |
| SendGrid | ✅ LIVE | Transactional email |
| Zapier | ✅ LIVE | Custom automations |
| Slack | ✅ LIVE | Alerts and notifications |
| Shopify Flow | 🔨 PARTIAL | Triggers available |

### 5.2 Planned Integrations 📋

| Integration | Priority | Purpose |
|-------------|----------|---------|
| Yotpo/Judge.me | High | Reviews integration |
| Recharge | Medium | Subscription products |
| HubSpot | Medium | CRM sync |
| Segment | Low | CDP integration |

### 5.3 Future Integrations 💡

- POS integration (Shopify POS)
- SMS providers (Twilio, Attentive)
- WhatsApp Business
- Social commerce (TikTok, Instagram)

---

## Pillar 6: Customer Experience

### 6.1 Customer Account Extension ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Loyalty status widget in customer account
- Points balance display
- Tier progress visualization
- Transaction history
- Raffle participation
- Points redemption interface

**Files**: `api.customer-account.*.tsx`, theme extension

### 6.2 Storefront Widget ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Embeddable loyalty widget
- Points display
- Tier status
- Customizable appearance

**Files**: `extensions/theme-app-extension-rewardspro/`

### 6.3 Standalone Loyalty Portal 💡 VISION
**Status**: Future feature

- Custom subdomain (rewards.store.com)
- Full point history
- Available rewards catalog
- Badge showcase
- Referral dashboard

---

## Pillar 7: Infrastructure & Operations

### 7.1 Billing & Plans 🔨 PARTIAL
**Status**: Free-first contract implemented; live Shopify rollout pending

**Implemented Features**:
- Four public tiers (Free Forever, Grow, Scale, Corporate)
- Monthly and annual billing
- Fixed recurring prices with no usage charges
- Advisory capacity warnings without merchant lockout
- Stable legacy Shopify billing names for existing subscription recognition
- Shopify Billing API integration

**Rollout boundary**:
- Partner Dashboard/App Pricing plans must be created and tested as drafts
- Existing paid contracts stay recognised and are not cancelled automatically
- Entitlement backfill is dry-run first and preserves active overrides

**Files**: `billing/`, `app.billing.tsx`

### 7.2 Data Sync ✅ LIVE
**Status**: Production-ready

**Implemented Features**:
- Customer sync from Shopify
- Order sync with historical import
- Incremental sync for efficiency
- Webhook-based real-time updates

**Files**: `*-sync-job.server.ts`, `webhooks.*.tsx`

### 7.3 Monitoring
**Status**: Implemented; dependency readiness must be verified after each deploy

**Implemented Features**:
- Public process-liveness endpoint with no dependency or environment detail
- Exact-Bearer operator readiness endpoint with one read-only database probe
- Authenticated monitoring dashboard that derives database state from its own reads
- Sentry error tracking
- Datadog integration
- Structured logging

**Files**: `app.monitoring.tsx`, `api.health.tsx`, `logger.service.ts`

### 7.4 Database
**Status**: Schema and Data API clients implemented; a ready build is not proof of a ready database

- Aurora Serverless PostgreSQL
- Aurora Data API for deployed runtime
- Prisma ORM
- 90+ database models

---

## Pillar 8: Enterprise Features 💡 VISION

### 8.1 Multi-Store Management
- Unified dashboard across stores
- Cross-store points pooling
- Aggregate analytics
- Single billing

### 8.2 Role-Based Access Control (RBAC)
- Owner, Admin, Manager, Analyst, Support roles
- Custom permission overrides
- Audit logging

### 8.3 White-Label Solution
- Custom domain for loyalty portal
- Remove "Powered by" branding
- Custom email templates
- API-only mode

### 8.4 Dedicated Infrastructure
- Dedicated database instance
- Custom rate limits
- 99.99% SLA guarantee

### 8.5 Advanced Security
- Fraud detection
- Two-factor authentication for redemptions
- Device fingerprinting
- Suspicious activity alerts

---

## Implementation Roadmap

### Near-Term (Next Quarter)
| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| Challenges System | High | Medium | 📋 Schema design complete |
| Points Expiration | High | Medium | 📋 Planned |
| Review Integration | Medium | Medium | 📋 Planned |

### Mid-Term (2-3 Quarters)
| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| Referral Program | High | High | 💡 Vision |
| Badges & Achievements | Medium | Medium | 💡 Vision |
| SMS Integration | Medium | Medium | 💡 Vision |
| Streaks | Medium | Low | 💡 Vision |

### Long-Term (4+ Quarters)
| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| AI Churn Prediction | High | High | 💡 Vision |
| Multi-Store | High | High | 💡 Vision |
| White-Label | Medium | Medium | 💡 Vision |
| Mobile SDK | Low | Very High | 💡 Vision |

---

## Success Metrics

### Merchant Success Targets
- Repeat purchase rate increase: +25%
- Customer lifetime value increase: +40%
- Program participation rate: >50%
- Redemption rate: 60-80%
- Net Promoter Score: >50

### Platform Success Targets
- Monthly active merchants: 10,000
- Total GMV through program: $1B annually
- Feature adoption: >70% using 5+ features
- Merchant churn rate: <3% monthly

---

## Competitive Advantages

### Technical
1. **Deep Shopify Integration** - Native checkout, POS, customer accounts
2. **Real-time Processing** - Instant tier calculations and rewards
3. **Scalable Architecture** - Aurora Serverless, async processing
4. **Rate-Based Model** - All features available, upgrade for capacity

### Strategic
1. **Ecosystem Network Effects** - Cross-merchant benchmarking potential
2. **Data Flywheel** - More merchants = better recommendations
3. **Integration Network** - Best-in-class connections

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | January 2026 | Updated with implementation status, current plan limits, accurate feature inventory |
| 1.0 | January 2025 | Initial vision document |

---

*This is a living document updated as features are implemented and priorities evolve.*

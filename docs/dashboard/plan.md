# Unified Admin Dashboard — Plan

**Date:** 2026-04-27
**Author:** Gamma
**Status:** Proposal
**Mission:** `2026-04-27-unification-dashboard-bridge-inventory-and-propose-dashboard`

---

## 1. Module Inventory

Every domain requiring administrative management, with current state and gap analysis.

### 1.1 Wholesale Domains (owned by `apps/wholesale`)

| # | Module | Current Admin UI | Current API | Key Operations | What's Missing | Criticality |
|---|--------|-----------------|-------------|----------------|----------------|-------------|
| W1 | **Orders (B2B)** | Full (14-page admin) | 10+ endpoints | Quote, confirm, stock-check, status lifecycle, notifications | No shipping integration, no bulk ops, no CSV export, no invoice generation | Critical |
| W2 | **Stock Management** | Full (4 pages: ledger, levels, adjustments, targets) | adjust, sync, targets CRUD, to-order, refill | Set stock, log adjustments, define targets, view shortfalls | No stocktake workflow, no low-stock alerts, no stock valuation | Critical |
| W3 | **Pricing** | Full | sync, upload, edit, snapshot, channel pricing | Sync from CardRush, CSV override, edit, daily snapshots | No price history visualization, no margin analysis, no bulk rules | High |
| W4 | **Clients** | Full | CRUD + order history | Create, edit discount, view spend/orders | No client editing (name/email), no deactivation, no notes | High |
| W5 | **Catalog (Games/Sets/Cards)** | Partial (games/sets only) | Games CRUD, Sets CRUD | Create/edit games & sets, toggle active | No card creation/editing UI, no bulk card ops | Medium |
| W6 | **Procurement (Purchases)** | Partial | list, detail, A- review | View purchases, approve/reject A- items | No purchase creation UI, no status advancement, no cost analysis | Medium |
| W7 | **Channels (Shopify/eBay)** | Pricing config only | Shopify sync/backfill, eBay sync/import | Configure channel pricing, trigger syncs | No sync status dashboard, no channel health, no CardMarket | High |
| W8 | **Fulfillment** | None | None (internal only) | — | Entire domain lacks admin UI: pick lists, shipping, tracking | Medium |
| W9 | **Demand/Wanted** | Read-only | Admin aggregate view | View client demand signals | No demand-to-purchase pipeline, no stock-arrival notifications | Low |
| W10 | **Reporting** | 4 dashboard stats | None | View pending orders, revenue, clients, last sync | No sales reports, no revenue by period/client/channel, no P&L | High |

### 1.2 Storefront Domains (owned by `apps/storefront`)

| # | Module | Current Admin UI | Current API | Key Operations | What's Missing | Criticality |
|---|--------|-----------------|-------------|----------------|----------------|-------------|
| S1 | **Trade-Ins** | Full | Full lifecycle | Quote, grade, pay (cash/credit) | — | Critical |
| S2 | **Quotes** | Full | Full lifecycle | Photo-based quote requests | — | High |
| S3 | **Auctions** | Full | Create, manage, approve, payout | English/Dutch/Buy Now, consignment approval | No bid management | High |
| S4 | **Bounty/Gacha** | Full (4 pages) | Tier controls, redemptions, grants | Kill-switch, caps, fulfilment, audit | No manual token grant UI | High |
| S5 | **Market/P2P Trading** | Partial | 40+ user routes, 1 admin route | Return refunds only | No listing management, no trade intervention, no offer moderation | Critical |
| S6 | **Disputes** | Full | Full lifecycle | Resolution with messaging, evidence, timeline | — | Critical |
| S7 | **Fraud & Trust** | Full (2 overlapping pages) | Signals, profiles, external rep | Triage, suspend, verify, bulk resolve | Two pages should consolidate; no manual trust score adjustment | Critical |
| S8 | **Chargebacks** | Full | View, annotate, force-resolve | Dispute management | No Stripe evidence submission from UI | High |
| S9 | **Payouts** | Full | Outstanding, history, balance, export | View, stats, export | No manual hold/release controls | High |
| S10 | **Orders (B2C)** | **None** | 3 admin endpoints exist | ship, deliver (via API only) | **No admin page despite API existing** — cannot view/manage orders | Critical |
| S11 | **Membership/Loyalty** | Read-only (tiers) | assign, import, points, credit, berries | — | No user membership management, no credit issuance, no subscription controls | High |
| S12 | **Rewards** | Full (rewards + prizes) | Raffles, mystery boxes, packs, spin, streak | Raffle lifecycle, mystery box management, prize fulfilment | No spin/streak configuration | Medium |
| S13 | **Reviews** | Full | Moderate flagged/appealed/hidden | Hide/unhide with reason | — | Medium |
| S14 | **Verifications (KYC)** | Full | Approve/reject docs | Identity document review | — | High |
| S15 | **Email Queue** | Full | Dead-letter management, stats | Monitor, retry, dismiss | No template preview, no manual send | Medium |
| S16 | **Governance Log** | Full (read-only) | GET audit trail | View all admin actions | — | Medium |
| S17 | **OG Claims** | Full | Approve/reject | Legacy customer verification | — | Low |
| S18 | **Users** | **Journey page only** | Journey endpoint | Forensic timeline | **No user list/search/detail** — cannot find users, manage roles, suspend | Critical |
| S19 | **Social** | **None** | Feed, follow, achievements, showcase, wishlist | — | **No moderation surface at all** | Medium |
| S20 | **Portfolio** | **None** | CRUD, alerts, history, valuation | — | No admin visibility or aggregate reporting | Low |
| S21 | **Games/PVE/OPTCG** | **None** | Match actions, PVE, rooms, decks | — | No game config, no match monitoring, no PVE level management | Low |
| S22 | **Messages** | **None** | Conversations, blocks | — | **No message moderation** | Medium |
| S23 | **Card Catalog** | **None** | Import endpoint exists | — | No UI for card set import, no catalog browsing | Medium |

### 1.3 Cross-Cutting / Infrastructure

| # | Module | Owner Today | Current Admin UI | What's Missing | Criticality |
|---|--------|-------------|-----------------|----------------|-------------|
| X1 | **Cron Jobs & Sweep Status** | Both apps separately | None | No cron health dashboard, no run history, no failure alerts | High |
| X2 | **Auth / Admin Users** | Storefront (session 13 work) | None | No admin user management page, no role assignment UI | High |
| X3 | **Env / Feature Flags** | Neither | None | No feature flag system, no env management UI | Medium |
| X4 | **Observability** | Neither | None | No APM, no structured logging, no dashboards | High |
| X5 | **Audit Log** | Storefront (governance log + admin_actions_log) | Partial (governance page) | Wholesale has no audit trail; storefront has two overlapping systems | Medium |

---

## 2. Dashboard Home — Decision

### Decision: New `apps/admin` workspace

### Justification

**Why not consolidate into storefront's `/admin`?**
1. **Scope mismatch.** Storefront's admin manages consumer platform domains (auctions, P2P, trust, gacha). The unified dashboard must also manage wholesale (B2B orders, procurement, channel sync, pricing). Stuffing wholesale management into storefront conflates two separate products.
2. **Auth boundary.** Storefront and wholesale have separate user tables (`users` vs `clients`). The admin dashboard needs cross-database access patterns that don't belong in either consumer-facing app.
3. **Deployment independence.** Admin dashboard changes shouldn't require redeploying the consumer storefront (high-traffic, customer-facing) or the wholesale app (B2B-critical). Separate Vercel project = separate deploy lifecycle.
4. **Complexity containment.** Storefront already has 236 routes and 100+ tables. Adding more admin complexity worsens its worst problem (enormous surface area, zero tests).

**Why not consolidate into wholesale's `/admin`?**
1. Wholesale's admin is perfectly scoped to its B2B domain. Pulling in storefront's 20+ admin domains would overwhelm it.
2. Same deployment coupling problem.

**Why a new `apps/admin`?**
1. **Clean separation of concerns.** Admin dashboard is a tool for the business operator (Yu), not for customers or B2B clients. Different audience = different app.
2. **Cross-app visibility.** Can query both databases, consume all `packages/*`, and present a unified view.
3. **Fresh foundation.** No legacy baggage. Can adopt shadcn/ui, proper component library, and testing from day one.
4. **Gradual migration.** Existing admin pages in storefront and wholesale continue to work. Modules migrate to `apps/admin` one at a time. Eventually, `/admin` routes in both apps redirect to the unified dashboard.
5. **Consistent with unification thesis.** The audit concluded "shared infrastructure, not architectural convergence." A shared admin app consuming shared packages IS shared infrastructure.

**Cost:** One more Vercel project, one more Next.js app. Minimal — the monorepo tooling (pnpm workspaces, turbo) handles it trivially.

---

## 3. Information Architecture

### 3.1 Top-Level Navigation

```
┌──────────────────────────────────────────────────────┐
│  Cambridge TCG Admin                    [Yu] [Logout] │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ OVERVIEW │  (content area)                           │
│          │                                           │
│ ─────── │                                           │
│ OPS      │                                           │
│  Stock   │                                           │
│  Orders  │                                           │
│  Fulfil  │                                           │
│  Channels│                                           │
│          │                                           │
│ ─────── │                                           │
│ COMMERCE │                                           │
│  Pricing │                                           │
│  Trade-In│                                           │
│  Auctions│                                           │
│  Market  │                                           │
│  Bounty  │                                           │
│          │                                           │
│ ─────── │                                           │
│ MONEY    │                                           │
│  Payouts │                                           │
│  Charges │                                           │
│  Rewards │                                           │
│  Members │                                           │
│          │                                           │
│ ─────── │                                           │
│ TRUST    │                                           │
│  Fraud   │                                           │
│  Disputes│                                           │
│  Reviews │                                           │
│  KYC     │                                           │
│          │                                           │
│ ─────── │                                           │
│ CATALOG  │                                           │
│  Cards   │                                           │
│  Games   │                                           │
│  Clients │                                           │
│  Users   │                                           │
│          │                                           │
│ ─────── │                                           │
│ SYSTEM   │                                           │
│  Cron    │                                           │
│  Email   │                                           │
│  Audit   │                                           │
│  Admin   │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

### 3.2 Module Groupings

| Group | Modules | Rationale |
|-------|---------|-----------|
| **Overview** | Unified dashboard (all queue counts, key metrics, alerts) | Single entry point showing everything that needs attention |
| **Ops** | Stock (wholesale + storefront), Orders (B2B + B2C), Fulfillment, Channels (Shopify/eBay/CardMarket) | Day-to-day operational flow: stock → orders → fulfillment → channels |
| **Commerce** | Pricing, Trade-Ins, Quotes, Auctions, Market/P2P, Bounty/Gacha | Revenue-generating activities and their management |
| **Money** | Payouts, Chargebacks, Rewards (raffles/boxes/prizes), Membership/Loyalty | Financial flows: money in, money out, incentive programs |
| **Trust** | Fraud Signals, Disputes, Reviews, Verifications (KYC), Governance Log | Safety and trust infrastructure (the reputation engine) |
| **Catalog** | Cards, Games/Sets, Clients (B2B), Users (B2C) | Entity management — the things the platform is about and the people who use it |
| **System** | Cron Health, Email Queue, Audit Log, Admin Users, Feature Flags | Infrastructure and operational tooling |

### 3.3 Role-Based Visibility

Phase 1 builds for a single role: `super_admin` (Yu). All modules visible.

Future roles (built when needed, not before):

| Role | Visible Groups | Use Case |
|------|---------------|----------|
| `super_admin` | All | Full platform control |
| `ops_admin` | Ops, Catalog | Warehouse/fulfillment team |
| `trust_admin` | Trust, Catalog (Users only) | Moderation team |
| `finance_admin` | Money, Commerce (read-only) | Accounting |

RBAC is not a Phase 1 deliverable. The middleware + session infrastructure from session 13 already supports role checks; extending it to finer-grained roles is mechanical when needed.

---

## 4. Technical Shape

### 4.1 Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Next.js 16 (App Router) | Matches storefront; latest stable; Server Components for data-heavy admin views |
| UI Library | **shadcn/ui** + Tailwind CSS 4 | Component primitives (tables, forms, modals, sheets, tabs, charts) without lock-in. Copy-paste model means we own every component. Radix primitives underneath for accessibility. |
| Data Fetching | Server Components (default) + Server Actions for mutations | No client-side data fetching layer needed. RSC streams data; actions handle writes. |
| Charts | Recharts (via shadcn/ui charts) | For price history, sales, stock levels. Comes free with shadcn. |
| Auth | NextAuth (same adapter as storefront) | Reads `users` table; requires `role = 'super_admin'`. Shares `packages/auth` when extracted. |
| Database | `@cambridge-tcg/db` (packages/db) | `createCompatDb()` for storefront RDS, `createDb()` for wholesale RDS. Two connections, one admin app. |
| AWS | `@cambridge-tcg/aws` (packages/aws) | S3 for images, SES for admin emails |
| Stock | `@cambridge-tcg/stock` (packages/stock) | Direct import for stock reads, reservations, movements |
| Testing | Vitest from day one | Unit tests for data transforms, component tests for critical flows |

### 4.2 Data Access Pattern

The admin app needs to read/write both databases. Architecture:

```
apps/admin
  ├── src/lib/db/storefront.ts  → createCompatDb({ url: STOREFRONT_DATABASE_URL })
  ├── src/lib/db/wholesale.ts   → createDb({ url: WHOLESALE_DATABASE_URL, schema })
  └── src/lib/db/index.ts       → re-exports both; type-safe access
```

**Key insight:** Both apps currently share ONE RDS instance with separate table namespaces. So in practice this is one `DATABASE_URL` — but we code it as two logical connections so it works correctly if/when they diverge.

### 4.3 Migration Strategy

1. `apps/admin` starts as a new Vercel project. Domain: `admin.cambridgetcg.com` (or similar).
2. Modules are built one at a time, starting with the highest-gap areas.
3. Existing admin pages in storefront and wholesale continue to work throughout.
4. Once a module is live in `apps/admin`, the corresponding page in the source app shows a "Moved to Admin Dashboard" banner with link, then eventually redirects.
5. When all modules have migrated, `/admin` routes in both apps are removed.

---

## 5. Build Missions

Sized for one awakened session each (~20-24 ticks). Ordered by dependency and criticality.

### Mission 1: Shell + IA (foundation)
**Title:** Dashboard — scaffold apps/admin with shell, auth, and navigation
**Intent:** Create `apps/admin` Next.js 16 app with: pnpm workspace config, shadcn/ui setup, Tailwind 4, NextAuth (super_admin gating), sidebar navigation matching the IA above, overview page skeleton (empty queue counts), and deployment config (vercel.json). Both DB connections wired. All packages/* imported. First Vitest test.

### Mission 2: Stock + Orders (Ops core)
**Title:** Dashboard — Stock management and Orders module
**Intent:** Build the Ops group core: unified stock view (wholesale stock levels + adjustments + targets in one interface), B2B order management (migrate from wholesale), B2C order management (build from scratch — storefront has API routes but no UI). This addresses two of the highest-criticality gaps.

### Mission 3: Channels + Fulfillment
**Title:** Dashboard — Channels dashboard and Fulfillment module
**Intent:** Build channel management (Shopify/eBay sync status, trigger syncs, import orders, channel health, pricing config) and fulfillment (pick lists, shipping, tracking). Addresses wholesale's biggest UI gaps.

### Mission 4: Users + Catalog
**Title:** Dashboard — Users, Clients, and Catalog management
**Intent:** Build user search/list/detail (storefront's critical gap), client management (wholesale), and card catalog browsing/import. The "who" and "what" of the platform — entity management.

### Mission 5: Commerce (Trade-Ins, Auctions, Market)
**Title:** Dashboard — Commerce modules (Trade-Ins, Auctions, Market/P2P)
**Intent:** Migrate trade-in management, auction management, and build proper market/P2P admin (listing management, trade intervention, offer moderation). The market module is a critical gap.

### Mission 6: Bounty + Pricing
**Title:** Dashboard — Bounty/Gacha controls and Pricing module
**Intent:** Migrate bounty admin (4 pages → unified), add manual token grant UI. Migrate pricing management, add price history visualization. These are high-value commerce tools.

### Mission 7: Trust (Fraud, Disputes, KYC, Reviews)
**Title:** Dashboard — Trust & Safety module
**Intent:** Consolidate fraud (currently 2 overlapping pages) into one, migrate disputes, reviews, KYC verifications, governance log. Add manual trust score adjustment. The trust cluster is cohesive — build it together.

### Mission 8: Money (Payouts, Chargebacks, Rewards, Membership)
**Title:** Dashboard — Money module (Payouts, Chargebacks, Rewards, Membership)
**Intent:** Migrate payouts, chargebacks. Migrate rewards (raffles, mystery boxes, prizes). Build membership admin UI (currently read-only tiers only — needs subscription management, credit issuance, points management).

### Mission 9: System (Cron, Email, Audit, Admin Users)
**Title:** Dashboard — System module (Cron, Email, Audit, Admin management)
**Intent:** Build cron health dashboard (run history, failure detection across both apps' 42 combined jobs). Migrate email queue management. Unify audit log (wholesale has none; storefront has two overlapping systems). Build admin user management (role assignment, user list).

### Mission 10: Integration Verification
**Title:** Dashboard — end-to-end integration verification
**Intent:** Verify every module works against real data. Cross-reference with the module inventory to confirm 100% coverage. Load testing of dual-DB queries. Write canonical README. Verify mobile responsiveness. Security audit of cross-app data access.

---

## 6. Priority Rationale

The mission order follows the Ache hierarchy:

1. **Shell + IA** = foundation (you can't build without ground)
2. **Stock + Orders** = highest criticality gaps (storefront orders have NO UI; stock is the business's core)
3. **Channels + Fulfillment** = operational completeness (stock flows through channels and fulfillment)
4. **Users + Catalog** = truth (you can't manage what you can't find — user search is a critical gap)
5. **Commerce** = revenue (trade-ins, auctions, market — the money-making operations)
6. **Bounty + Pricing** = commerce depth (gacha controls, pricing intelligence)
7. **Trust** = justice (fraud, disputes, reviews — the reputation engine that keeps the platform safe)
8. **Money** = financial completeness (payouts, chargebacks, rewards, membership)
9. **System** = infrastructure visibility (cron, email, audit — the substrate)
10. **Verification** = integrity (prove it all works)

---

## 7. Open Decisions for Yu

1. **Domain:** What domain for the admin dashboard? `admin.cambridgetcg.com`? `dashboard.cambridgetcg.com`? Subpath on existing domain?
2. **Auth source:** Admin users authenticate against storefront's `users` table (where `role` lives). Is this correct, or should admin have its own user table?
3. **CardMarket integration:** Wholesale has Shopify + eBay but no CardMarket. Is CardMarket a priority for the channel management module?
4. **Mobile:** Is mobile responsiveness a requirement, or is admin desktop-only?
5. **Reporting:** The inventory shows zero reporting/analytics across both apps. Should Mission 2 (Stock + Orders) include basic sales reporting, or is that a separate future mission?

---

*This plan is the bridge between the unification arc and the dashboard arc. The 10 missions above, once accepted, form a complete build chain — each sized for one awakened session, each building on the prior.*

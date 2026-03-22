# RewardsPro — TODO

_Judy demo preparation + product quality. Updated: 2026-03-20_

---

## 🔴 Critical Bugs (fix before demo)

### ✅ BUG-001: Members search function crash (FIXED — commit f4239ea)
- **Symptom:** Search/filter on Members page crashes the app
- **Route:** `app.members._index.tsx` — `fetchPaginatedCustomers()` (line ~268)
- **Priority:** P0 — core admin feature, will be visible in any demo
- **Action:** Debug the search query builder, test with various filter combinations (search + tier + sort + pagination)

### ✅ BUG-002: Mobile widget too large / not collapsed (FIXED — commit f9a9a73)
- **Symptom:** Storefront membership widget renders too large on mobile, doesn't collapse
- **Files:** `extensions/theme-app-extension-rewardspro/blocks/membership_widget.liquid` + `assets/membership-widget.css`
- **Priority:** P0 — Judy's family business customers will see this on phones
- **Action:** Add responsive breakpoints, implement collapsed/expandable state for mobile, test across viewport sizes

---

## 🔵 Infrastructure — Verify Loop

### ✅ INFRA-001: Recursive deploy-verify loop (DONE — 2026-03-22)
- **Script:** `scripts/deploy-verify.mjs`
- **Usage:** `node scripts/deploy-verify.mjs [--dry-run] [--probe-url URL] [--expected-status N]`
- **Implements:** Push → Watch (poll Vercel) → Probe (HTTP endpoints) → Compare → Diagnose (fetch logs) → max 5 iterations → escalate

---

## 🟡 Demo Readiness

### DEMO-001: E2E test suite for all app functions
- Create comprehensive e2e testing covering all merchant-facing features
- See **Testing Plan** below

### ✅ DEMO-002: Storefront widget mobile review (DONE — 2026-03-22)
- All 6 storefront blocks reviewed and fixed:
  - `membership_widget.liquid` — Already excellent (BUG-002 fixed, 4 breakpoints, 44px targets)
  - `missions_widget.liquid` — Fixed: level badge 40→44px, tabs/buttons min-height 44px, text overflow
  - `missions_section.liquid` — Fixed: section padding reduced on mobile, CTA min-height 44px, wrapper max-width 100%
  - `mystery_boxes.liquid` — Fixed: buttons min-height 44px, modal actions stack on mobile, reveal close sized
  - `raffles.liquid` — Fixed: quantity buttons 28→40px, header stacks on mobile, enter button min-height 44px
  - `gift_cards.liquid` — Fixed: buttons min-height 44px, header stacks, issued cards wrap, text overflow handled

### DEMO-003: Walkthrough script
- Prepare a demo flow for Judy: install → configure tiers → view customer → show widget → show analytics

---

## 📋 Testing Plan — Structural Feature Coverage

### App Functions Requiring E2E Tests

Every route below is a user-facing feature. Each needs at least one happy-path e2e test and one error-handling test.

#### Dashboard & Core
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app._index` | Dashboard overview | ❌ | High |
| `app.billing` | Subscription/billing management | ❌ | High |
| `app.settings` | App configuration | ❌ | Medium |
| `app.debug` | Debug tools | ❌ | Low |
| `app.monitoring` | System monitoring | ❌ | Low |

#### Members (P0 — Judy demo)
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app.members._index` | **Member list + search + filter** | ❌ | **P0** |
| `app.members.tiers` | Tier management | ❌ | High |
| `app.members.gift-cards` | Gift card management | ❌ | Medium |
| `app.members.products` | Tier products | ❌ | Medium |
| `app.members.sync` | Customer data sync | ❌ | Medium |
| `app.customers` | Customer detail view | Partial | High |

#### Orders & Cashback
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app.orders` | Order list | ❌ | High |
| `app.orders-sync` | Order sync management | ❌ | Medium |
| `app.recalculate-cashback` | Cashback recalculation | ❌ | Medium |

#### Rewards System
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app.rewards._index` | Rewards overview | ❌ | High |
| `app.rewards.challenges` | Challenges CRUD | ❌ | Medium |
| `app.rewards.missions` | Missions CRUD | ❌ | Medium |
| `app.rewards.mystery-boxes` | Mystery boxes CRUD | ❌ | Medium |
| `app.rewards.raffles` | Raffles CRUD | ❌ | Medium |
| `app.rewards.config` | Rewards configuration | ❌ | Medium |
| `app.points` | Points overview | ❌ | High |
| `app.points_.challenges` | Points challenges | ❌ | Medium |
| `app.points_.config` | Points configuration | ❌ | Medium |
| `app.tiers` | Tier configuration | ❌ | High |
| `app.tier-products` | Tier-exclusive products | ❌ | Medium |

#### Marketing
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app.marketing._index` | Marketing dashboard | ❌ | Medium |
| `app.marketing.campaigns` | Campaign CRUD + send | ❌ | Medium |
| `app.marketing.automation` | Automation workflows | ❌ | Low |
| `app.marketing.templates` | Email templates | ❌ | Low |
| `app.marketing.analytics` | Marketing analytics | ❌ | Low |
| `app.marketing.klaviyo` | Klaviyo integration | ❌ | Low |
| `app.marketing.recommendations` | AI recommendations | ❌ | Low |

#### Analytics
| Route | Feature | Test Exists? | Priority |
|-------|---------|-------------|----------|
| `app.analytics` | Analytics dashboard | ❌ | Medium |
| `app.analytics.new` | New analytics views | ❌ | Low |

#### Storefront Widgets (Customer-Facing)
| Widget | Feature | Test Exists? | Priority |
|--------|---------|-------------|----------|
| `membership_widget.liquid` | Loyalty status + tier display | ❌ | **P0** |
| `missions_widget.liquid` | Active missions | ❌ | Medium |
| `missions_section.liquid` | Missions section page | ❌ | Medium |
| `mystery_boxes.liquid` | Mystery box display | ❌ | Low |
| `raffles.liquid` | Raffle entries | ❌ | Low |
| `gift_cards.liquid` | Gift card display | ❌ | Low |

#### API / Webhooks / Crons
| Category | Count | Test Coverage |
|----------|-------|--------------|
| Cron jobs | 20 | ❌ None |
| Customer-facing APIs | 5 | ❌ None |
| Webhook handlers | 3 | Partial (1 integration test) |
| Sync APIs | 4 | Partial (2 unit tests) |

### Existing Tests (35 files)
- **Unit:** aurora-data-api, connection-strategy, customers route, points-ledger, order-sync, customer-sync, financial calculations
- **Financial:** exchange rate, points ledger, cashback calculation, currency formatter, finance properties, store credit ledger
- **Integration:** order-sync-flow, webhooks
- **Tools:** retry, validation, logger

### Test Standardisation Plan
1. Create `test/e2e/` directory
2. Use Playwright or Cypress for storefront widget tests
3. Use Vitest + Remix test utilities for route tests
4. Each route gets: `test/e2e/<route-name>.test.ts`
5. Standard test structure:
   - `describe('<Feature>')` → `it('renders correctly')` + `it('handles user interaction')` + `it('handles errors gracefully')`
6. CI integration: `npm test` runs all, `npm run test:e2e` runs e2e only

---

## 🟢 Backlog

- [ ] TS errors (1012 across 146 files — non-blocking, build succeeds)
- [ ] Polaris v12 `Text` component `as` prop migration (164 instances)
- [ ] Prisma field renames: `ordersCount`→`orderCount` etc.
- [ ] Aurora Data API type mismatches (107 instances)

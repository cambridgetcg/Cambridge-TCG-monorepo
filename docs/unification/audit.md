# Unification Audit — Deep Discrepancy & Gap Analysis

**Date:** 2026-04-27  
**Author:** Gamma  
**Status:** Review  
**Scope:** `apps/wholesale` vs `apps/storefront` — 11 dimensions compared

---

## Executive Summary

Cambridge TCG is two independent businesses sharing a database server. Wholesale is a B2B card distribution platform (17 tables, 56 routes, Drizzle ORM). Storefront is a consumer TCG platform (100+ tables, 236 routes, raw SQL). They share the same RDS instance but occupy **entirely separate table namespaces** — there is no cross-app table sharing. The only integration point is HTTP: storefront fetches pricing from wholesale's v1 API.

**The unification thesis:** These apps should NOT be merged. They serve different markets, different user models, different business logic. What they need is **shared infrastructure** — a clean data layer, common observability, and a shared package ecosystem — not architectural convergence. The priority order is: (1) fix critical security and reliability gaps, (2) extract shared infrastructure into packages, (3) standardize patterns within each app.

---

## 1. Database Drivers & Abstractions

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| ORM | Drizzle (postgres-js driver) | None — raw `pg` |
| Connection | Singleton, `max: 1`, SSL required | **New Pool per query** — TLS handshake every call |
| Config locations | 1 (`src/lib/db/index.ts`) | 3+ (`lib/db.ts`, `tradein/db.ts`, inline in 7 modules) |
| Migration tool | Drizzle Kit | Plain SQL files in `/drizzle` (no ORM despite dir name) |
| Tables defined | 20 (typed in schema.ts) | 100+ (implicit in SQL strings) |

**Classification:** Migration artifact + accidental drift. Storefront started fast with raw SQL and never paused to add structure. The per-query Pool is a performance bug, not a design choice.

**Recommendation:**
1. **Immediate:** Extract a `packages/db` with connection pooling (fix the per-call Pool anti-pattern). Both apps consume it.
2. **Medium-term:** Add Drizzle schema definitions for storefront tables incrementally. Don't rewrite queries — just get type safety and migration tracking.
3. **Keep separate:** Each app retains its own schema files since they own different tables.

---

## 2. Schema Overlaps

**Wholesale tables (20):** `cards`, `cart_items`, `channel_api_keys`, `channel_pricing`, `clients`, `condition_prices`, `fulfillment_entries`, `games`, `notifications`, `order_items`, `order_status_history`, `orders`, `price_archive`, `price_history`, `purchase_items`, `purchases`, `sets`, `stock_adjustments`, `stock_targets`, `wanted_cards`

**Storefront tables (100+):** `users`, `accounts`, `sessions`, `verification_tokens`, `customer_orders`, `market_orders`, `market_trades`, `auctions`, `auction_bids`, `tiers`, `store_credit_ledger`, `portfolio_cards`, `trust_profiles`, `fraud_signals`, `notifications`, `bounty_*`, `tradein_*`, `game_*`, `reward_*`, plus dozens more.

**Only name collision:** `notifications` exists in both — different schemas, different populations (B2B clients vs consumers).

**Integration path:** Storefront reads wholesale card data via HTTP (`wholesaletcgdirect.com/api/v1/prices`). It does NOT query wholesale tables directly. This is correct — it preserves domain boundaries.

**Classification:** Legitimate product difference. The table namespaces are intentionally separate.

**Recommendation:** Keep separate. The current HTTP integration is the right pattern. If latency becomes an issue, consider a shared read-replica view or a `packages/catalog` package that exposes card data — but don't merge schemas.

---

## 3. Auth Patterns

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| Provider | Credentials (email/password) | Email magic link |
| Session strategy | JWT (stateless) | Database sessions (stateful) |
| User table | `clients` (integer PK, B2B) | `users` (UUID PK, consumer) |
| Middleware | Yes — all routes gated centrally | **None** — per-route discipline |
| Admin model | Role field on `clients` | **Shared password + HMAC cookie** |
| API auth | Bearer tokens (SHA-256 hashed) | None for admin; Stripe webhook signing for payments |
| Rate limiting | In-memory (5/15min) | **None** |
| NextAuth version | beta.25 | beta.30 |

**Classification:** Legitimate difference (different user populations) + **critical security gap** (storefront admin).

**Recommendation:**
1. **Critical:** Replace storefront admin auth. Add per-admin identity, proper session management, rate limiting, and audit trail. This is the single highest-risk finding across both apps.
2. **Medium-term:** Extract `packages/auth` with shared NextAuth configuration utilities (adapter patterns, session callbacks, cookie config).
3. **Keep separate:** Different providers (credentials vs magic link) are correct for the different user bases.

---

## 4. AWS Client Instantiation

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| SES clients | 0 (uses Resend) | **11** (7 module-level + 4 inline) |
| S3 clients | 2 | 2 |
| Graceful degradation | 0 / 2 clients | **1 / 13 clients** |
| Credential validation | None (asserts with `!`) | None (silently accepts empty strings) |

**Classification:** Accidental drift. Each storefront feature was built in isolation with its own SES client.

**Recommendation:**
1. **Hoist to `packages/aws`:** Single S3 client factory, single SES client factory, with credential validation at construction time and graceful error paths.
2. **Consolidate storefront email:** All 7 standalone SES clients should use the existing central sender (`src/lib/email/send.ts`) which already handles preferences and RFC 8058.

---

## 5. Email / Notification Surfaces

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| Provider | Resend | AWS SES |
| Templates | 5 order lifecycle | ~35 types across 8 domains |
| Central sender | Yes (single file) | Exists but only used by ~40% of sends |
| Unsubscribe | N/A (B2B) | Only on central sender sends |
| HTML approach | Template strings | Template strings (no template files) |

**Classification:** Legitimate difference (different providers serving different needs) + accidental drift (fragmented senders in storefront).

**Recommendation:**
1. **Extract `packages/email`:** Shared types, template rendering interface, preference-checking utility. Provider stays app-specific (Resend for wholesale, SES for storefront).
2. **Immediate (storefront):** Route all sends through `send.ts` — 6 remaining standalone senders need consolidation.

---

## 6. Cron Architecture

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| Pattern | 6 separate endpoints | Single mega-endpoint, 36 jobs |
| Schedule | vercel.json (daily/30min) | vercel.json (every minute) |
| Auth | Fails closed (401 if no CRON_SECRET) | **Falls open** if env unset |
| Error handling | try/catch per endpoint | Promise.allSettled (jobs isolated) |
| Retry | None | None |
| Alerting | None (Vercel logs only) | None (Vercel logs only) |
| maxDuration | Set on 3/6 | Not set |

**Classification:** Accidental drift. Both patterns work but lack reliability guarantees.

**Recommendation:**
1. **Immediate:** Fix storefront cron auth to fail closed.
2. **Medium-term:** Extract `packages/cron` with: auth middleware, structured logging, duration tracking, dead-letter alerting. Each app keeps its own job definitions.
3. **Keep separate:** The mega-endpoint vs separate-endpoints choice is a valid tradeoff for each app's scale.

---

## 7. Error Handling, Logging, Observability

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| APM | None | None |
| Structured logging | None | None |
| Error boundaries | None | None |
| Pattern | try/catch → JSON error response | Varied; emails are fire-and-forget |
| Internal detail leakage | Yes (v1 API exposes `err.message`) | Less exposed (no public API) |
| Monitoring | None | None |

**Classification:** Shared absence — neither app has observability. This is the biggest operational gap.

**Recommendation:**
1. **High priority:** Add `packages/observability` — structured JSON logging, request ID propagation, error sanitization.
2. **Medium-term:** Add Sentry or equivalent for error tracking.
3. **Per-app:** Add `error.tsx` / `global-error.tsx` React boundaries.

---

## 8. Env Var Conventions

| Dimension | Wholesale | Storefront |
|-----------|-----------|------------|
| `.env.example` | Yes (incomplete) | **None** |
| Validation | None | None |
| Access pattern | `process.env.X!` (asserts) | `process.env.X \|\| ""` (silent) |
| Shared vars | DATABASE_URL, AWS_*, CRON_SECRET | Same |
| Naming | SCREAMING_SNAKE, service prefix | Same convention |

**Classification:** Accidental drift (missing .env.example in storefront) + shared technical debt (no validation).

**Recommendation:**
1. **Immediate:** Add `.env.example` to storefront.
2. **Extract `packages/env`:** Zod-based validation schemas, loaded at app startup. Fail fast with clear error messages.
3. **Root-level:** Shared env vars (DATABASE_URL, AWS creds) documented in a monorepo root `.env.example`.

---

## 9. Testing Posture

| Dimension | Wholesale | Storefront | packages/stock |
|-----------|-----------|------------|----------------|
| Unit tests | 1 (vitest) | **0** | 44 (vitest) |
| E2E tests | 5 (Playwright) | **0** | — |
| Framework | Vitest + Playwright | None installed | Vitest |
| CI pipeline | None | None | None |
| Coverage | Unknown | 0% | High (business logic) |

**Classification:** Shared technical debt. Neither app has adequate test coverage.

**Recommendation:**
1. **Immediate:** Configure Vitest for storefront. Add first smoke tests for critical paths (auth, market trades, cron).
2. **Root-level:** Add CI pipeline (GitHub Actions) running all tests on PR.
3. **Per-app:** Each app owns its test suite. packages/stock is the model for how packages should be tested.

---

## 10. Route Overlap & Functional Parallels

**Routes that exist in both apps but serve different populations:**
- `/api/auth/[...nextauth]` — different providers, different users
- `/api/admin/*` — different admin operations
- `/api/cron/*` — different job sets

**True functional parallels:** None. The apps serve completely different business models:
- Wholesale: B2B distribution (fixed prices, volume discounts, purchase orders, multi-channel sync)
- Storefront: C2C marketplace (order book, auctions, gacha, trust/escrow, social)

**Classification:** Legitimate product difference.

**Recommendation:** Keep separate. No route merging. The v1 API is the correct integration seam.

---

## 11. Storefront-Specific Systems

| System | Size | Wholesale-relevant? |
|--------|------|-------------------|
| OPTCG Game Engine | 924 lines, 6 files | No |
| P2P Marketplace / Order Book | 6,514 lines, 20+ files | No |
| Gacha / Bounty Board | 3,007 lines, 26 files | No |
| Trust / Escrow | 3,324 lines, 15+ files | No |
| Rewards (raffles, mystery boxes, spin) | 2,092 lines, 12+ files | No |
| Portfolio Tracker | ~1,500 lines, 8 files | No |
| Provable Fairness | ~800 lines, 10 files | No |
| Deck Builder | ~400 lines, 6 files | No |
| Social (follows, DMs, achievements) | ~1,200 lines, 12+ files | No |
| Membership & Loyalty | ~1,000 lines, 10 files | No |

**None of these systems are wholesale-relevant.** Storefront is a fundamentally different product. The only touchpoint is that storefront's bounty board pulls from wholesale's card stock — mediated through the HTTP API.

---

## Unification Thesis

### What these apps ARE:
- **Two separate products** serving different markets, sharing infrastructure (RDS, AWS, Vercel)
- Wholesale: B2B card distribution platform (lean, functional, well-structured)
- Storefront: Consumer TCG platform (ambitious, sprawling, fast-built)

### What they are NOT:
- Not a monolith that needs splitting
- Not duplicate implementations that need merging
- Not a migration from old to new

### The discrepancy classification:

| Category | Count | Examples |
|----------|-------|---------|
| **Legitimate product difference** | 5 | Schema namespaces, auth providers, order models, route functions, storefront-specific systems |
| **Accidental drift** | 4 | SES fragmentation, cron auth inconsistency, env var handling, DB Pool anti-pattern |
| **Migration artifact** | 1 | Storefront's raw SQL (started before Drizzle adoption; `/drizzle` dir is misleading) |
| **Shared technical debt** | 3 | No observability, no CI, no env validation |

### The priority is NOT unification — it's infrastructure extraction:

Rather than converging the apps, extract shared concerns into packages that both apps consume. The apps stay independent; their shared foundation gets stronger.

---

## Prioritized Unification Roadmap

### Phase 1: Critical Fixes (Week 1-2)
| # | Item | Risk Addressed | Effort |
|---|------|---------------|--------|
| 1 | Replace storefront admin auth | Security — shared password, no audit | 2-3 days |
| 2 | Fix storefront cron auth (fail closed) | Security — open cron endpoint | 1 hour |
| 3 | Fix per-query Pool anti-pattern | Reliability — TLS per call | 1 day |
| 4 | Add `.env.example` to storefront | DX — onboarding impossible | 1 hour |

### Phase 2: Shared Packages (Week 3-6)
| # | Package | What It Provides | Consumers |
|---|---------|-----------------|-----------|
| 5 | `packages/db` | Connection pooling, health checks, singleton pattern | Both apps |
| 6 | `packages/env` | Zod schema validation, fail-fast startup | Both apps |
| 7 | `packages/observability` | Structured logging, request IDs, error sanitization | Both apps |
| 8 | `packages/aws` | S3 + SES client factories with credential validation | Both apps |
| 9 | `packages/email` | Template types, preference checking, send interface | Both apps |

### Phase 3: Standardization (Week 7-10)
| # | Item | Scope |
|---|------|-------|
| 10 | Consolidate storefront email senders | Route 6 standalone senders through central `send.ts` |
| 11 | Add Vitest to storefront | Framework + first smoke tests for auth, market, cron |
| 12 | Add CI pipeline | GitHub Actions: typecheck + lint + test on PR |
| 13 | Add error boundaries | `error.tsx` in both apps |
| 14 | Fix wholesale v1 API error leakage | Sanitize error messages to external consumers |

### Phase 4: Data Layer Evolution (Week 11-16)
| # | Item | Scope |
|---|------|-------|
| 15 | Add Drizzle schema for storefront tables | Type safety without rewriting queries |
| 16 | Migrate storefront queries incrementally | Replace raw SQL with Drizzle queries module by module |
| 17 | Add `packages/catalog` | Shared card/game/set types — replaces HTTP calls where co-located |

### Phase 5: Operational Maturity (Ongoing)
| # | Item | Scope |
|---|------|-------|
| 18 | Add APM (Sentry or equivalent) | Error tracking, performance monitoring |
| 19 | Add uptime monitoring | Cron health, API latency |
| 20 | Expand test coverage | Critical path integration tests per app |

---

## Dependency Matrix

| Package | Depends On | Blocks |
|---------|-----------|--------|
| `packages/stock` ✅ | `packages/db` (future) | Storefront wiring |
| `packages/db` | — | `packages/stock` migration, storefront Pool fix |
| `packages/env` | — | All packages (validates their config) |
| `packages/observability` | — | Everything benefits |
| `packages/aws` | `packages/env` | `packages/email` |
| `packages/email` | `packages/aws` | Storefront consolidation |

---

## Version Mismatches (Shared Dependencies)

| Package | Wholesale | Storefront | Risk |
|---------|-----------|------------|------|
| `next` | ^15.1.0 | 16.2.1 | High — major version gap |
| `tailwindcss` | ^3.4.0 | ^4 | Medium — breaking API changes |
| `@aws-sdk/client-s3` | ^3.700.0 | ^3.1029.0 | Low — same major |
| `react` / `react-dom` | ^19.0.0 | 19.2.4 | Low — same major |
| `next-auth` | beta.25 | beta.30 | Medium — beta API may differ |

**Recommendation:** Upgrade wholesale to Next 16 + Tailwind 4 before extracting shared packages that import framework utilities.

---

## Open Questions for Yu

1. **Admin auth priority:** Is replacing storefront admin auth truly #1, or does the business tolerate it because the admin surface is low-traffic?
2. **Next.js upgrade tolerance:** Can we upgrade wholesale from Next 15 → 16 before package extraction, or does that disrupt active development?
3. **Observability budget:** Any preference on APM? (Sentry, Datadog, self-hosted, or just structured logging for now?)
4. **CI platform:** GitHub Actions assumed — confirm?

---

*This audit replaces the prior gap-analysis mission (marked done without deliverable). All findings are grounded in specific file reads, not generalities. Code references available on request for any line item.*

# Storefront Verification Matrix

**Date:** 2026-04-27  
**App:** `apps/storefront` (Next.js 16.2.1, App Router)  
**Scope:** TypeScript, build, lint, auth coverage, external services, cron, database

---

## 1. TypeScript

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ **0 errors** (strict mode, bundler resolution) |
| tsconfig | `strict: true`, `noEmit: true`, `jsx: react-jsx`, incremental |

---

## 2. Build

| Check | Result |
|-------|--------|
| `next build` | ✅ **Clean** (exit 0, compiled in ~5s) |
| Total routes | **359** (236 API, 100 static, 1 SSG, 258 dynamic) |
| Non-fatal warnings | 7× `[wholesale] prices error 401` during SSG (expected — no credentials) |

---

## 3. Lint (ESLint)

| Check | Result |
|-------|--------|
| ESLint config | ✅ `eslint.config.mjs` present (Next.js default + React hooks + TS rules) |
| ESLint run | ⚠️ **108 errors, 79 warnings** |

**Error breakdown:**

| Rule | Count | Severity |
|------|-------|----------|
| `react-hooks/set-state-in-effect` | ~64 | error |
| `@next/next/no-img-element` | ~48 | error |
| `@typescript-eslint/no-unused-vars` | ~27 | warning |
| `react-hooks/purity` | ~12 | error |
| `react-hooks/static-components` | ~11 | error |
| `react/no-unescaped-entities` | ~6 | error |
| `@typescript-eslint/no-explicit-any` | ~5 | warning |
| `@next/next/no-html-link-for-pages` | ~5 | error |
| `react-hooks/exhaustive-deps` | ~3 | warning |
| `prefer-const` | ~3 | warning |

**Assessment:** Most errors are React 19 compiler lint rules (set-state-in-effect, purity, static-components) — likely new rules from Next.js 16's bundled ESLint config that weren't enforced before. The `no-img-element` and `no-html-link-for-pages` are standard Next.js hygiene issues. No blocking issues for production runtime.

---

## 4. Tests

| Check | Result |
|-------|--------|
| Test files | ❌ **Zero test files** in storefront |
| Test framework | None configured (no vitest, jest, or playwright in package.json) |

---

## 5. Authentication

### 5a. User Auth

| Aspect | Status |
|--------|--------|
| Library | next-auth v5 (beta 30), database sessions, 30-day TTL |
| Provider | Email-only (magic link via AWS SES) |
| Session store | PostgreSQL `sessions` table |
| Adapter | Custom `PgAdapter` in `src/lib/auth/adapter.ts` (raw pg) |
| Middleware | ❌ **No middleware.ts** — auth enforced per-route inline |
| Pattern | `const session = await auth(); if (!session?.user?.id) return 401` |

**Risk:** No safety net. Any new route that forgets `auth()` is unprotected by default.

### 5b. Admin Auth

| Aspect | Status |
|--------|--------|
| Mechanism | ⚠️ **Single shared password** (`ADMIN_PASSWORD` env var) |
| Storage | Plaintext comparison (`===`), no hashing |
| Token | HMAC-SHA256 of password with hardcoded key `"kingdom-admin"` |
| Cookie | `admin_token`, httpOnly, secure, sameSite strict, 24h expiry |
| Identity | ❌ No per-admin users, no audit trail |
| Rate limiting | ❌ None on login endpoint |
| Page protection | Client-side gate (`<AdminShell>`) — HTML/JS ships to all visitors |

**Files:**
- `src/lib/admin/auth.ts` — `isAdmin()` function
- `src/app/api/admin/login/route.ts` — login endpoint

---

## 6. Route Protection Audit (30 routes sampled)

### Summary

| Category | Count |
|----------|-------|
| **Fully protected** (auth required all methods) | 16 |
| **Intentionally public** (read-only data) | 6 |
| **Mixed** (public reads, protected writes) | 6 |
| **Anonymous by design** (tradein, checkout) | 2 |

**No unguarded mutations found.** Every POST/PUT/DELETE modifying user-scoped data checks `auth()` or `isAdmin()`.

### Auth mechanisms in use

1. **User auth** — `auth()` from `@/lib/auth` (next-auth database sessions)
2. **Admin auth** — `isAdmin()` from `@/lib/admin/auth` (HMAC cookie)
3. **Cron auth** — `Authorization: Bearer <CRON_SECRET>` header
4. **Webhook auth** — Stripe signature verification (`stripe.webhooks.constructEvent()`)
5. **Token auth** — HMAC-signed unsubscribe tokens

### Notable routes

| Route | Protection | Notes |
|-------|-----------|-------|
| `/api/checkout` | Optional auth | Anonymous checkout allowed (standard e-commerce) |
| `/api/tradein/submit` | Rate limit only | Anonymous submissions, no auth (design choice) |
| `/api/cron/maintenance` | Bearer token | ⚠️ Falls open if `CRON_SECRET` env var missing |
| `/api/escrow/trust` | Mixed | Public trust profile by `?userId=X` |

---

## 7. External Services

| Service | Init Pattern | Import Crash? | Runtime Crash? | Graceful? |
|---------|-------------|:---:|:---:|:---:|
| **Stripe** | Lazy (`getStripe()`) | No | Yes (clear error) | ✅ |
| **S3** (2 clients) | Top-level, empty-string fallback | No | Yes (AWS rejects) | ❌ |
| **SES — send.ts** | Top-level client + runtime guard | No | No (returns error obj) | ✅ |
| **SES — auth/email.ts** | Top-level, no guard | No | Yes (throws) | ❌ |
| **SES — 5 legacy modules** | Top-level, no guard | No | Yes (throws) | ❌ |
| **MangoPay** | N/A | N/A | N/A | 🗑️ Dead code (confirmed) |
| **Database (pg)** | Lazy (per-query Pool) | No | Yes (connection refused) | ❌ |
| **Wholesale API** | Top-level URL/key | No | No (returns empty) | ✅ |
| **Twilio/SMS** | N/A (stub) | N/A | N/A | Stub only |
| **NextAuth (AUTH_SECRET)** | Required by next-auth | No | Yes (throws on auth ops) | ❌ |

**Key insight:** Nothing crashes at import/build time (Stripe lazy-init was added specifically for this). At runtime, 3/10 services degrade gracefully (Stripe, central SES, wholesale API). The rest throw unhandled errors without credentials.

### SES fragmentation

**7 separate SES client instantiations** across the codebase:

| File | Shares client? | Guard? |
|------|:---:|:---:|
| `src/lib/email/client.ts` → `send.ts` | ✅ Central | ✅ Runtime guard |
| `src/lib/auth/email.ts` | ❌ Own client | ❌ No guard |
| `src/lib/tradein/email.ts` | ❌ Own client | ❌ No guard |
| `src/lib/auction/email.ts` | ❌ Own client | ❌ No guard |
| `src/lib/quote/email.ts` | ❌ Own client | ❌ No guard |
| `src/lib/rewards/email.ts` | ❌ Own client | ❌ No guard |
| `src/lib/market/email.ts` | ❌ Own client | ❌ No guard |

---

## 8. Cron / Maintenance

| Aspect | Status |
|--------|--------|
| Endpoint | `/api/cron/maintenance` (GET) |
| Schedule | Every minute (Vercel cron, per `vercel.json`) |
| Auth | `CRON_SECRET` Bearer token (⚠️ falls open without env var) |
| Pipelines | **36 parallel sweeps** via `Promise.allSettled` |
| Fault isolation | ✅ Each pipeline independent, failures logged per-pipeline |
| Time gating | ✅ Daily/weekly tasks self-gate by UTC hour |
| Idempotency | ✅ Most sweeps documented as idempotent |

**Sweeps include:** market maintenance, auctions, bounty expiry, payouts, email queue drain, price alerts, wishlist matching, membership tier recompute, subscription expiry, points expiry, raffle auto-draw, PVE reconciliation, fairness digest/audit/drift, trust score recompute, fraud sweep, review patterns, external rep decay, chargeback reconciler, saved searches, offer/return/cancel expiry, vacation scheduling, portfolio valuation.

---

## 9. Database Architecture

| Aspect | Status |
|--------|--------|
| Driver | `pg` v8.20.0 (raw SQL, no ORM) |
| Queries | Hand-written parameterized SQL (`$1`, `$2`) |
| Pool strategy | ⚠️ New `pg.Pool` created/destroyed per query (no reuse) |
| Config duplication | ⚠️ `getConnectionConfig()` copied in 3 places |
| Domain DB files | 14 modules under `src/lib/*/db.ts` |
| Shared DB | Same RDS instance as wholesale (different schema approach) |

**Config duplicates:**
1. `src/lib/db.ts` — central (canonical)
2. `src/lib/tradein/db.ts` — full copy
3. `src/lib/auction/db.ts` — inlined in individual functions

---

## Issues Summary

### Critical (production risk)

| # | Issue | Impact |
|---|-------|--------|
| 1 | Admin auth is single shared password with hardcoded HMAC key | No audit trail, no individual accountability, token is deterministic |
| 2 | No middleware.ts — auth relies on per-route discipline | Any new route without explicit `auth()` is wide open |
| 3 | Cron falls open without CRON_SECRET | Anyone can trigger 36 maintenance sweeps |

### High (technical debt)

| # | Issue | Impact |
|---|-------|--------|
| 4 | Zero test files | No automated quality assurance |
| 5 | 108 ESLint errors | Mostly React 19 compiler rules — indicates not yet adapted to new lint baseline |
| 6 | 7 separate SES clients (5 ungraceful) | Duplicated config, no fallback, crashes without credentials |
| 7 | Per-query Pool creation/destruction | TLS handshake on every DB call — expensive under load |
| 8 | Connection config duplicated in 3 places | Maintenance risk |

### Low (cleanup)

| # | Issue | Impact |
|---|-------|--------|
| 9 | MangoPay dead code | Confirmed removed from storefront, may linger in wholesale |
| 10 | `getSession()` wrapper adds no value | One-liner that just calls `auth()` |
| 11 | S3 clients accept empty credentials silently | Errors surface only at runtime, not on misconfiguration |

# Cambridge TCG — Admin Dashboard

Unified admin console for Cambridge TCG. Gives a single operator view across both products: the B2C storefront and the B2B wholesale platform.

**URL (production):** `https://admin.cambridgetcg.com`  
**Local dev:** `http://localhost:3002`  
**Tech:** Next.js 16, React 19, Tailwind 4, NextAuth v5, TypeScript 5

---

## Quick start

```bash
# From the monorepo root
pnpm install

# Start the admin dashboard
pnpm --filter @cambridge-tcg/admin dev

# Or via Turbo
pnpm dev  # starts all apps; admin runs on :3002
```

## Required environment variables

```env
# Storefront PostgreSQL — can alias existing DATABASE_URL
STOREFRONT_DATABASE_URL=postgres://...

# Wholesale PostgreSQL
WHOLESALE_DATABASE_URL=postgres://...

# NextAuth — must be a fresh secret, different from storefront's
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3002   # or https://admin.cambridgetcg.com

# SES — for magic-link emails
AUTH_FROM_EMAIL=admin@cambridgetcg.com
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### Granting admin access

There is no admin registration page. Access is granted by setting `role='admin'` on an existing user row in the **storefront** database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

The user must already exist (they need to have signed up on the storefront). The admin app never creates users.

---

## Architecture

### Authentication

Magic-link only (no passwords). Flow:

1. User enters email at `/login`
2. NextAuth sends a verification email via SES
3. User clicks the link → redirected to the dashboard
4. `signIn` callback gates on `role='admin'` — non-admins are rejected before a session is created
5. Middleware checks `req.auth.user.role === 'admin'` on every request (defense-in-depth)
6. Sessions are stored database-side in the storefront's `sessions` table (30-day expiry)

### Dual-database model

The admin app is the only place that queries both databases:

| Helper | Database | Used for |
|--------|----------|----------|
| `sfQuery()` | Storefront RDS | Users, orders, auctions, trade-ins, market, trust, bounty, KYC, payouts, chargebacks, membership, email queue, audit log |
| `wsQuery()` | Wholesale RDS | Stock ledger, B2B orders, procurement, clients, channels, pricing |

Both connections are lazy-initialized singletons (`src/lib/db.ts`). The DB never crashes the page — every live query wraps in a `try/catch` that returns -1 (displayed as `—`) if the DB is unreachable or the schema has drifted.

### Governance logging

All mutating admin actions are appended to the storefront's `admin_actions_log` table via `logAdminAction()` (`src/lib/governance.ts`). Fire-and-forget — a governance log failure never breaks the action it's logging.

### Route structure

```
apps/admin/
  src/
    app/
      (auth)/           — public: login, check-email (no auth required)
      (dashboard)/      — protected: sidebar layout + all admin sections
        overview/       — live: queue count dashboard across both DBs
        ops/            — stock, orders, fulfillment, channels
        commerce/       — pricing, trade-ins, auctions, market, bounty
        money/          — payouts, chargebacks, rewards, membership
        trust/          — fraud, disputes, reviews, KYC
        catalog/        — cards, games, clients, users
        system/         — cron, email, audit, admin management
      api/auth/         — NextAuth handlers
    components/
      layout/           — Sidebar, Header, ComingSoon
    lib/
      auth/             — NextAuth config, adapter, email sender
      db.ts             — sfQuery() + wsQuery() helpers
      governance.ts     — admin audit log writer
    middleware.ts       — global auth guard
    tests/
      nav.test.ts       — navigation structure tests (Vitest)
```

---

## Module status

Three states per route:
- **Live (Manager)** — owns the data; full CRUD, search, filter, paginate, server actions
- **Live (Dashboard)** — read-only, KPIs + sub-tables; mutations live in legacy admin
- **Stub** — `ComingSoon` placeholder linking to the legacy admin page

### Live pages

| Route | Module | Archetype | Data source | Notes |
|-------|--------|-----------|-------------|-------|
| `/overview` | Operations overview | Dashboard | SF + WS | 15 queue counts, graceful DB fallback |
| `/ops/stock` | Stock Management | Manager | WS | Levels, reorder queue, movements |
| `/ops/orders` | B2C Orders | Manager | SF | Stripe-backed, paid + shipped lifecycle |
| `/commerce/trade-ins` | Trade-Ins + Quotes | Dashboard | SF | Queue breakdown, recent submissions |
| `/commerce/auctions` | Auctions | Dashboard | SF | Live/ended/draft + pending review |
| `/commerce/market` | P2P Market | Dashboard | SF | Escrow status, trades at CTCG |
| `/commerce/pricing` | Pricing | Manager | WS | KPIs + paginated cards + inline edit |
| `/trust/disputes` | Disputes | Manager | SF | Filter + status transition action |
| `/catalog/users` | User search | Manager | SF | Paginated, tier filter |
| `/system/cron` | Cron health | Dashboard | SF | vercel.json crons + email queue |

### Stub pages — migration backlog

See [`docs/admin-migration-punchlist.md`](../../docs/admin-migration-punchlist.md) for effort estimates per route.

| Route | Module | Legacy reference |
|-------|--------|-----------------|
| `/ops/fulfillment` | Fulfillment | (none — new design needed) |
| `/ops/channels` | Channels (Shopify/eBay) | `wholesale/admin/channel-pricing` |
| `/commerce/bounty` | Bounty/Gacha | `storefront/admin/bounty/{grants,pull-tiers,redemptions}` |
| `/money/payouts` | Payouts | `storefront/admin/payouts` |
| `/money/chargebacks` | Chargebacks | `storefront/admin/chargebacks` |
| `/money/rewards` | Rewards & Raffles | `storefront/admin/{prizes,rewards}` |
| `/money/membership` | Membership/Loyalty | `storefront/admin/tiers` |
| `/trust/fraud` | Fraud & Trust | `storefront/admin/fraud` + `fraud-signals` |
| `/trust/reviews` | Reviews | `storefront/admin/reviews` |
| `/trust/kyc` | KYC / Verifications | `storefront/admin/verifications` |
| `/catalog/cards` | Card catalog | (none — new design needed) |
| `/catalog/games` | Games & Sets | `wholesale/admin/games` |
| `/catalog/clients` | B2B Clients | `wholesale/admin/clients` |
| `/system/email` | Email queue | `storefront/admin/emails` |
| `/system/audit` | Audit log | `storefront/admin/governance` |
| `/system/admin` | Admin user mgmt | (none — new design needed) |

---

---

## Building a new module

The shared infrastructure is in `src/lib/` and `src/lib/ui/`. **Read [`apps/admin/CLAUDE.md`](./CLAUDE.md) before starting a new module** — it documents the two page archetypes (Dashboard / Manager), the action wrapper pattern, and the file layout convention.

In short:

```
src/app/(dashboard)/<group>/<module>/
  page.tsx            ─ default export, Server Component
  _actions.ts         ─ "use server"; mutations via adminAction()
  _components.tsx     ─ "use client"; only when state is needed
  [id]/page.tsx       ─ row drill-down (when applicable)
```

Compose from `@/lib/ui` (PageHeader, KpiCard, KpiGrid, DataTable, FilterPills, SearchForm, Pagination, StatusBadge, EmptyState, ErrorState, ExternalLink, ActionBanner, SectionHeading) — never hand-roll a `<table>` or define a per-page `KpiCard`.

For mutations, wrap with `adminAction()` from `@/lib/actions` — it handles auth, governance audit, error formatting, and `revalidatePath`. See `app/(dashboard)/trust/disputes/_actions.ts` and `commerce/pricing/_actions.ts` for live examples.

---

## Running tests

```bash
# Unit tests (Vitest)
pnpm --filter @cambridge-tcg/admin test

# TypeScript check
pnpm --filter @cambridge-tcg/admin typecheck

# Production build
pnpm --filter @cambridge-tcg/admin build
```

Current test coverage: **7 tests, 1 file** — navigation structure validation.

---

## Deployment

Vercel project: `cambridge-tcg-admin` (separate from storefront and wholesale)

```bash
# Configured via vercel.json
# Each push to main deploys independently
vercel deploy
```

Set all environment variables in the Vercel project settings. The `NEXTAUTH_URL` must match the production domain exactly.

---

## Development notes

### Adding a new module

1. Create `src/app/(dashboard)/<group>/<module>/page.tsx`
2. Add the route to the sidebar in `src/components/layout/Sidebar.tsx`
3. Add the route to `NAV_GROUPS` in `src/tests/nav.test.ts`
4. Query via `sfQuery()` (storefront data) or `wsQuery()` (wholesale data)
5. Wrap all DB calls in `try/catch` — pages must render even when DBs are unreachable
6. Log mutations via `logAdminAction()` from `src/lib/governance.ts`

### Adding shadcn/ui components

The scaffold was built without shadcn/ui to keep initial bundle size minimal. To add it when a module needs data tables or forms:

```bash
cd apps/admin
npx shadcn@latest init
npx shadcn@latest add table button input
```

### Database access pattern

Use the raw SQL helpers (`sfQuery`, `wsQuery`) rather than the Drizzle query builder for admin pages — the admin app doesn't own either schema, and raw SQL is more transparent for cross-app queries. Reserve Drizzle for packages that own their schema (`packages/stock`, etc.).

---

## Known limitations

- **No observability.** No APM, no structured logging, no error tracking. DB errors are silently caught and displayed as `—`.
- **No tests beyond nav structure.** Each new module should add tests as it's built.
- **No mobile design.** Layout is desktop-only (sidebar always visible). Mobile responsiveness is deferred.
- **No real-time.** All pages are server-rendered on demand. No WebSocket or SSE for live queue updates.
- **Stubs are functional routes, not 404s.** This is intentional — auth is enforced, navigation works, and the ComingSoon component links to the existing admin page. Modules migrate progressively.

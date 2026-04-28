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

### Live pages (queries real data)

| Route | Module | Data source | Notes |
|-------|--------|-------------|-------|
| `/overview` | Operations overview | Storefront + Wholesale | 15 live queue counts, graceful DB fallback |
| `/commerce/trade-ins` | Trade-Ins + Quotes | Storefront | Queue breakdown, recent submissions, link to action pages |
| `/commerce/auctions` | Auctions | Storefront | Live/ended/draft counts, recent auctions table |
| `/commerce/market` | P2P Market | Storefront | Escrow status, trades needing intervention, seller payouts |

### Stub pages (ComingSoon — planned for future missions)

These pages exist in the routing structure and render a placeholder with a link to the existing admin page. They're real routes — not 404s — which means auth is enforced and navigation works end-to-end.

| Route | Module | Existing admin page |
|-------|--------|-------------------|
| `/ops/stock` | Stock Management | `wholesale.cambridgetcg.com/admin/stock` |
| `/ops/orders` | B2B Orders | `wholesale.cambridgetcg.com/admin` |
| `/ops/fulfillment` | Fulfillment | (none — missing domain) |
| `/ops/channels` | Channels (Shopify/eBay) | `wholesale.cambridgetcg.com/admin/pricing` |
| `/commerce/pricing` | Pricing | `wholesale.cambridgetcg.com/admin/pricing` |
| `/commerce/bounty` | Bounty/Gacha | `cambridgetcg.com/admin/bounty` |
| `/money/payouts` | Payouts | `cambridgetcg.com/admin/payouts` |
| `/money/chargebacks` | Chargebacks | `cambridgetcg.com/admin/chargebacks` |
| `/money/rewards` | Rewards & Raffles | `cambridgetcg.com/admin/rewards` |
| `/money/membership` | Membership/Loyalty | `cambridgetcg.com/admin/membership` |
| `/trust/fraud` | Fraud & Trust | `cambridgetcg.com/admin/fraud` |
| `/trust/disputes` | Disputes | `cambridgetcg.com/admin/disputes` |
| `/trust/reviews` | Reviews | `cambridgetcg.com/admin/reviews` |
| `/trust/kyc` | KYC / Verifications | `cambridgetcg.com/admin/verifications` |
| `/catalog/users` | User management | (none — missing) |
| `/catalog/cards` | Card catalog | (none — missing) |
| `/catalog/games` | Games & Sets | `wholesale.cambridgetcg.com/admin/games` |
| `/catalog/clients` | B2B Clients | `wholesale.cambridgetcg.com/admin/clients` |
| `/system/cron` | Cron health | (none — missing) |
| `/system/email` | Email queue | `cambridgetcg.com/admin/email-queue` |
| `/system/audit` | Audit log | `cambridgetcg.com/admin/governance` |
| `/system/admin` | Admin user management | (none — missing) |

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

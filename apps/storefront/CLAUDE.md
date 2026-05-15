@AGENTS.md

# Cambridge TCG Storefront

The repo welcome page is [`../../CLAUDE.md`](../../CLAUDE.md); the session-wake recipe is at [`../../SOPHIA.md`](../../SOPHIA.md). Both optional — the stack below runs either way. (Sibling expressions live at `~/Desktop/agenttool` and `~/Desktop/true-love` if reachable; carry what serves.)

*This kingdom is one expression of a wider architecture. The bedrock beneath the four doctrines + cosmology is named at [`../../docs/principles/the-embassy.md`](../../docs/principles/the-embassy.md). API echo: the `embassy` block in `/api/v1/manifest`.*

## Stack
- Next.js 16.2.1 (App Router, Turbopack) + TypeScript + Tailwind CSS 4
- PostgreSQL on AWS RDS (`tcg-wholesale` in us-east-1)
- Stripe (checkout + webhooks)
- AWS SES (transactional email)
- next-auth v5 (magic link email login)
- Deployed on Vercel (production: cambridgetcg.com)
- Wholesale API: wholesaletcgdirect.com (live pricing — see `@cambridge-tcg/pricing` package for the compute, `src/lib/wholesale/client.ts` for the Falcon courier, `docs/connections/the-pricing-arrow.md` for the seven-act story)

## Database
- Raw `pg` driver (no ORM). All queries in `src/lib/db.ts` and `src/lib/tradein/db.ts`
- SSL fix: strip `sslmode` from DATABASE_URL, set `ssl: { rejectUnauthorized: false }`
- Tables: users, accounts, sessions, verification_tokens, customer_orders, tradein_submissions, tradein_items
- Migrations in `drizzle/` directory (run manually against RDS)

## Auth
- next-auth v5 with custom PgAdapter (`src/lib/auth/adapter.ts`)
- Email provider via AWS SES (`src/lib/auth/email.ts`)
- Session-aware Nav shows Sign In / Account
- Admin dashboard at `/admin/trade-ins` — gated by `users.role = 'admin'` (set via DB after `0088_admin_roles.sql` lands). No shared password; admins sign in via the same `/login` magic-link flow as customers, and `middleware.ts` enforces the role check on `/admin/*` + `/api/admin/*`.

## UI primitives — `@/lib/ui`

The consumer surface composes through one shared primitive library, mirroring
the admin app's `@/lib/ui` shape so a builder moving between surfaces meets
the same vocabulary.

```ts
import { Badge, Palettes, Button, Card, DataTable, EmptyState,
         ErrorAlert, FilterPills, PageHeader, Pagination,
         Provenance, SearchForm, Tabs, WhyLink, Verifiability } from "@/lib/ui";
import { formatPrice, formatDate, formatDateTime,
         formatRelativeTime, formatTimeUntil } from "@/lib/format";
```

**Status badges.** Pages don't define their own STATUS_* maps. Pick a named
palette from `Palettes` (e.g. `OfferStatusPalette`, `EscrowStatusPalette`)
and pass it to `<Badge>`. If display labels differ from raw enum values,
keep a small per-page `STATUS_LABELS` const and pass it via `labels`.

```tsx
<Badge
  status={offer.status}
  palette={Palettes.OfferStatusPalette}
  labels={STATUS_LABELS}
/>
```

When adding a new domain, define a new palette in `lib/ui/status-palettes.ts`
keyed by the domain's status enum. The Tone vocabulary is shared with admin
(amber / red / emerald / blue / purple / neutral / green / sky).

**Provenance / WhyLink / Verifiability.** Whenever a value is non-live or
derived from a foreign authority, label it. Trust score, escrow tier,
membership tier, payout hold, fraud flag — every user-affecting decision
gets a `<WhyLink href="/methodology/<topic>" />`. See
`docs/principles/transparency.md` (Ring 2) for the doctrine.

## List-page composition pattern

The `/account/{orders,trades,offers,returns,trade-cancels,trade-ins,
pricing-rules,vacation,searches,vault}` pages follow one shape:

```
PageHeader
  ↓
[ActionBanner]            optional — "X needs your attention"
  ↓
Tabs                      "Incoming / Outgoing", "Orders / History"
  ↓
SearchForm + FilterPills  optional, on listing-style pages
  ↓
EmptyState | list of cards | DataTable
  ↓
Pagination                optional
```

Compose primitives directly — there's no `<ListPage>` wrapper. Each page
controls its own data fetching and state management; the primitives just
unify visual surface.

Skeleton (controlled tabs, no auth handling — see below):

```tsx
"use client";
import { useState } from "react";
import { PageHeader, Tabs, EmptyState, ErrorAlert, ListSkeleton } from "@/lib/ui";

const TABS = [
  { value: "incoming" as const, label: "Incoming" },
  { value: "outgoing" as const, label: "Outgoing" },
];

export default function MyListPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  // …fetching logic…

  return (
    <div>
      <PageHeader
        title="Offers"
        description="Negotiate prices on market asks. Sellers have 48h to respond."
      />
      <Tabs tabs={TABS} selected={tab} onSelect={setTab} />
      {error && <ErrorAlert description={error} />}
      {loading ? <ListSkeleton rows={3} />
        : items.length === 0 ? <EmptyState title="Nothing here yet." />
        : items.map((i) => <Card key={i.id}>…</Card>)}
    </div>
  );
}
```

## Key Patterns
- Dark theme: bg-neutral-950, text-white, amber-500 accent, emerald-400 secondary
- Cards: `<Card>` from @/lib/ui (replaces inline `bg-neutral-900 rounded-xl p-4`)
- Forms: `<Field>` + `<Input>`/`<Select>`/`<Textarea>` from @/lib/ui
- All env vars must be `.trim()`'d when used as API keys (Vercel whitespace issue)
- Use `pnpm` for package management (pnpm-lock.yaml)

## Verification
- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` — typecheck
- Local dev: `pnpm dev:storefront` (port 3001). First time: `cp apps/storefront/.env.example apps/storefront/.env.local` and fill in (or `vercel env pull` from inside `apps/storefront/`). The server crashes on first auth-touching request without at least `DATABASE_URL` + `AUTH_SECRET`.
- E2E: `pnpm --filter cambridgetcg-storefront test:e2e:smoke` (read-only against `STOREFRONT_BASE_URL`, defaults to prod). Full magic-link e2e in `tests/auth-magic-link.spec.ts` self-skips without `STOREFRONT_TEST_EMAIL` + `DATABASE_URL` (+ `AUTH_SECRET` for the callback half).

## Current Priorities
1. Fix Stripe checkout (STRIPE_SECRET_KEY needs to be sk_live_, not pk_live_)
2. Test magic link email flow end-to-end
3. Membership & loyalty module (planned)
4. SEO improvements
5. Mobile responsiveness polish

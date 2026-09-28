@AGENTS.md

# Cambridge TCG Storefront

Read the shared [agent instructions](../../AGENTS.md) and local Next.js rules
above before changing code. The [app README](README.md) is the human setup and
architecture guide. [Culture and invitations](../../docs/agents/culture.md)
remain optional context.

This app serves card research, collections, community, public API discovery and
existing account/order records. New paid commerce is retired; preserve existing
settlement, cancellation, refunds and support. See the
[commerce boundary](docs/commercial-retirement.md).

## Stack
- Next.js 16.2.11 (App Router, Turbopack), React 19.2.4, TypeScript and Tailwind CSS 4; use the installed Next.js docs before editing framework code.
- PostgreSQL through shared `@cambridge-tcg/db` helpers; connection configuration belongs to the selected development or deployment environment.
- Stripe for preserved agreements, settlement and signed webhook processing; new checkout admission stays retired.
- Transactional email via `@cambridge-tcg/email`, with SES or SMTP selected per stream (`EMAIL_TRANSPORT`, `EMAIL_TRANSPORT_<STREAM>`); deployment state is separate from configuration. See the [email migration runbook](../../docs/ops-email-selfhost.md).
- next-auth v5 (email magic links, optional Google and GitHub OAuth)
- Vercel deployment configuration targets cambridgetcg.com; source and config alone do not verify the live revision.
- Legacy wholesale catalog access is in `src/lib/wholesale/client.ts`, with direct-database fallbacks in `src/lib/wholesale/db-source.ts`. Keep the returned source labels and `src/lib/public-wholesale-fields.ts` publication policy: available credentials or stored prices do not establish publication rights. Shared pricing calculations live in `@cambridge-tcg/pricing`.

## Database
- `src/lib/db.ts` exposes raw-SQL `query()` and `transaction()` through `@cambridge-tcg/db/compat`, backed by a shared postgres.js pool. Reuse these helpers and domain data-access modules; do not add another ORM or connection implementation.
- Connection and TLS options are owned by `packages/db/src/index.ts`. Inspect the chosen environment and owning helper instead of copying older per-query `pg.Pool` workarounds.
- Domain migrations and tables are mapped in the [storefront module guide](../../docs/modules/storefront/README.md).
- Append-only SQL migrations live in `drizzle/`; applying them needs a reviewed target and the relevant scoped authorization.

## Auth
- next-auth v5 with custom PgAdapter (`src/lib/auth/adapter.ts`) and 30-day database sessions.
- Email magic links use the transactional email transport (`src/lib/auth/email.ts`). Optional Google OAuth uses `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`; optional GitHub OAuth uses `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET`. GitHub registers only when both trimmed values are non-empty. `/login` discovers configured providers via `/api/auth/providers` and submits CSRF-protected full-page OAuth forms with a safe relative return path.
- GitHub (`src/lib/auth/github.ts`) requests only `read:user user:email`, verifies the authenticated email list (verified primary, otherwise a verified fallback), and links a matching verified email to an existing CTCG account. The immutable numeric GitHub ID preserves an existing link even after an email change. A first link is refused when its verified email differs from the active CTCG session's email; sign out before using a different account. This does not block an already-linked ID after an email change. Missing verification fails closed. The provider-level `account()` mapping omits GitHub tokens from persistence; the adapter stores the provider link with null token columns. Google policy is unchanged.
- GitHub callbacks: production `https://cambridgetcg.com/api/auth/callback/github`; development `http://localhost:3001/api/auth/callback/github` (prefer a separate development OAuth app). Creating apps, setting hosted secrets and deployment need separate authorization; see `docs/ops-deploy-runbook.md`.
- Adding a provider does not change registration admission (`src/lib/auth/admission.ts`): existing linked GitHub identities and verified same-email existing accounts can sign in while new registration is paused. New identities still need the existing admission policy. Email requests retain their generic, non-enumerating confirmation.
- Session-aware Nav shows Sign In / Account.
- Admin dashboard at `/admin/trade-ins` is gated by `users.role = 'admin'`. Admins use the same `/login` methods as customers; OAuth never grants a role. `proxy.ts` checks cookie presence, while `src/lib/auth/realms.ts` and `src/lib/admin/auth.ts` enforce page/API access.

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
        title="Existing offers"
        description="Review records and their current status."
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
- **The visual language is the quiet gallery** — `docs/plans/the-quiet-gallery.md` is
  the source of truth; read it before styling anything. Warm paper ground, ink type,
  hairline borders, one bronze accent; the card art is the only saturated color on a page.
- **Semantic tokens only** (Tailwind 4 `@theme` in `globals.css` + `themes.css`):
  surfaces `bg-page` / `bg-surface` / `bg-surface-subtle` / `bg-surface-elevated`,
  hairlines `border-border-subtle` (strong: `border-border-strong`), text hierarchy
  `text-ink` / `text-ink-muted` / `text-ink-faint`, accent `text-accent` /
  `bg-accent-wash` (active pill) / `bg-accent`, tones `ok` / `danger` / `warning` /
  `info`. **Never write raw palette classes** (`bg-neutral-*`, `text-amber-*`,
  `text-emerald-*`, `text-white`) — they don't respond to the wardrobe themes.
  Reference implementations: `src/components/market/MarketBrowser.tsx`,
  `src/app/market/[sku]/page.tsx`, the layout chrome in `src/components/layout/`.
- **Green buys, red sells** — always `text-bid` / `text-ask` (doctrine-narrow tokens),
  never generic ok/danger.
- **Buttons**: primary = solid ink (`bg-ink text-page rounded-lg`), the single
  strongest thing on a page; secondary = hairline border + ink text; danger = solid
  danger. No gradients, no glow, no emerald/amber CTAs.
- **Type**: headings + wordmark in `font-display` (Fraunces, weight 500–600, never 900;
  3xl is the ceiling outside the home hero); body inherits Schibsted Grotesk via
  `--font-body`; SKUs, card numbers, and prices in tables use `font-mono` (Spline Mono).
- **Two voices** (the manga gallery, spec 2026-07-07): Spline Mono is the *apparatus*
  voice — SKUs, plate numbers, provenance, deadlines, counts. Fraunces italic is the
  *narrator* — subtitles, benedictions, empty-state titles, doctrine captions. Emphasis
  is typographic, never loud.
- **Motion doctrine**: at most ONE hero-scale animation per page (home: the breathing
  gutter; celebrations: the speed-line settle). Entrance rises (`wardrobe-rise`) and
  hover transitions are free. Loops only for the hero breath and threshold-bob. New
  materials: `wardrobe-draw` / `-tone-*` / `-panel` / `-speedlines` / `-aura` / `-bob`
  (themes.css) — all theme-gated, all in the text-mode kill list, all clamp-safe.
- **Form**: `rounded-lg` standard (`rounded-xl` only modals + hero card); elevation via
  `shadow-mat` or the `.wardrobe-mat` helper only; focus = 2px accent outline, visible
  always, never removed; whitespace separates — hairlines, not boxes-in-boxes.
- **Emoji as UI chrome dies**; emoji that is content (user-generated text) stays.
- **What must survive any restyle**: Provenance / WhyLink / Verifiability /
  Consequences pills, Badge's 8-tone vocabulary, `body.text-mode`,
  `prefers-reduced-motion`, free `high-contrast`.
- Cards: `<Card>` from @/lib/ui (replaces inline surface + radius soup)
- Forms: `<Field>` + `<Input>`/`<Select>`/`<Textarea>` from @/lib/ui
- All env vars must be `.trim()`'d when used as API keys (Vercel whitespace issue)
- Use `pnpm` for package management (pnpm-lock.yaml)

## Verification
- From the repository root, `pnpm --filter cambridgetcg-storefront typecheck` checks types using the installed toolchain.
- Local dev: `pnpm dev:storefront --hostname 127.0.0.1` (port 3001). Supply only the required local fixtures or scoped development configuration. The shared layout imports database-backed auth, so `DATABASE_URL` must be configured; functional sign-in additionally needs a development auth secret and the relevant provider setup. The landing page itself makes no database/catalog query. See [local setup](README.md#run-locally).
- E2E: `STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke` is a GET-only auth check against an already-running local server. Playwright otherwise defaults to production. Full magic-link e2e in `tests/auth-magic-link.spec.ts` can send email and access the database; inspect its gates and obtain task-specific authorization before using external providers.

## Entry and module maintenance

Use the [module map](../../docs/modules/README.md) for purpose, recorded progress
and next review. Follow the user's assigned scope rather than treating a
recorded queue as authority to begin unrelated work.

The [entry design](../../docs/connections/the-entry-map.md) connects the visitor
landing, practical agent/API portal, shared navigation and compatibility
redirects. Keep those paths coherent when updating entry content. Update the
catalog and run `pnpm docs:modules` / `pnpm audit:modules` for module changes.

@AGENTS.md

# Cambridge TCG Storefront

The repo-wide principles are in [the root AGENTS.md](../../AGENTS.md); the
Next.js note above is imported from this folder's AGENTS.md. The
[app README](README.md) covers setup and architecture. These are practical
notes about this app.

This app serves card research, collections, community, the public API and
existing account and order records. New paid sales are off; existing
settlement, cancellation, refunds and support keep working (see the
[commerce note](docs/commercial-retirement.md)).

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4.
- PostgreSQL through the shared `@cambridge-tcg/db` helpers.
- Stripe for existing agreements, settlement and signed webhooks.
- Email through `@cambridge-tcg/email` on AWS SES; `EMAIL_TRANSPORT` and
  `EMAIL_TRANSPORT_<STREAM>` pick the transport per stream.
- next-auth v5: email magic links, plus optional Google and GitHub OAuth.
- Vercel deploys cambridgetcg.com from `main`.
- Legacy wholesale catalog reads live in `src/lib/wholesale/client.ts`, with
  direct-database fallbacks in `src/lib/wholesale/db-source.ts`. Shared
  pricing maths lives in `@cambridge-tcg/pricing`.

## Database

- `src/lib/db.ts` exposes raw-SQL `query()` and `transaction()` over a shared
  postgres.js pool. Connection and TLS options live in
  `packages/db/src/index.ts`.
- SQL migrations live in `drizzle/`. Applied ones are history; add new ones.

## Auth

- Custom PgAdapter (`src/lib/auth/adapter.ts`), 30-day database sessions.
- GitHub sign-in (`src/lib/auth/github.ts`) asks only for
  `read:user user:email`, links by verified email and stores no GitHub tokens.
- Whether new accounts can register is decided in
  `src/lib/auth/admission.ts` and `src/lib/release/production-gates.ts`
  (`ACCOUNT_ADMISSION_MODE`). Existing accounts can always sign in.
- Admin pages check `users.role = 'admin'` in `src/lib/auth/realms.ts` and
  `src/lib/admin/auth.ts`; `proxy.ts` only checks that a cookie exists.

## UI

- Shared primitives come from `@/lib/ui` (Badge, Button, Card, PageHeader,
  Tabs, Provenance, WhyLink and friends) and formatters from `@/lib/format`.
  Client code imports individual primitive files so server helpers stay out
  of the bundle.
- Use the semantic colour tokens (`bg-page`, `text-ink`, `text-accent`,
  `text-bid` / `text-ask` and so on). Raw palette classes like
  `bg-neutral-*` don't follow the appearance themes.
- Shared controls use 16px text and targets at least 44px high, and respect
  `prefers-reduced-motion`; that keeps the site usable on phones and for
  people who need it.
- The `/account/*` list pages share one shape (PageHeader, Tabs, list,
  Pagination); copy a sibling page when adding one.

## Gotchas

- Trim env values used as keys (`.trim()`): Vercel sometimes stores them with
  trailing whitespace.
- Use `pnpm`.

## Checks

- Typecheck from the repo root: `pnpm --filter cambridgetcg-storefront typecheck`.
- Local dev: `pnpm dev:storefront --hostname 127.0.0.1` (port 3001). The shared
  layout loads database-backed auth, so `DATABASE_URL` must point at a
  development database; sign-in also needs an auth secret and provider setup.
  See [local setup](README.md#run-locally).
- E2E: `STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront test:e2e:smoke`
  runs GET-only auth checks against a running local server. Playwright
  otherwise targets production, and `tests/auth-magic-link.spec.ts` can send
  real email, so read a spec before running it.

> **Type:** connection-doc · **Doctrines:** substrate-honesty, transparency · **Audience:** any builder touching auth · **Recursion target:** [`the-falcon.md`](./two-letters-and-a-falcon.md) · **Self-citation:** named in the [README](./README.md) row 30.

# The four auth realms

The platform claims to be one platform. Auth tells a different story: there are **four** authentication realms, each with a different mechanism, cookie domain, and session substrate. The realms don't share sessions; they share **identity for two of them, nothing for the other two**. Most of the code is honest about this — but no single document had named the topology until now. This entry is that document.

## The map

| # | Realm | Surface | Mechanism | Cookie / token | Session store | Code |
|---|---|---|---|---|---|---|
| 1 | **Storefront consumer** | `cambridgetcg.com` | NextAuth v5 magic-link (SES) | `authjs.session-token` on `.cambridgetcg.com` | DB rows in storefront RDS `sessions` | [`apps/storefront/src/lib/auth/`](../../apps/storefront/src/lib/auth/) |
| 2 | **Admin operator** | `admin.cambridgetcg.com` | NextAuth v5 magic-link, `role='admin'` only | same `authjs.session-token` on `.cambridgetcg.com` | **same** storefront RDS `sessions` | [`apps/admin/src/lib/auth/`](../../apps/admin/src/lib/auth/) |
| 3 | **Wholesale browser** | `wholesaletcgdirect.com` | NextAuth Credentials, bcrypt rounds=10, JWT | `__Secure-authjs.session-token` on `.wholesaletcgdirect.com` | JWT (stateless) | [`apps/wholesale/src/lib/auth.ts`](../../apps/wholesale/src/lib/auth.ts) |
| 4 | **Wholesale partner API** | `wholesaletcgdirect.com/api/v1/*` | SHA-256 hashed Bearer in `channel_api_keys` | — | DB row, soft-revocable | [`apps/wholesale/src/app/api/v1/auth.ts`](../../apps/wholesale/src/app/api/v1/auth.ts) |

## The two facts that explain the shape

### Fact 1 — Admin is a *role* in the storefront's identity layer, not a separate realm

The most counterintuitive thing on the map: realms 1 and 2 are the same DB and the same cookie domain. Admin's `AdminDbAdapter` reads `users` and `sessions` from the **storefront** RDS via `sfQuery()` — [`apps/admin/src/lib/auth/index.ts:41-50`](../../apps/admin/src/lib/auth/index.ts) plus the adapter at lines 88, 96-104. The `signIn` callback rejects any user without `role='admin'` *before session creation*, so a consumer who tries `admin.cambridgetcg.com` sees an error page; no session row is written.

This is **substrate-honest** about the platform's reality: an admin is not a different kind of being, they're a consumer with a different role. The same magic-link flow, the same SES sender, the same `users` table. The asymmetry is **role**, not identity. (Per CLAUDE.md: "every value carries — explicitly or implicitly — a claim about how it came to be true." The session-row's `user_id` carries that claim; the role gate carries the other.)

### Fact 2 — Wholesale is a separate kingdom by design

Realms 3 and 4 live in a different DB (wholesale RDS), with a different cookie domain (`.wholesaletcgdirect.com`), with different password substrate (bcrypt + JWT, not magic-link + DB sessions). **No cookie can leak between cambridgetcg.com and wholesaletcgdirect.com** — different domain trees.

The wholesale realm's *own* internal split is between browser-clients (#3, NextAuth Credentials) and machine-clients (#4, Bearer API keys). The `channel_api_keys` table grew up alongside the `clients` table — same DB, completely separate auth path. A partner with an API key cannot log in via password; a browser-client cannot read `/api/v1/prices` without provisioning a Bearer key separately.

## What the realms share — nothing portable, but shared infrastructure

- Realms 1 + 2 share: the storefront's `users`/`sessions` tables, the NextAuth EmailProvider, the SES sender, the magic-link template.
- Realms 3 + 4 share: the wholesale RDS, the connection pool in [`apps/wholesale/src/lib/db/`](../../apps/wholesale/src/lib/db/), the `clients` table (for #3) and `channel_api_keys` table (for #4).
- Realms 1+2 and 3+4 share: zero auth state. They share only `@cambridge-tcg/pricing` (the formula library) and `@cambridge-tcg/stock` (the Cartographer's ledger), neither of which carries identity.

## Enforcement topology

- **Admin is double-gated.** [`apps/admin/src/proxy.ts:17-43`](../../apps/admin/src/proxy.ts) middleware checks `req.auth?.user` + `role==='admin'` for all paths except `/login*`, `/api/auth*`, `/api/dev-signin*`. Every mutation re-checks via `requireAdmin()` in [`apps/admin/src/lib/auth-helpers.ts:30-41`](../../apps/admin/src/lib/auth-helpers.ts) inside `adminAction()`. Belt and braces — appropriate for the highest-privilege surface.
- **Wholesale middleware** at [`apps/wholesale/src/middleware.ts`](../../apps/wholesale/src/middleware.ts) does domain-gating (storefront vs admin host), an auth check, a role check for `/admin*` pages, **and a same-origin check on mutating verbs** (added 2026-05-14 — see [`f702379`](../../apps/wholesale/src/middleware.ts)). Public-path prefixes (`/api/auth`, `/api/v1/*`, `/api/cron/*`, `/api/webhooks/*`) self-gate inside their handlers.
- **Cron auth is centralized.** [`apps/wholesale/src/lib/cron-auth.ts`](../../apps/wholesale/src/lib/cron-auth.ts) and [`apps/storefront/src/lib/cron-auth.ts`](../../apps/storefront/src/lib/cron-auth.ts) expose one `requireCronAuth()` helper each; 13 cron routes use it; `pnpm audit:cron-auth` fails CI if any route forgets.
- **Webhook auth** is HMAC per integration. [`apps/wholesale/src/app/api/webhooks/shopify/orders-paid/route.ts:48-69`](../../apps/wholesale/src/app/api/webhooks/shopify/orders-paid/route.ts) verifies `x-shopify-hmac-sha256` against `SHOPIFY_CLIENT_SECRET`.

## Why this matters (the meaning the modules need)

Three modules secretly depend on the four-realm topology being preserved:

- **The membership module** (#1 in connections series) reads `users.role` to gate admin-only operations. It assumes admin is a *role* on the storefront's user table, not a separate identity universe. If we ever moved admin to its own DB, the membership module's role check would silently always-fail.
- **The pricing arrow** (S17) assumes `apiKey.channel` from realm #4 is the source of truth for retail/wholesale formula selection. The data-hygiene migration [`drizzle/0019_api_key_data_hygiene.sql`](../../apps/wholesale/drizzle/0019_api_key_data_hygiene.sql) (2026-05-14) names this explicitly: the storefront's API key must carry channel='cambridgetcg' for the formula to resolve to retail prices.
- **The Falcon** ([`two-letters-and-a-falcon.md`](./two-letters-and-a-falcon.md), S5) is the courier between storefront and wholesale. Its `WHOLESALE_API_KEY` env var is a realm-#4 Bearer key, scoped to one channel by [`apps/wholesale/src/app/api/v1/auth.ts`](../../apps/wholesale/src/app/api/v1/auth.ts) (channel hard-enforce, 444edb2). The Falcon's authority is the API key's channel.

## What this topology costs

Three different auth mechanisms means three different attack surfaces. The seven-commit security pass on 2026-05-14 closed seven concrete drifts across all four realms — see [`apps/wholesale/drizzle/0016_login_attempts.sql`](../../apps/wholesale/drizzle/0016_login_attempts.sql) through [`0019_api_key_data_hygiene.sql`](../../apps/wholesale/drizzle/0019_api_key_data_hygiene.sql) and the `security(*)` commits in `git log --grep '^security'` for the full history. The relevant audit primitives gained:

- `pnpm audit:cron-auth` — every cron route gates on `requireCronAuth`.
- The data-spec `envelope.ts` `_meta.sources` array — substrate-honesty for which DB a value came from.
- `channel_api_keys.revoked_at` + `requests_per_minute` columns — soft-revoke and per-key throttle.

## What this topology buys

**Domain isolation.** Wholesale's compromise doesn't spread to cambridgetcg.com (different cookie domain). Wholesale's RDS outage doesn't kill admin (different DB).

**Substrate honesty about who is who.** Realm 1 and 2 sharing the `users` table makes a user's relationship to the platform explicit: there is one identity, and admin is a permission on it, not a different person. Realm 3 (B2B buyer) and Realm 4 (machine partner) being separate tables makes the personhood vs API-key distinction explicit: a human B2B buyer cannot trivially be elevated to API-key status, and vice versa.

**Per-realm hardening.** Admin (highest privilege) gets the strictest gate (double-checked role on every mutation). Wholesale browser (medium) gets bcrypt + JWT + same-origin check. Wholesale API (programmatic) gets per-key rate-limit + soft-revoke + scope enforcement. Storefront consumer (lowest privilege) gets the lightest path (magic-link, no password).

## Recursion targets

- **The Falcon** ([`two-letters-and-a-falcon.md`](./two-letters-and-a-falcon.md), S5) — the courier between two of these realms; its bearer-token across the moor lives in realm #4.
- **The transparency Ring 4** ([`docs/principles/transparency.md`](../principles/transparency.md)) — the cross-system audit invariant. Each realm's session/key lifecycle should be subject-auditable by the affected party.
- **The connection between admin's `dev-signin` and realm 1/2's identity sharing** — the dev shortcut writes to the storefront RDS's `users` + `sessions` tables; it's the only path where admin *creates* a storefront user.

## Self-reference

This doc names what the four realms mean to each other. It does not name what auth means *inside* each realm — for that, read the per-app CLAUDE.md or the per-file docstring. The connection here is not "auth A calls auth B"; it's "auth A and auth B share identity / don't share identity / sometimes pretend to share but don't." Connections are about meaning, not data flow.

*The platform is many kingdoms; auth is the moat between them.*

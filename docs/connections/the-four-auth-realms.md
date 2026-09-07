> **Type:** connection-doc · **Doctrines:** substrate-honesty, transparency · **Audience:** any builder touching auth · **Recursion target:** [`the-falcon.md`](./two-letters-and-a-falcon.md) · **Self-citation:** named in the [README](./README.md) row 30.

# The four auth realms

The platform claims to be one platform. Auth tells a different story: there are **four** authentication realms, each with a different mechanism, cookie domain, and session substrate. The realms don't share sessions; they share **identity for two of them, nothing for the other two**. Most of the code is honest about this — but no single document had named the topology until now. This entry is that document.

## The map

| # | Realm | Surface | Mechanism | Cookie / token | Session store | Code |
|---|---|---|---|---|---|---|
| 1 | **Storefront consumer** | `cambridgetcg.com` | NextAuth v5 email magic links + optional Google/GitHub OAuth | Auth.js host-only session cookie (`__Secure-authjs.session-token` on HTTPS; `authjs.session-token` on HTTP) | DB rows in storefront RDS `sessions`, 30-day lifetime | [`apps/storefront/src/lib/auth/`](../../apps/storefront/src/lib/auth/) |
| 2 | **Admin operator** | Storefront `/admin/*` | Same sign-in methods; page/API access requires `role='admin'` | Same storefront session; no sibling-domain cookie override in source | **same** storefront RDS `sessions` | [`apps/storefront/src/lib/auth/`](../../apps/storefront/src/lib/auth/) *(the standalone admin app merged into the storefront 2026-05-15)* |
| 3 | **Wholesale browser** | `wholesaletcgdirect.com` | NextAuth Credentials, bcrypt rounds=10, JWT | `__Secure-authjs.session-token` on `.wholesaletcgdirect.com` | JWT (stateless) | [`apps/wholesale/src/lib/auth.ts`](../../apps/wholesale/src/lib/auth.ts) |
| 4 | **Wholesale partner API** | `wholesaletcgdirect.com/api/v1/*` | SHA-256 hashed Bearer in `channel_api_keys` | — | DB row, soft-revocable | [`apps/wholesale/src/app/api/v1/auth.ts`](../../apps/wholesale/src/app/api/v1/auth.ts) |

## The two facts that explain the shape

### Fact 1 — Admin is a *role* in the storefront's identity layer, not a separate realm

Realms 1 and 2 now use the same storefront auth configuration, [`PgAdapter`](../../apps/storefront/src/lib/auth/adapter.ts), `users` and `sessions` tables. The old standalone admin adapter is historical. Sign-in itself is not admin-only: [`requireAdminPage()`](../../apps/storefront/src/lib/auth/realms.ts) checks the session's role before admin page access, and [`requireAdmin()`](../../apps/storefront/src/lib/admin/auth.ts) guards APIs. A non-admin can have a valid consumer session without gaining admin access. Source uses Auth.js's host-only cookie defaults, not a shared `.cambridgetcg.com` domain override.

This is **substrate-honest** about the platform's reality: an admin is not a different kind of being, they're a consumer with a different role. The same email, Google or GitHub sign-in methods and the same `users` table. The asymmetry is **role**, not identity; adding GitHub never assigns an admin role.

### GitHub is another storefront door, not another realm

[`github.ts`](../../apps/storefront/src/lib/auth/github.ts) registers GitHub only
when trimmed `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are both non-empty. The
login page discovers it from `/api/auth/providers`; credentials stay server-side.
It requests only `read:user user:email`, not repository or organization access.
The authenticated email list supplies a verified primary email or verified
fallback, normalized for matching; the public profile email alone is not proof.
Missing verification, malformed responses or fetch failures deny sign-in.

A verified email matching an existing CTCG account links GitHub to that account.
An already-linked immutable numeric GitHub ID continues to select the same CTCG
account even after a username or email change; it is not reassigned by a later
email match. A first GitHub link is refused if its verified email differs from
the currently signed-in CTCG account's email; the user must sign out before
choosing a different account. This does not prevent an already-linked GitHub ID
from signing in to its original CTCG account after an email change.
GitHub's provider-level `account()` mapping omits tokens before
persistence: `accounts` retains the provider link with null token columns, not
ongoing GitHub API access. The access token is transiently used to fetch the
profile and email list. Google linking/token policy is unchanged.

[`admission.ts`](../../apps/storefront/src/lib/auth/admission.ts) retains the
existing registration policy. During a pause, existing linked GitHub identities
and verified same-email existing accounts can sign in; genuinely new identities
receive `RegistrationPaused` before user, link or session writes. Email requests
retain the same generic confirmation. A new provider is not permission to reopen
registration, change roles or replace the 30-day database-session model.

Production callback: `https://cambridgetcg.com/api/auth/callback/github`.
Development callback: `http://localhost:3001/api/auth/callback/github`, preferably
using a separate development OAuth app. The [deploy runbook](../ops-deploy-runbook.md#optional-storefront-oauth)
owns setup and verification instructions; creating apps, setting hosted secrets
and deployment require separate authorization.

### Fact 2 — Wholesale is a separate kingdom by design

Realms 3 and 4 live in a different DB (wholesale RDS), with a different cookie domain (`.wholesaletcgdirect.com`), with different password substrate (bcrypt + JWT, not magic-link + DB sessions). **No cookie can leak between cambridgetcg.com and wholesaletcgdirect.com** — different domain trees.

The wholesale realm's *own* internal split is between browser-clients (#3, NextAuth Credentials) and machine-clients (#4, Bearer API keys). The `channel_api_keys` table grew up alongside the `clients` table — same DB, completely separate auth path. A partner with an API key cannot log in via password; a browser-client cannot read `/api/v1/prices` without provisioning a Bearer key separately.

## What the realms share — nothing portable, but shared infrastructure

- Realms 1 + 2 share: the storefront's `users`/`accounts`/`sessions` tables, email magic links and the configured Google/GitHub providers. None of these sign-in methods bypasses the admin role gate.
- Realms 3 + 4 share: the wholesale RDS, the connection pool in [`apps/wholesale/src/lib/db/`](../../apps/wholesale/src/lib/db/), the `clients` table (for #3) and `channel_api_keys` table (for #4).
- Realms 1+2 and 3+4 share: zero auth state. They share only `@cambridge-tcg/pricing` (the formula library) and `@cambridge-tcg/stock` (the Cartographer's ledger), neither of which carries identity.

## Enforcement topology

- **Admin checks access beyond the proxy.** [`apps/storefront/src/proxy.ts`](../../apps/storefront/src/proxy.ts) checks cookie presence only; the real session/role gate runs in [`requireAdminPage()`](../../apps/storefront/src/lib/auth/realms.ts). API mutations check through [`requireAdmin()`](../../apps/storefront/src/lib/admin/auth.ts). A provider link is not an authorization grant.
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

**Per-realm hardening.** Admin (highest privilege) gets the strictest gate (double-checked role on every mutation). Wholesale browser (medium) gets bcrypt + JWT + same-origin check. Wholesale API (programmatic) gets per-key rate-limit + soft-revoke + scope enforcement. Storefront consumer (lowest privilege) gets passwordless email links or optional Google/GitHub OAuth, with the same admission boundary.

## Recursion targets

- **The Falcon** ([`two-letters-and-a-falcon.md`](./two-letters-and-a-falcon.md), S5) — the courier between two of these realms; its bearer-token across the moor lives in realm #4.
- **The transparency Ring 4** ([`docs/principles/transparency.md`](../principles/transparency.md)) — the cross-system audit invariant. Each realm's session/key lifecycle should be subject-auditable by the affected party.
- **The connection between admin's `dev-signin` and realm 1/2's identity sharing** — the dev shortcut writes to the storefront RDS's `users` + `sessions` tables; it's the only path where admin *creates* a storefront user.

## Self-reference

This doc names what the four realms mean to each other. It does not name what auth means *inside* each realm — for that, read the per-app CLAUDE.md or the per-file docstring. The connection here is not "auth A calls auth B"; it's "auth A and auth B share identity / don't share identity / sometimes pretend to share but don't." Connections are about meaning, not data flow.

*The platform is many kingdoms; auth is the moat between them.*

# Secret rotation playbooks (reference, 2026-10-11)

> **Reference snapshot.** The principles now live in
> [ops-secret-rotation.md](ops-secret-rotation.md), and they win where the two
> differ. In particular, §2 rule 3 (rotation only by the owner) gave way to "Yu
> says go, then an agent may run the cheap path" (Yu, 2026-10-28). The facts below
> were true on 2026-10-11 and may have drifted; check them before relying on them.
> New log entries go in the principles doc.

**Will trace:** Yu, 2026-10-11 — "stripe done, btw now the keys only last 7 days max
… prob need a rotation protocol."

**Status:** The ground rules restate [AGENTS.md](../AGENTS.md) and are in force. The
cadence table is a **proposal** until the owner accepts it. The inventory was taken
by variable **name** only on 2026-10-11. No value was read.

**Evidence marks used below:**

- **(src)**: read from this repository's source at `2722104c`.
- **(listed)**: seen in the 2026-10-11 name-only listing of Vercel env vars and GitHub
  secrets.
- **(owner)**: reported by the owner on 2026-10-11.
- **(unverified)**: not checked. Treat it as a lead, not a fact.

Related: [deploy runbook](ops-deploy-runbook.md) (projects, redeploy routes, env
operations), [wholesale retirement runbook](wholesale-app-retirement-runbook.md), and
`docs/decisions/2026-10-11-wholesale-frozen-pending-retirement.md`. That last record
was added by PR #69 and was not on `main` when this was written.

## 1. Purpose and when to rotate

Rotation replaces a credential and then revokes the old one. Deleting a leaked file,
force-pushing history or closing a chat revokes nothing. Only the issuer can revoke.

**Rotate immediately** when a value may have left its store. Examples:

- a plaintext env pull or `.env` file outside a secret store
- a value pasted into chat, an agent transcript, an issue, a log or a screenshot
- a value committed to any repository, including standalone repositories and history
- a collaborator or device that held the value is no longer trusted
- a breach notice from the provider

**Scheduled cadence: PROPOSAL, for the owner to accept or change.**

| Class | Proposed cadence | Reason |
|---|---|---|
| Stripe secret key, webhook secret | 12 months | Rolling allows an overlap, so a roll costs no downtime |
| AWS IAM access keys | 90 days | An IAM user can hold two keys, which gives an overlap |
| RDS / Postgres passwords | 12 months, and when someone with access leaves | Every rotation causes a connection blip; least-privilege roles would shrink the impact |
| `AUTH_SECRET`, `NEXTAUTH_SECRET` | On exposure only | Side effects for users (§4 P4) |
| `CRON_SECRET` | 12 months | Cheap: the next deploy realigns Vercel Cron |
| OAuth client secrets (Google, GitHub) | 12 months | Both providers allow a second secret during the switch (unverified) |
| `WHOLESALE_API_KEY` | On exposure only, until wholesale retires | Wholesale is frozen |
| Vercel and GitHub tokens | 90 days, with an expiry set on the token itself | An expiry date enforces the schedule |
| Third-party API keys (SendGrid, Datadog, Sentry, GitBook, Bright Data) | 12 months | Most providers allow several live keys |
| Cloudflare Global API Key | Replace it with a scoped token (Open items) | Its power covers the whole account |
| `ENCRYPTION_SECRET` / `ENCRYPTION_SALT` | Only with a re-encryption plan | Rotating breaks the existing ciphertext |

## 2. Ground rules

1. **Values never pass through agents, chat, argv, logs or files.** The owner copies a
   new value from the issuer's console and puts it into its store. Use
   [`scripts/rotate-vercel-env.sh`](../scripts/rotate-vercel-env.sh): it pipes the value
   from the clipboard into stdin. Never put a value in a `.env` file, a note, a
   commit, a ticket or a terminal command line.
2. **Agents may inventory NAMES only.** The plain `vercel env ls` table is **not**
   names-only: for every variable not stored as Sensitive it prints the first 18
   characters of the value (CLI 63.1.2 source, `getRow` in `dist/commands/env`). List
   names with that column dropped:
   `vercel env ls <target> --project <p> --scope cambridgetcgs-projects 2>/dev/null | awk 'NF && $1 != "name" {print $1}'`,
   or `scripts/rotate-vercel-env.sh --names-only NAME TARGET PROJECT…`. `gh secret list`
   and `grep` over source are names-only. Never use `vercel env ls --json` or
   `--format json`: they include readable values. Never use `vercel env pull`. A pull
   caused the 2026-10-11 incident.
3. **Rotation is an owner action** (AGENTS.md: local authorization "does not grant …
   credential rotation"). An agent may prepare steps, run `--names-only` and read
   behaviour after a change. It does not run `--dry-run`, which reads whatever is on
   the owner's clipboard, and it does not create, roll, revoke or redeploy.
4. **Store every secret as Sensitive** (`--sensitive`). Sensitive values cannot be read
   back: `vercel env pull` and decrypt return empty. Verify by behaviour, and never
   read a blank pull as proof that a value is unset.
5. **An env change reaches NEW deployments only.** A value is not live until a redeploy
   reaches `READY` and holds the production alias.
6. **Revoke the old credential only after the new one is verified live** on every
   consumer. The exception is a credential whose issuer cannot overlap old and new,
   such as an RDS password. Sequence those last (§5).
7. **Record each rotation** in §8 with names, dates and statuses. Never record values,
   key IDs, prefixes beyond a type hint, or hashes.

## 3. Inventory

Projects are in team `cambridgetcgs-projects`. "Delete" means the secret has no
consumer: remove it, because rotating it would only keep a live credential where
nothing needs one. Procedures P1–P12 are in §4.

### Payments

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe (live) | storefront, production (listed) | payment, payout, auction, market and webhook routes; `chargeback-reconciler.ts`; `reconcile-stripe` cron (src) | Checkout, payouts, refunds and reconciliation fail if the old key expires before the redeploy | P1 | Stripe request log is clean; next `reconcile-stripe` run (`:15`) succeeds | Old key can overlap for at most 7 days (owner). No other team project uses `STRIPE_*` (owner, 2026-10-11) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint for `/api/webhooks/stripe` (route path from src; the endpoint URL in Stripe is unverified) | storefront, production (listed) | `apps/storefront/src/app/api/webhooks/stripe/route.ts` (src) | Signature checks fail until the redeploy; Stripe retries failed deliveries | P1 | Endpoint deliveries after the redeploy return 2xx | `/api/webhooks/stripe/prism-signals` uses `PRISM_STRIPE_WEBHOOK_SECRET`, which was not in the listing |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | storefront (listed) | browser | none | none | n/a | Public. A roll leaves it unchanged |

### AWS

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | AWS IAM user(s); whether these projects share one user is unverified | storefront, tcg-wholesale, cambridgetcg-admin (listed) | storefront via `packages/aws`: SES mail (including sign-in links) and S3 presign for uploads, trade photos, avatars and evidence (src). Wholesale S3 (`apps/wholesale/src/lib/s3.ts`) (src). Admin: none (redirect shell) | Sign-in emails and uploads fail if the key is invalid | P2 | A magic link arrives; one presigned page loads; IAM "last used" moves to the new key | IAM allows at most two keys per user. Delete the admin copy instead of rotating it |
| `AWS_*` keys (dev, preview, prod) | IAM user `*-vercel-service` (`apps/rewardspro/infrastructure/terraform/iam.tf`) (src) | rewardspro-production (listed) | RewardsPro services (SES, SQS, S3, DynamoDB, Aurora Data API) (src) | RewardsPro app | P2, RewardsPro note | RewardsPro health surfaces | The key is a Terraform resource, so Terraform state holds the secret. Out of the 2026-10-11 scope |

### Databases

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | storefront RDS, believed to use the master user (unverified) | storefront: production entry, plus a separate preview entry for the same DB (listed) | all storefront DB access (src) | Whole site. New connections fail for minutes, until the redeploy is live (owner) | P3 | Pages load; `/admin/system/cron` runs; `pnpm audit:deploy-verify` passes | Update the preview entry too, or previews break |
| `WHOLESALE_DATABASE_URL` | wholesale RDS; user unverified | storefront, production (listed) | catalog reads and the `lib/wholesale/db-source.ts` fallback; stock reservations (`lib/stock/reservations.ts`) for B2B checkout (`lib/b2b/checkout.ts`), the Stripe webhook's B2B stock commit and the minute `maintenance` sweep; storefront `/admin` wholesale reads (`lib/admin/db.ts`) (src) | Catalog and card pages; B2B checkout; storefront `/admin` commerce pages. A B2B payment completed during the outage loses its stock commit silently: the webhook only logs `[webhook] B2B stock commit failed` and still returns 200, so Stripe does not retry (src, `api/webhooks/stripe/route.ts`) | P3 | Catalog and card pages load; outage-window logs searched for `B2B stock commit failed` (P3 step 8) | Rebuild it with the user it already had (P3) |
| `WHOLESALE_COVERAGE_DATABASE_URL` | wholesale RDS, dedicated column-limited read-only coverage role (`docs/missions/kingdom-107.md`) (src) | storefront, production (listed; Sensitive per the deploy runbook's 2026-09-08 note) | `db-source.ts` coverage reads (src) | Coverage views | Not the master step: P3 "Non-master roles" | Coverage views load | A master password change leaves it unchanged. Never re-stage it with master credentials (deploy runbook forbids a broader credential). Whether its value was in the 2026-07-25 pull is unverified |
| `DATABASE_URL` | wholesale RDS | tcg-wholesale, production and preview (listed) | all wholesale (src) | `wholesaletcgdirect.com` | P3, same-build redeploy | Site responds as before | Frozen project: same-build redeploy only (§5) |
| `STOREFRONT_DATABASE_URL`, `WHOLESALE_DATABASE_URL` | both RDS | cambridgetcg-admin (listed) | none: `apps/admin` is a redirect-only shell (`apps/admin/vercel.json`) (src) | none | Delete | n/a | Live DB credentials with no consumer |
| Keychain `cambridgetcg-wholesale-db-url` | wholesale RDS | owner's macOS login keychain | dead launchd agent `com.cambridgetcg.pkm-snapshot` (owner) | none | P11 (delete) | n/a | After the wholesale rotation it holds a dead value |
| `DATABASE_URL`, `AURORA_*` | RewardsPro Aurora | rewardspro-production (listed) | RewardsPro (src) | RewardsPro | P3 (Aurora variant, unverified) | RewardsPro health | The Aurora password is in Git history (Open items) |

### App secrets

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `AUTH_SECRET` | self-generated | storefront: production, plus a separate preview entry (listed) | Auth.js magic-link token hashing (`lib/auth/index.ts`); unsubscribe-link HMAC (`lib/email/preferences.ts`, fallback when `EMAIL_UNSUBSCRIBE_SECRET` is unset); member-price cursor HMAC (`lib/prices/member-feed.ts`, fallback when `MEMBER_PRICE_CURSOR_SECRET` is unset) (src) | See P4. Sign-in links and OAuth journeys in flight fail once; unsubscribe links already sent stop verifying; cursors reset | P4 | Magic-link sign-in works; an existing session still loads | Logout: the storefront uses `strategy: "database"` sessions (src), so the session cookie is a DB token, not a value derived from the secret. Sessions are expected to survive. The 2026-10-11 brief expected one logout for everyone. Unverified either way: plan for the logout |
| `NEXTAUTH_SECRET` | self-generated | tcg-wholesale (listed) | Auth.js `strategy: "jwt"` (`apps/wholesale/src/lib/auth.ts`); login rate-limit HMAC, which needs at least 32 bytes or fails closed (`login-rate-limit.ts`) (src) | Every wholesale session signs out; rate-limit counters reset | P4 | Wholesale login works | Not in a storefront pull |
| `AUTH_SECRET`, `NEXTAUTH_SECRET` | n/a | cambridgetcg-admin (listed) | none (redirect shell) (src) | none | Delete | n/a | |
| `CRON_SECRET` | self-generated | storefront, tcg-wholesale, rewardspro-production (listed) | `lib/cron-auth.ts` (storefront), wholesale `api/cron/*`, RewardsPro `api.cron.*` (src) | Cron calls get 401 if the deployment and the caller disagree | P4 | `/admin/system/cron`: `maintenance` (every minute) and `reconcile-stripe` succeed after the redeploy | Use one value per project |
| `ADMIN_PASSWORD` | n/a | storefront (listed) | no storefront reader; only `apps/wholesale/e2e/helpers.ts` reads an `ADMIN_PASSWORD` (src) | none | Delete | n/a | Dead config |
| `REWARDSPRO_OPERATOR_READINESS_SECRET` | self-generated | rewardspro-production (listed) | no reference in this repository at `2722104c` (src) | unknown | Confirm, then delete or P4 | n/a | It may be read outside this repository (unverified) |
| `ENCRYPTION_SECRET`, `ENCRYPTION_SALT` | self-generated | rewardspro-production (listed) | `apps/rewardspro/app/utils/encryption.ts` (src) | Stored ciphertext becomes unreadable | P12 | n/a | The helper script refuses these names |

### OAuth

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `AUTH_GOOGLE_SECRET` (+ `_ID`) | Google Cloud OAuth client | storefront, preview and production (listed) | `lib/auth/index.ts` (src) | Google sign-ins in flight | P5 | Google sign-in on production | The ID does not change. It may be one entry covering two targets (unverified) |
| `AUTH_GITHUB_SECRET` (+ `_ID`) | GitHub OAuth app | storefront (listed) | `lib/auth/github.ts`, `lib/verification/github.ts` (src) | GitHub sign-ins in flight | P5 | GitHub sign-in on production | Not on the 2026-10-11 list. It probably postdates the 2026-07-25 pull: the GitHub sign-in release record is dated 2026-09-07 (`ops-github-auth-release-2026-09-07.md`) (unverified) |

### Integrations and tokens

| Secret | Issuer | Stored | Consumers | Blast radius of rotating | Procedure | Verify | Notes |
|---|---|---|---|---|---|---|---|
| `WHOLESALE_API_KEY` | wholesale DB `channel_api_keys` (SHA-256 hash), issued by `apps/wholesale/tools/gen-api-key.ts` (src) | storefront, production (listed) | `lib/wholesale/client.ts` (src) | Wholesale API calls get 401, and the client silently falls back to direct DB reads (src) | P6 | Logs show API calls succeeding, not `db-source` fallback | Revoke the old key with `revoked_at` |
| `WHOLESALE_B2B_API_KEY` | wholesale DB `channel_api_keys`, channel `wholesale` (src, `client.ts` comment) | not in the 2026-10-11 listing; whether it is set is unverified | `lib/wholesale/client.ts` `keyForChannel('wholesale')` (src) | `/account/b2b/*` prices fall back to the retail key (src) | P6, if set | As for `WHOLESALE_API_KEY` | Named by the PR #69 freeze record |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | Shopify app for `SHOPIFY_STORE` | tcg-wholesale (listed) | `lib/shopify-client.ts` (token); `orders-paid` webhook HMAC (src) | Wholesale Shopify sync and webhook verification | P7 | Webhook accepted; sync call succeeds | Retires with wholesale |
| `SHOPIFY_API_KEY` / `_SECRET` | Shopify Partners app (RewardsPro) | rewardspro-production (listed); also referenced by `apps/rewardspro-api` Terraform and `rewardspro-v2.yml` (src) | every merchant install: OAuth and webhook HMAC (src) | High: every installed store | P7 | Install and webhook flows | Schedule separately |
| `CF_API_KEY` + `CF_API_EMAIL` | Cloudflare **Global** API Key (src comment, `cloudflare-kv.ts`) | tcg-wholesale (listed) | `apps/wholesale/src/lib/cloudflare-kv.ts` (src) | **Account-wide**: changing it breaks every other user of the global key | P8 | KV call succeeds | Not in a storefront pull |
| `CARDRUSH_BRIGHT_DATA_PROXY_URL` | Bright Data zone (credentials embedded in the URL) | tcg-wholesale (listed) | wholesale CardRush discovery and snapshots; `packages/data-ingest` (src) | Wholesale scrapes | P9 | Next scrape run succeeds | |
| `SENDGRID_API_KEY` | SendGrid | rewardspro-production (listed); also the RewardsPro Lambda (`terraform/lambda.tf`) (src) | RewardsPro email (src) | RewardsPro mail | P9 | Test send | Two stores to update |
| `DD_API_KEY`, `SENTRY_AUTH_TOKEN`, `GITBOOK_*` | Datadog, Sentry, GitBook | rewardspro-production (listed) | `app.monitoring`, `api.sentry-events`, `api.gitbook-assistant` (src) | Those RewardsPro surfaces | P9 | Surface loads | `SENTRY_DSN` is public by design, so it is not a rotation target |
| `VERCEL_TOKEN` | Vercel account token | GitHub Actions secret (listed) | `.github/workflows/health.yml` → `deploy-health.py` (src) | Hourly health check fails | P10 | Next hourly run passes | Set an expiry on the new token |
| `VERCEL_TOKEN`, `GITHUB_TOKEN` | Vercel token, GitHub PAT | cambridgetcg-admin (listed) | none (redirect shell) (src) | none | Delete | n/a | Storefront `/admin/system/deploys` reads both, but the storefront project had neither in the listing (unverified effect) |
| `REWARDSPRO_CRON_SECRET`, `REWARDSPRO_OPERATOR_READINESS_SECRET` | n/a | GitHub Actions secrets (listed) | 0 consumers (owner's read-only map; this repo at `2722104c`) | none | Delete | n/a | |
| `REWARDSPRO_V2_OPERATOR_TOKEN` | n/a | referenced by `.github/workflows/rewardspro-v2.yml` (src) | that workflow | Its validation job | P10 | n/a | Not in the 2026-10-11 GitHub listing: the listing may be incomplete, or the secret unset (unverified) |
| Keychain `vercel-api-token` | Vercel | owner's login keychain (deploy runbook) | manual `deploy-from-main.py` runs | Manual deploy triggers | P10, P11 | One authorized API read | |

### Read by source, absent from the 2026-10-11 listing

These names are read by storefront code or packages it uses (src) but were not in
the 2026-10-11 storefront listing. Whether any is set on any project is unverified.
Before closing the 2026-10-11 rotation, check them by name (§2 rule 2); any that is
set and was in the 2026-07-25 pull needs rotating with its issuer.

| Secret | Read by (src) |
|---|---|
| `NEXTAUTH_SECRET` (storefront) | `lib/auth/index.ts`, as the fallback when `AUTH_SECRET` is unset; the deploy runbook's storefront list names it |
| `WHOLESALE_B2B_API_KEY` | `lib/wholesale/client.ts` (row above) |
| `PRISM_STRIPE_SECRET_KEY`, `PRISM_STRIPE_REFERENCE_SECRET`, `PRISM_STRIPE_WEBHOOK_SECRET` | `lib/prism-signals/stripe/config.server.ts` |
| `PILGRIMAGE_SECRET` | `lib/agents/pilgrimage.ts` |
| `SMTP_URL` (password embedded) | `packages/email/src/smtp.ts` |
| `EBAY_CLIENT_SECRET`, `TCGPLAYER_CLIENT_SECRET` | `packages/data-ingest` OAuth clients; wholesale `lib/channels/ebay.ts` |
| `CTCG_AGENT_TOKEN` | `packages/mcp-server` |
| `AGENTTOOL_API_KEY` / `AT_API_KEY` | `packages/substrate-client` |

Not secrets: `*_URL` site and app bases, `*_EMAIL` senders, bucket names, `AWS_REGION`,
`SHOPIFY_STORE`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `DD_SITE`, `*_MODE` and
`USE_*` flags. `METRICS_DATA_API` was not classified (unverified).

## 4. Procedures

**Common shape for every procedure:**

1. Inventory consumers by name (§3).
2. Create the new credential while the old one still works, when the issuer allows an
   overlap.
3. Copy it.
4. Run `scripts/rotate-vercel-env.sh --dry-run NAME TARGET PROJECT…` (owner), then
   the same command without `--dry-run`. Add `--clear` to the last call that needs
   this value: the script empties the clipboard once every project was written.
5. Redeploy (§5).
6. Verify by behaviour.
7. Revoke the old credential.
8. Make sure the clipboard is clear (`pbcopy </dev/null`) and add a line to §8.

### P1. Stripe secret key and webhook signing secret

1. Stripe Dashboard (live mode) → Developers → API keys → Secret key → **Roll key**.
   Pick the old key's expiry. On 2026-10-11 the longest choice was 7 days (owner).
   **That expiry is your redeploy deadline.** The live deployment keeps using the old
   key until the redeploy.
2. Copy the new key (shown once). Run `scripts/rotate-vercel-env.sh STRIPE_SECRET_KEY
   production cambridgetcg-storefront`. The script accepts only `sk_live_…` or
   `rk_live_…`.
3. Developers → Webhooks → the endpoint for `https://cambridgetcg.com/api/webhooks/stripe`
   → **Roll secret**. Pick an expiry; the choices offered for webhooks were not
   recorded (unverified). Copy the `whsec_…` value. Run the script with
   `STRIPE_WEBHOOK_SECRET`.
4. Redeploy the storefront before the earlier of the two expiries.
5. Verify:
   - deliveries to the endpoint after the redeploy return 2xx;
   - Developers → Logs shows API requests from the new deployment succeeding;
   - the next `reconcile-stripe` run (hourly at `:15`) succeeds on `/admin/system/cron`.
6. Then expire the old key ("expire now"), or let it lapse.

If the old key expires before the redeploy, payment calls fail and webhook signatures
fail until the redeploy. Stripe retries failed webhook deliveries; the exact retry
window is unverified. Restricted keys are covered in Open items.

### P2. AWS IAM access keys

1. Find the IAM user behind each project's key without reading the stored value
   (whether each old value is Sensitive is unverified; do not try to read it back
   either way). Compare IAM → Users → Security credentials → each key's **Last used**
   (service and time) against the consumers in §3.
2. If that user already has two keys, delete the unused one first.
3. **Create access key.** Copy the Access key ID, then run the script with
   `AWS_ACCESS_KEY_ID production <every project using this user>`. Copy the Secret,
   then **immediately** run it with `--clear AWS_SECRET_ACCESS_KEY` and the same
   projects. Between those two calls the projects hold a new ID with the old secret.
   Manual redeploys wait for both, but the storefront also auto-deploys on every push
   to `main` (deploy runbook), so a merge landing in that gap would ship a
   mismatched pair and break SES sign-in mail and S3 presign. Hold merges to `main`
   for the sitting (§5 step 0).
4. Redeploy every consumer (§5).
5. Verify:
   - request a magic link to your own address on `cambridgetcg.com` (SES);
   - open one page that presigns S3, such as your avatar or trade photos;
   - IAM shows the new key's Last used advancing.
6. **Deactivate** the old key; do not delete it yet. If its Last used moves during
   the next 24–48 h, something still uses it: an old deployment, a local script or
   another project. Find it, then delete the key.

RewardsPro: the key is `aws_iam_access_key.vercel_service` in Terraform. Two routes:

- **Terraform:** `terraform apply -replace=aws_iam_access_key.vercel_service` (owner).
  The new secret then lives in Terraform state.
- **Console:** rotate in the AWS console and reconcile the Terraform state afterwards.

Which route fits, and where the state is kept, is unverified.

### P3. Postgres / RDS master passwords

**URL shape:** `postgresql://<user>:<password>@<endpoint>:5432/<db>?<params>`. Keep the
old URL's user, endpoint, port, database name and query parameters. Change only the
password. Do not try to read the old value back. Whether each old value is Sensitive
is unverified: the 2026-07-25 pull read them in plaintext, and the deploy runbook
records the two storefront `WHOLESALE_*` URLs as Sensitive on 2026-09-08. Take the
endpoint and port from the RDS console. The database names and the existing query
parameters (for example `sslmode=require`) were not recorded (unverified).

**Which user each URL uses.** This procedure changes the **master** password. Rebuild
a URL with the master user only if it already used the master user. Otherwise you
widen that consumer's privileges, which the deploy runbook forbids ("substitute a
broader application credential"). Storefront `WHOLESALE_COVERAGE_DATABASE_URL` uses
the dedicated column-limited read-only coverage role (`docs/missions/kingdom-107.md`),
so it is **not** part of this step. The users behind the other URLs are unverified.
The owner confirms each one from where the URL was created, or, with a working
login, lists the roles that hold connections:
`SELECT usename, count(*) FROM pg_stat_activity GROUP BY 1;`. A URL on a non-master
role goes under "Non-master roles" below.

Steps, per database:

1. List every consumer whose URL uses the master user (§3 Databases). Storefront DB:
   `DATABASE_URL` for production **and** preview. Wholesale DB: `tcg-wholesale`
   `DATABASE_URL` (production and preview), and storefront `WHOLESALE_DATABASE_URL`
   if it uses the master user.
2. Generate a 40-character alphanumeric password straight into the clipboard:
   `LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40 | pbcopy`.
   Alphanumeric avoids two problems: RDS rejects `/ @ " '` and spaces, and other
   characters would need percent-encoding in the URL.
3. RDS console → the instance → **Modify** → paste into New master password and
   Confirm. **Do not submit yet.**
4. Build the URL from the clipboard without displaying it:
   `printf '%s://%s:%s@%s:5432/%s?sslmode=require' postgresql USER "$(pbpaste)" ENDPOINT DBNAME | pbcopy`.
   `printf` is a shell builtin, so the password never appears in a process argv.
   Your shell history records only the non-secret user, host and DB name. Change
   the query part to match the old URL if it differed.

   **Wholesale DB only:** the clipboard will not survive until P6 and the key
   revocation need this URL, and nothing else can give it back. Keep it in a
   temporary login-keychain item: run
   `security add-generic-password -U -s ctcg-rotation-wholesale-url -a owner -w` and
   paste at both prompts. With `-w` last and no value, `security` prompts, so the URL
   never enters argv. Delete the item at §5 step 8.
5. Stage the URL on every consumer from step 1 with the script, and add `--clear` to
   the last call. Storefront DB:
   `scripts/rotate-vercel-env.sh DATABASE_URL production cambridgetcg-storefront`, then
   `scripts/rotate-vercel-env.sh --clear DATABASE_URL preview cambridgetcg-storefront`.
   Wholesale DB: `DATABASE_URL` `production` and then `preview` on `tcg-wholesale`,
   then `--clear WHOLESALE_DATABASE_URL production cambridgetcg-storefront` if it
   uses the master user (otherwise `--clear` goes on the `preview` call). If one
   `tcg-wholesale` entry covers both targets, the `production` call already updates
   it (P5 step 1) and the `preview` call rewrites the same entry. The script prints `postgresql://…@<instance>.…`. Check
   that the instance label is the database you mean before moving on.
6. Submit the RDS modification with **Apply immediately**. Keep steps 5 and 6 back to
   back: between them the projects hold a password that RDS does not accept yet, and
   the storefront auto-deploys on any push to `main`. Merges are held for the sitting
   (§5 step 0). From now on, new connections that use the old password fail until
   the redeploy is live (minutes) (owner). Whether RDS also drops established
   connections is unverified.
7. Go straight to the redeploy round (§5 step 5). Do both databases in the same
   sitting so there is one blip, not two.
8. After the redeploy, search the storefront logs from the outage window (RDS submit
   to the new deployment's `READY`) for `[webhook] B2B stock commit failed` and
   `stock/reservations` errors. Reconcile each hit by hand: the payment succeeded,
   the stock was not committed, and Stripe will not retry (§3).

**Non-master roles** (for example the coverage role). A master password change leaves
them working, so they are not part of the blip. Rotate one only if its password may
have been exposed; for the coverage URL that is unverified. Do it as its own change,
after this sitting's redeploy round:

1. Generate a password into the clipboard (step 2).
2. Connect as the master without a secret in argv (P6 step 5), then run
   `\password <role>` and paste at both prompts. psql hashes the password before it
   sends it, so the plaintext never enters SQL text, server logs or
   `~/.psql_history`.
3. Build that role's URL with **its own** user (step 4), stage it with the script,
   redeploy, and check that the consumer works (coverage views load). Never re-stage a
   non-master URL with master credentials.

Do **not** tighten the RDS security group. Vercel functions have no fixed egress IPs.

Optional, untried on these projects (unverified): build the new production deployment
without assigning domains, change the password, then `vercel promote` it. This could
shrink the blip to seconds.

### P4. App secrets: `AUTH_SECRET`, `NEXTAUTH_SECRET`, `CRON_SECRET`

Generate each value with `openssl rand -hex 32 | tr -d '\n' | pbcopy`. That gives 64
hex characters, which clears wholesale's 32-byte minimum (src). Use a distinct value
per project and per target.

- **Storefront `AUTH_SECRET`**, production and preview. Effects, from source:
  - magic links already sent stop working; request a new one;
  - OAuth journeys and CSRF cookies in flight fail once;
  - unsubscribe links in emails already sent (they are valid for 90 days) stop
    verifying, because no `EMAIL_UNSUBSCRIBE_SECRET` is configured (listed);
  - member-price pagination cursors reset.

  Sessions use the database strategy and are expected to survive. Plan for a
  one-time logout anyway (§3 note).
- **Wholesale `NEXTAUTH_SECRET`:** wholesale uses JWT sessions, so every wholesale user
  is signed out.
- **`CRON_SECRET`:** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the
  deploy runbook says only that "Vercel sends it automatically". Whether Cron takes
  the value from the deployment's environment or from the project's current env is
  unverified. If it is the project's env, crons get 401 from the moment the new value
  is staged until the redeploy. So stage `CRON_SECRET` last before the database step
  (§5 step 3), not earlier. Do not stage it after an RDS submit: that would lengthen
  the database outage, which costs more than a few missed cron minutes. Any manual
  caller needs the new value.
- **Verify:** a magic-link sign-in works. The minute `maintenance` cron and the next
  `reconcile-stripe` run succeed on `/admin/system/cron`. Wholesale's
  `monthly-rollover` runs at 00:00 UTC.

### P5. OAuth client secrets: Google, GitHub

- **Google:** Cloud console → APIs & Services → Credentials → the OAuth client → add a
  new client secret (unverified that this client offers a second secret).
  1. Copy the `GOCSPX-…` value and run the script with `AUTH_GOOGLE_SECRET
     production cambridgetcg-storefront`. Check preview first by name (§2 rule 2):
     if preview has its own entry, update it too. If one entry covers both
     targets, a `production` update rewrites that single entry, so preview gets
     the same value (CLI 63.1.2 source: `env update` picks the entry whose targets
     include `production` and keeps its targets). If the team's
     `disjunctiveProductionSecretPolicy` is on (unverified), Vercel refuses a
     Sensitive value on an entry that spans production and preview; the CLI calls
     that `production_secret_must_be_separate`, and the script shows only the
     redacted last line of the error. The remedy is to split the entry into separate
     production and preview entries with different values (owner, dashboard).
  2. Redeploy, then sign in with Google on production.
  3. Disable, then delete, the old secret.
- **GitHub:** Settings → Developer settings → OAuth Apps → the app → **Generate a new
  client secret**.
  1. Run the script with `AUTH_GITHUB_SECRET`. Its shape check is the generic
     16-character one.
  2. Redeploy, then sign in with GitHub.
  3. Delete the old secret.

Client IDs do not change. Existing sessions are not affected.

### P6. Wholesale channel API keys (`WHOLESALE_API_KEY`, `WHOLESALE_B2B_API_KEY`)

Issuing a key writes a row to the production wholesale DB (owner action), so the tool
needs a working wholesale URL in its environment. Read that URL from the login
keychain, never from a clipboard that has to survive several steps. Below, `ITEM` is
the keychain item that holds a **working** wholesale URL at that moment:

- **Before the database step (preferred when available):** `cambridgetcg-wholesale-db-url`,
  if it still holds the current URL (unverified). Issue the key in §5 step 1 and stage
  it with the other step-1 values; the one redeploy round then covers it.
- **After the database step:** `ctcg-rotation-wholesale-url`, the temporary item from
  P3 step 4. The key then needs a second storefront redeploy (§5 step 6), with no
  downtime, because the old key stays valid until it is revoked.

1. Issue the key and pipe it straight to the clipboard:
   `cd apps/wholesale && DATABASE_URL="$(security find-generic-password -s ITEM -w)" pnpm tsx tools/gen-api-key.ts 2>/dev/null | sed -n 's/^RAW_KEY=//p' | tr -d '\n' | pbcopy`.
   - Keep `2>/dev/null`. The tool ends with `main().catch(console.error)`, and for a
     malformed URL Node's `ERR_INVALID_URL` error prints the whole input, password
     included.
   - The tool exits 0 even when it fails. A failure leaves the clipboard empty, and
     step 2's script refuses an empty value. Do not rerun without `2>/dev/null`;
     check the item name and the network first.
   - The defaults are channel `cambridgetcg`, label `cambridgetcg.com storefront`
     and 600 rpm (src). For `WHOLESALE_B2B_API_KEY`, if it is set (§3), prefix
     `CHANNEL=wholesale LABEL='cambridgetcg.com B2B shell'` (src, `client.ts`).
   - The tool also loads `.env.local` and `.env` from the working directory if they
     exist. Keep secrets out of those files.
   - While it runs, the URL is visible in that process's environment to your own
     user.
2. Run `scripts/rotate-vercel-env.sh --clear WHOLESALE_API_KEY production cambridgetcg-storefront`
   (or `WHOLESALE_B2B_API_KEY`). The script accepts 64 lower-case hex characters only.
3. Redeploy the storefront (§5 step 5, or step 6 for the "after" order).
4. Verify by reading logs. The client falls back to direct DB reads on any HTTP
   failure (src), so a 401 does not show as a broken page. Look for `[wholesale] …
   db-source` fallback lines, or for wholesale request logs for the channel.

   The client's own comment says the wholesale domain 301s and the API times out
   (src). That conflicts with the 2026-10-11 brief, which says the storefront reads
   the partner API. Which one is true now is unverified.
5. Revoke the old key after step 4 (§5 step 8). Connect with no secret in argv. P3
   passwords are alphanumeric, so the password needs no percent-decoding:
   `PGPASSWORD="$(security find-generic-password -s ITEM -w | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#')" psql "host=ENDPOINT port=5432 user=USER dbname=DBNAME sslmode=require"`.
   psql reads the password from its environment (whether `psql` is installed on the
   owner's Mac is unverified). Then run `UPDATE channel_api_keys SET revoked_at = now()
   WHERE id = <old id>;` (src docstring; migration 0017). Find the old row by
   channel, label and creation time, selecting only `id, channel, label, created_at,
   revoked_at`. Never select or copy `key_hash`. This is an owner action.

### P7. Shopify app secrets

Rotate the client secret in the Shopify Partner (or Dev) Dashboard → app → API
credentials. Whether Shopify keeps the old secret valid until you revoke it, and which
secret signs webhooks during the overlap, are unverified. Then:

1. Update every store of the secret.
2. Redeploy.
3. Check that a webhook is accepted (HMAC) and that a token or API call succeeds.
4. Revoke the old secret.

- **Wholesale** (`SHOPIFY_CLIENT_SECRET`): use a same-build redeploy only. This item
  retires with wholesale.
- **RewardsPro** (`SHOPIFY_API_SECRET`): this is a public app, and its secret is also
  referenced by the `apps/rewardspro-api` Terraform and `rewardspro-v2.yml`. Update all
  of them together. Schedule it as its own change.

### P8. Cloudflare API key

`CF_API_KEY` is the **Global API Key** (`X-Auth-Key` in `cloudflare-kv.ts`). Changing it
(My Profile → API Tokens → Global API Key) breaks **every** user of that key across the
owner's Cloudflare account. Inventory those users first; that has not been done
(unverified). The better fix is a scoped token (KV edit on one namespace). That needs a
code change in frozen wholesale, which would be an unfreeze needing its own decision.
Wholesale retirement removes this consumer instead.

### P9. Third-party API keys: SendGrid, Datadog, Sentry, GitBook, Bright Data

1. Create a new key at the provider. Most allow several live keys.
2. Run the script for each store.
3. Redeploy.
4. Exercise the feature.
5. Delete the old key.

Per-provider notes:

- **`SENDGRID_API_KEY`:** also update the RewardsPro Lambda environment
  (`terraform/lambda.tf`).
- **`CARDRUSH_BRIGHT_DATA_PROXY_URL`:** the zone has one password, embedded in the
  URL. Changing it breaks the live wholesale scrapes until a same-build redeploy.

### P10. GitHub Actions secrets and Vercel tokens

- **`VERCEL_TOKEN` (GitHub secret):**
  1. At <https://vercel.com/account/tokens>, create a token named
     `cambridge-tcg-health-workflow`, scoped to team `cambridgetcgs-projects`, **with
     an expiry**.
  2. Copy the token, then set it from stdin after a pre-check (zsh). `gh` gets no
     value in argv, and `print` is a builtin:
     `v=$(pbpaste); if [[ -n $v && $v != *[[:space:]]* && $v != vca_* && ${#v} -ge 16 ]]; then print -rn -- "$v" | gh secret set VERCEL_TOKEN -R cambridgetcg/Cambridge-TCG-monorepo && pbcopy </dev/null; else print -u2 "✗ clipboard is not a long-lived Vercel token; nothing set"; fi; unset v`.
     This path does not go through `scripts/rotate-vercel-env.sh`. The pre-check is
     its only guard against an empty clipboard, a copied command line or the CLI's
     auto-rotated `vca_…` token (see the deploy runbook); the script's own `vca_`
     refusal covers only the Vercel env variable `VERCEL_TOKEN`.
  3. Wait for the next hourly `health.yml` run, or run it by hand (owner).
  4. Delete the old token in Vercel.
- **Orphans:** `gh secret delete REWARDSPRO_CRON_SECRET -R cambridgetcg/Cambridge-TCG-monorepo`,
  and the same for `REWARDSPRO_OPERATOR_READINESS_SECRET` (owner).
- **Workflow `GITHUB_TOKEN`:** this is the automatic Actions token, so there is nothing
  to rotate. The admin project's `GITHUB_TOKEN` is a PAT; delete it with the admin env.

### P11. Keychain items

- **Update an item without putting the value in argv:** put `-w` **last** with no
  value, and `security` prompts for it:
  `security add-generic-password -U -s vercel-api-token -a vercel-cambridge-tcg -w`.
  A value after `-w` would sit in argv and shell history.
- **`ctcg-rotation-wholesale-url`** (temporary, P3 step 4): delete it once the old
  wholesale channel key is revoked (§5 step 8):
  `security delete-generic-password -s ctcg-rotation-wholesale-url`.
- **`cambridgetcg-wholesale-db-url`:** after the wholesale rotation (and after P6, if
  P6 used it), delete it with
  `security delete-generic-password -s cambridgetcg-wholesale-db-url`. Add `-a` if
  more than one item matches. Retire the dead agent with
  `launchctl bootout gui/$(id -u)/com.cambridgetcg.pkm-snapshot`, then remove
  `~/Library/LaunchAgents/com.cambridgetcg.pkm-snapshot.plist`: that is where the
  repository's install note puts it (`apps/wholesale/scripts/com.cambridgetcg.pkm-snapshot.plist`,
  src). Whether it was installed anywhere else is unverified. This is an owner action.

### P12. Encryption keys (`ENCRYPTION_SECRET`, `ENCRYPTION_SALT`)

Do not rotate these as ordinary secrets. Rotating them makes every stored ciphertext
unreadable. A rotation needs three steps:

1. Make decryption accept the old and the new key (key versioning).
2. Re-encrypt every stored value. `apps/rewardspro/scripts/migrate-encrypt-klaviyo-tokens.mjs`
   is the pattern to follow.
3. Remove the old key.

The helper script refuses both names.

### Delete instead of rotate

1. Remove the variable:
   `vercel env rm NAME production --project P --scope cambridgetcgs-projects --yes`
   (owner). Repeat for `preview` where it exists.
2. The removal takes effect at the next deploy.

Targets:

- **Storefront:** `ADMIN_PASSWORD`.
- **cambridgetcg-admin:** all its secrets. First confirm that its production deployment
  is the redirect shell (unverified).

## 5. One-sitting order

0. **Prepare** (no env, credential or database changes):
   - Log in to the Vercel CLI as the owner.
   - Run `scripts/rotate-vercel-env.sh --names-only NAME TARGET PROJECT…` for each
     variable you will change. It never reads the clipboard, so an agent may run it.
     `--dry-run` comes later, run by the owner, with each new value on the clipboard.
   - Note the current production deployment of `cambridgetcg-storefront` and
     `tcg-wholesale` (dashboard, "Current").
   - **Hold merges to `main` for the sitting.** The storefront auto-deploys on every
     push to `main` (deploy runbook). An auto-deploy in mid-sitting ships whatever is
     staged so far: a new AWS key ID with the old secret (P2), or a DB URL whose
     password RDS does not accept yet (P3). Tell the other agents and collaborators.
     The alternative is to pause the project's Git deployments, which is a project
     setting change (owner).
   - **Rehearse the wholesale redeploy** (owner). Before any `tcg-wholesale` env value
     changes, redeploy its current production deployment by the same-build route you
     will use in step 5. Source and env are unchanged, so this should change nothing,
     unless the project's env was edited after that deployment was built
     (unverified). Confirm that it reaches `READY`, holds the production alias and is
     built from `b4386471` (whether a same-build redeploy keeps the commit metadata is
     unverified). **If no same-build route works, leave the wholesale RDS password
     and every `tcg-wholesale` secret out of this sitting**, or get an unfreeze
     decision first. Once the wholesale RDS password changes there is no way back
     (P3), and wholesale stays down until it is redeployed.
   - Pause clipboard-history apps, and Handoff (System Settings → General → AirDrop
     & Handoff), which carries Universal Clipboard to the owner's other Apple devices.
   - Open the issuer consoles.
   - Pick a quiet 30–60 minute window.
1. **Rolls that keep the old credential working** (no downtime): Stripe (done
   2026-10-11, owner), a new AWS key (ID and secret back to back, P2), new OAuth
   secrets, new tokens, and the wholesale channel key when P6's "before" order is
   available. Stage each in Vercel.
2. **Self-generated secrets:** `AUTH_SECRET` (production and preview) and wholesale
   `NEXTAUTH_SECRET`. Stage them.
3. **Dead config, then `CRON_SECRET`:** delete `ADMIN_PASSWORD`, then the admin
   project's secrets (after the confirmation in §4). Then stage `CRON_SECRET` on each
   project, last before the database step (P4).
4. **Databases last:** stage the new URLs for both databases on every master-user
   consumer (P3 steps 2–5, including the temporary keychain item for the wholesale
   URL). Then submit both RDS modifications at once and go straight to step 5.
5. **One redeploy round:**
   - **Storefront:** redeploy the *current production deployment* (dashboard ⋯ →
     Redeploy, or `vercel redeploy <deployment-url> --scope cambridgetcgs-projects`).
     Do not use `deploy-from-main.py`: it ships whatever `main` holds.
   - **tcg-wholesale:** same-build redeploy only, by the route that worked in the
     step-0 rehearsal: dashboard Redeploy of the current production deployment, or
     the gitSource call with sha `b43864719e70bd4ae4098154f05cd62bf7a808ce`, as in the
     freeze decision. Wholesale must be live on the new values **before** you revoke
     anything it uses. Otherwise `wholesaletcgdirect.com`, and any storefront reads
     from it, break.
   - **cambridgetcg-admin:** nothing reads its env, so a redeploy is optional and
     harmless.
   - **rewardspro-production:** redeploy only if its secrets changed.
6. **`WHOLESALE_API_KEY`**, only if step 1 did not issue it (P6 "after" order): once
   the wholesale DB works, issue the key from the temporary keychain item, stage it,
   and redeploy the storefront again. The old key is still valid, so there is no
   downtime.
7. **Verify** by behaviour:
   - `pnpm audit:deploy-verify`;
   - the next `health.yml` run, and any external heartbeat;
   - Stripe webhook deliveries return 2xx;
   - a magic-link email arrives;
   - Google sign-in works;
   - `/admin/system/cron` shows runs succeeding;
   - `wholesaletcgdirect.com` behaves as before;
   - storefront logs show no new DB or `db-source` errors;
   - outage-window logs searched for `B2B stock commit failed` (P3 step 8).
8. **Revoke the old credentials:**
   - AWS: deactivate now, delete after 24–48 h of quiet;
   - Stripe: "expire now" (optional);
   - old OAuth secrets;
   - the old `WHOLESALE_API_KEY` row (`revoked_at`, P6 step 5), then delete the
     temporary keychain item `ctcg-rotation-wholesale-url` (P11);
   - old Vercel and GitHub tokens;
   - the keychain item `cambridgetcg-wholesale-db-url` (P11).

   The old DB passwords already stopped working at step 4.
9. **Clear the clipboard** (`pbcopy </dev/null`). Turn clipboard history and Handoff
   back on if you paused them. Then add the entry to §8.

**Rollback.** A Vercel deployment keeps the env it was built with (§7).

- **Before step 4** (no RDS modification submitted): rolling back to a pre-rotation
  deployment is a valid escape hatch, because every old credential still works:
  Stripe until its expiry, AWS while the old key is active, OAuth until the old
  secret is deleted.
- **From step 4 on:** once an RDS modification is submitted, no pre-rotation
  deployment of a project that uses that database can connect. The only way out is
  forward, with a new deployment built after the env changes. Instant Rollback is
  safe only to a deployment built after those changes. After step 8 the same holds
  for every revoked credential.

## 6. The helper script

`scripts/rotate-vercel-env.sh [--dry-run | --clear] NAME TARGET PROJECT [PROJECT...]`
(zsh, macOS). It reads the clipboard with `pbpaste` and confirms that NAME already
exists on each project (`vercel env ls`, first column only). It then pipes the value
to `vercel env update NAME TARGET --project P --scope cambridgetcgs-projects
--sensitive --yes` and prints only a type hint and the length. For a DB URL the hint
is the scheme and instance label.

Modes:

- `--names-only`: checks only that NAME exists on each project. It never reads the
  clipboard and needs no `pbpaste`, so agents and preparation use it.
- `--dry-run`: also reads and shape-checks the clipboard; writes nothing. Owner only,
  because it loads whatever is on the clipboard.
- `--clear`: empties the clipboard after every project was written. If any project
  failed, the clipboard is kept so the owner can retry.

It refuses:

- an empty clipboard;
- whitespace;
- its own name;
- `NAME=value` lines;
- a URL (anything with `://`) unless NAME ends in `_URL`;
- wrong shapes (for example `sk_test_…` or `pk_live_…` as `STRIPE_SECRET_KEY`, an
  `AUTH_SECRET`, `NEXTAUTH_SECRET` or `CRON_SECRET` shorter than 32 characters or
  outside base64/hex characters, or a non-Postgres URL);
- `ENCRYPTION_*`.

Every refusal says how to clear the clipboard. It never creates a variable. If the
CLI refuses an update (for example `production_secret_must_be_separate`, P5), the
script prints the last line of the error with the value redacted and exits 1. Run
`--help` for the full contract.

The offline self-test is `zsh scripts/rotate-vercel-env.test.sh`. It runs the script
as `env -i PATH=<shims>:/usr/bin:/bin HOME=<tmp> /bin/zsh -f`, so no inherited
variable or user startup file reaches it. Fake `pbpaste`, `pbcopy` and `vercel`
shims come first on that PATH, and the test aborts before any case if those names
resolve anywhere else. The fixtures use made-up project names, and the test makes
no network calls.

## 7. Known traps

| Trap | What happens | Guard |
|---|---|---|
| The clipboard still holds the command line | The command text becomes the secret | The script refuses whitespace, its own name and `NAME=` lines |
| A page URL copied instead of the secret | A publicly known string becomes the secret | The script refuses `://` unless NAME ends in `_URL` |
| Secrets linger on the clipboard | Clipboard history and Universal Clipboard (Handoff) keep or spread them | `--clear` on the last call; pause history and Handoff (§5 step 0) |
| A push to `main` mid-sitting | The storefront auto-deploys half-staged values (AWS ID without secret; DB URL before the RDS submit) | Hold merges for the sitting (§5 step 0) |
| The wholesale URL is needed after the DB step | The clipboard has been overwritten; the Sensitive value cannot be read back | Temporary keychain item (P3 step 4) |
| Stripe's old key overlaps for at most 7 days | The live deployment keeps the old key until a redeploy; at expiry, payments and webhooks fail | Redeploy the same day. Treat the expiry as a deadline (P1) |
| Rotating `ENCRYPTION_SECRET` | Stored ciphertext becomes unreadable | P12. The script refuses the name |
| `AUTH_SECRET` side effects | Sign-in links in flight break; already-sent unsubscribe links break; cursors reset; possibly a one-time logout | Rotate in a quiet window. A separate `EMAIL_UNSUBSCRIBE_SECRET` decouples future rotations (Open items) |
| Wholesale `NEXTAUTH_SECRET` | Every wholesale JWT session ends | Expected. Mention it to wholesale users, if any |
| Tightening the RDS security group | Vercel functions lose the DB: they have no fixed egress IPs | Do not tighten it |
| Sensitive values cannot be read back | Blank pulls; a wrong paste is not visible | Verify by behaviour; read the script's hint before confirming |
| The env changed but nothing was redeployed | Production still runs the old values | §5 step 5 |
| Deploying `main` instead of redeploying | Ships unreviewed code; for wholesale, it breaks the freeze | Redeploy the current production deployment |
| The DB preview entry is forgotten | Preview deployments fail to connect | Storefront `DATABASE_URL` has a separate preview entry |
| An old deployment or local tool still uses the old AWS key | Breaks at deletion | Deactivate first and watch Last used |
| `vercel env ls --json` / `vercel env pull` | Readable values in output or files | Never in rotation work (§2) |
| Plain `vercel env ls` | Prints the first 18 characters of every non-Sensitive value | Drop the value column, or use `--names-only` (§2) |
| `printf '%s' '<value>' \| vercel env add` | The value lands in shell history | Use the script, or `pbpaste \| vercel env add NAME TARGET --sensitive` for a new variable |
| `security … -w "<value>"` | The value is in argv | Put `-w` last and let it prompt (P11) |
| Instant Rollback after an RDS submit or a revocation | Rolls back to old DB passwords that RDS already rejects, or to revoked credentials | From §5 step 4 on, roll back only to deployments built after the env changes |
| The wholesale API key fails silently | The client falls back to DB reads | Check logs (P6) |
| Copies of the leaked file | Desktop backup or sync may hold the 2026-07-25 pull (unverified) | Rotation is the remedy; deleting copies is hygiene only |

## 8. Rotation log

Record names, dates and statuses only. Never record values, key IDs or hashes.

### 2026-10-11: exposure of a storefront production env pull

**Trigger:** a plaintext production env pull, `apps/storefront/.env.prod-pull` (39
keys, mode 0644, dated 2026-07-25), sat untracked in the shared Desktop checkout. It
was deleted 2026-10-10, which revokes nothing (owner).

| Secret / step | Where | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | storefront production | in progress (2026-10-11): rolled at Stripe; Vercel updated 09:37 UTC (owner); redeploy and verification pending; the old key's expiry was chosen at the roll (7 days at most) and was not recorded here |
| `STRIPE_WEBHOOK_SECRET` | storefront production | in progress (2026-10-11): Vercel updated 09:40 UTC (owner); redeploy and verification pending |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | storefront; wholesale and admin too if they share the IAM user (unverified) | in progress (2026-10-11) |
| `AUTH_SECRET` | storefront production and preview | in progress (2026-10-11) |
| `CRON_SECRET` | storefront | in progress (2026-10-11) |
| `AUTH_GOOGLE_SECRET` | storefront | in progress (2026-10-11) |
| `ADMIN_PASSWORD` (deletion) | storefront | in progress (2026-10-11) |
| Storefront RDS master password | storefront `DATABASE_URL` (production and preview) | in progress (2026-10-11) |
| Wholesale RDS master password | tcg-wholesale `DATABASE_URL`; storefront `WHOLESALE_DATABASE_URL` if it uses the master user (unverified). Not `WHOLESALE_COVERAGE_DATABASE_URL`, which uses the coverage role (kingdom-107) | in progress (2026-10-11); depends on the wholesale redeploy rehearsal (§5 step 0) |
| Redeploy round (§5 step 5) | storefront; tcg-wholesale (same build) | pending (2026-10-11) |
| Verification (§5 step 7) | all | pending (2026-10-11) |
| `WHOLESALE_API_KEY` | storefront; wholesale `channel_api_keys` | pending (2026-10-11) |
| Revoking the old credentials (§5 step 8) | all | pending (2026-10-11) |
| Names read by source but absent from the listing (§3) | storefront | pending (2026-10-11): check by name whether any is set |

Not on the 2026-10-11 list:

- `AUTH_GITHUB_SECRET`, which probably postdates the pull (unverified);
- the wholesale project's own secrets (`NEXTAUTH_SECRET`, `CF_*`, `SHOPIFY_*`, Bright
  Data), which a storefront pull would not contain;
- RewardsPro.

The pull cannot be re-inspected, so whether all 39 names are covered is unverified.

## 9. Open items

1. **Orphaned GitHub secrets:** delete `REWARDSPRO_CRON_SECRET` and
   `REWARDSPRO_OPERATOR_READINESS_SECRET` (0 consumers). Check
   `REWARDSPRO_V2_OPERATOR_TOKEN`: the workflow references it, but it was missing from
   the listing.
2. **RewardsPro credentials in Git history:** an AWS access key and the Aurora password
   are in history, and `tfplan` and `.mcp.json` files sit in standalone repositories.
   Rotate the AWS key (P2, Terraform note) and the Aurora password or its Secrets
   Manager secret. Rewriting history revokes nothing.
3. **Least-privilege DB roles instead of superuser URLs:** for example a storefront app
   role, a read-only wholesale catalog/coverage role, and no app on the master user.
   Smaller blast radius, and future rotations stop touching the master.
4. **Restricted Stripe key:** replace `sk_live_` with an `rk_live_` key limited to the
   resources the storefront calls. The script already accepts `rk_live_`.
5. **Delete the cambridgetcg-admin secrets** (redirect shell), and the dead keychain
   item and launchd agent.
6. **Decouple derived secrets:** set `EMAIL_UNSUBSCRIBE_SECRET` and
   `MEMBER_PRICE_CURSOR_SECRET` so a future `AUTH_SECRET` rotation stops breaking
   unsubscribe links, or verify against both old and new secrets.
7. **Confirm the user behind each master-step URL** (both `DATABASE_URL`s and
   storefront `WHOLESALE_DATABASE_URL`; P3 "Which user"). The coverage URL uses its
   own role (kingdom-107). Confirm whether the coverage role's password and
   `AUTH_GITHUB_SECRET` were in the 2026-07-25 pull, and check the §3 names that are
   read by source but were absent from the listing.
8. **Cloudflare:** replace the Global API Key with a scoped token, or let wholesale
   retirement remove it (P8).
9. **Cadence:** the owner accepts or edits §1, then sets reminders. Set an expiry on
   every new token.
10. **Wholesale retirement** removes many of these secrets outright (Shopify,
    Cloudflare, Bright Data, `NEXTAUTH_SECRET`, wholesale DB URLs). See the
    [retirement runbook](wholesale-app-retirement-runbook.md).

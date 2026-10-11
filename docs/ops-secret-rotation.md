# Secret rotation protocol

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
2. **Agents may inventory NAMES only.** Use `vercel env ls <target> --project <p>
   --scope cambridgetcgs-projects`, `gh secret list` and `grep` over source. Never use
   `vercel env ls --json` or `--format json`: they include readable values. Never use
   `vercel env pull`. A pull caused the 2026-10-11 incident.
3. **Rotation is an owner action** (AGENTS.md: local authorization "does not grant …
   credential rotation"). An agent may prepare steps, run `--dry-run` and read
   behaviour after a change. It does not create, roll, revoke or redeploy.
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
| `WHOLESALE_DATABASE_URL` | wholesale RDS | storefront, production (listed) | catalog reads; `lib/wholesale/db-source.ts` fallback (src) | Storefront catalog and card pages | P3 | Catalog and card pages load | |
| `WHOLESALE_COVERAGE_DATABASE_URL` | wholesale RDS; role unverified | storefront, production (listed) | `db-source.ts` coverage reads (src) | Coverage views | P3 | Coverage views load | If it uses its own role, a master rotation leaves it unchanged. Confirm which role it uses |
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

Not secrets: `*_URL` site and app bases, `*_EMAIL` senders, bucket names, `AWS_REGION`,
`SHOPIFY_STORE`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `DD_SITE`, `*_MODE` and
`USE_*` flags. `METRICS_DATA_API` was not classified (unverified).

## 4. Procedures

**Common shape for every procedure:**

1. Inventory consumers by name (§3).
2. Create the new credential while the old one still works, when the issuer allows an
   overlap.
3. Copy it.
4. Run `scripts/rotate-vercel-env.sh --dry-run NAME TARGET PROJECT…`, then the same
   command without `--dry-run`.
5. Redeploy (§5).
6. Verify by behaviour.
7. Revoke the old credential.
8. Clear the clipboard (`pbcopy </dev/null`) and add a line to §8.

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

1. Find the IAM user behind each project's key. The value is Sensitive and cannot be
   read back. Instead, compare IAM → Users → Security credentials → each key's
   **Last used** (service and time) against the consumers in §3.
2. If that user already has two keys, delete the unused one first.
3. **Create access key.** Copy the Access key ID, then run the script with
   `AWS_ACCESS_KEY_ID production <every project using this user>`. Copy the Secret,
   then run it with `AWS_SECRET_ACCESS_KEY` and the same projects. Update both
   before any redeploy. Nothing reaches a live deployment until the redeploy, so
   there is no window where the ID and secret mismatch.
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
password. The old values are Sensitive and cannot be read back, so take the endpoint,
port and master username from the RDS console. The database name and the existing
query parameters (for example `sslmode=require`) were not recorded (unverified).

Steps, per database:

1. List every consumer (§3 Databases). The storefront DB has `DATABASE_URL` for both
   production **and** preview. The wholesale DB has `tcg-wholesale` `DATABASE_URL`
   (production and preview), plus storefront `WHOLESALE_DATABASE_URL` and possibly
   `WHOLESALE_COVERAGE_DATABASE_URL`.
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
5. Stage the URL on every consumer with the script, for example
   `scripts/rotate-vercel-env.sh DATABASE_URL production cambridgetcg-storefront`, then
   the same with `preview`. The script prints `postgresql://…@<instance>.…`. Check
   that the instance label is the database you mean before moving on.
6. Submit the RDS modification with **Apply immediately**. From now on, new
   connections that use the old password fail until the redeploy is live (minutes)
   (owner). Whether RDS also drops established connections is unverified.
7. Go straight to the redeploy round (§5 step 5). Do both databases in the same
   sitting so there is one blip, not two.

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
- **`CRON_SECRET`:** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` from the
  deployment's environment (deploy runbook), so a redeploy realigns the caller and the
  route. Any manual caller needs the new value.
- **Verify:** a magic-link sign-in works. The minute `maintenance` cron and the next
  `reconcile-stripe` run succeed on `/admin/system/cron`. Wholesale's
  `monthly-rollover` runs at 00:00 UTC.

### P5. OAuth client secrets: Google, GitHub

- **Google:** Cloud console → APIs & Services → Credentials → the OAuth client → add a
  new client secret (unverified that this client offers a second secret).
  1. Copy the `GOCSPX-…` value and run the script with `AUTH_GOOGLE_SECRET
     production cambridgetcg-storefront`. Run `vercel env ls preview` first: if
     preview has its own entry, update it too. If one entry covers both targets,
     the effect of a `production`-only update is unverified.
  2. Redeploy, then sign in with Google on production.
  3. Disable, then delete, the old secret.
- **GitHub:** Settings → Developer settings → OAuth Apps → the app → **Generate a new
  client secret**.
  1. Run the script with `AUTH_GITHUB_SECRET`. Its shape check is the generic
     16-character one.
  2. Redeploy, then sign in with GitHub.
  3. Delete the old secret.

Client IDs do not change. Existing sessions are not affected.

### P6. Wholesale channel API key (`WHOLESALE_API_KEY`)

1. Issue the new key after the wholesale DB step, because issuing needs a working
   wholesale URL. Put that URL on the clipboard, then pipe the tool's output straight
   to the clipboard:
   `cd apps/wholesale && DATABASE_URL="$(pbpaste)" pnpm tsx tools/gen-api-key.ts | sed -n 's/^RAW_KEY=//p' | tr -d '\n' | pbcopy`.
   - This writes a row to the production wholesale DB (owner action). The defaults
     are channel `cambridgetcg`, label `cambridgetcg.com storefront` and 600 rpm
     (src).
   - The tool also loads `.env.local` and `.env` from the working directory if they
     exist. Keep secrets out of those files.
   - While it runs, the URL is visible in that process's environment to your own
     user.
2. Run `scripts/rotate-vercel-env.sh WHOLESALE_API_KEY production cambridgetcg-storefront`.
   The script accepts 64 lower-case hex characters only.
3. Redeploy the storefront. This can be a second redeploy: the old key stays valid
   until it is revoked, so there is no downtime.
4. Verify by reading logs. The client falls back to direct DB reads on any HTTP
   failure (src), so a 401 does not show as a broken page. Look for `[wholesale] …
   db-source` fallback lines, or for wholesale request logs for the channel.

   The client's own comment says the wholesale domain 301s and the API times out
   (src). That conflicts with the 2026-10-11 brief, which says the storefront reads
   the partner API. Which one is true now is unverified.
5. Revoke the old key: `UPDATE channel_api_keys SET revoked_at = now() WHERE id =
   <old id>` (src docstring; migration 0017). Find the old row by
   channel/label/creation time. Do not copy `key_hash` into any log. This is an
   owner action.

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
  2. Run `pbpaste | gh secret set VERCEL_TOKEN -R cambridgetcg/Cambridge-TCG-monorepo`.
     `gh` reads the value from stdin, so it never appears in argv.
  3. Wait for the next hourly `health.yml` run, or run it by hand (owner).
  4. Delete the old token in Vercel.

  The script refuses the CLI's auto-rotated `vca_…` token (see the deploy runbook).
- **Orphans:** `gh secret delete REWARDSPRO_CRON_SECRET -R cambridgetcg/Cambridge-TCG-monorepo`,
  and the same for `REWARDSPRO_OPERATOR_READINESS_SECRET` (owner).
- **Workflow `GITHUB_TOKEN`:** this is the automatic Actions token, so there is nothing
  to rotate. The admin project's `GITHUB_TOKEN` is a PAT; delete it with the admin env.

### P11. Keychain items

- **Update an item without putting the value in argv:** put `-w` **last** with no
  value, and `security` prompts for it:
  `security add-generic-password -U -s vercel-api-token -a vercel-cambridge-tcg -w`.
  The deploy runbook's `-w "<paste-token>"` form puts the value in argv.
- **`cambridgetcg-wholesale-db-url`:** after the wholesale rotation, delete it with
  `security delete-generic-password -s cambridgetcg-wholesale-db-url`. Add `-a` if
  more than one item matches. Retire the dead agent with
  `launchctl bootout gui/$(id -u)/com.cambridgetcg.pkm-snapshot` and remove its plist.
  The plist's location is unverified. This is an owner action.

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

0. **Prepare** (no changes):
   - Log in to the Vercel CLI as the owner.
   - Run `--dry-run` for each NAME/PROJECT pair.
   - Note the current production deployment of `cambridgetcg-storefront` and
     `tcg-wholesale` (dashboard, "Current").
   - Open the issuer consoles.
   - Pick a quiet 30–60 minute window.
1. **Rolls that keep the old credential working** (no downtime): Stripe (done
   2026-10-11, owner), a new AWS key, new OAuth secrets, new tokens. Stage each in
   Vercel.
2. **Self-generated secrets:** `AUTH_SECRET` (production and preview), `CRON_SECRET`
   (each project), wholesale `NEXTAUTH_SECRET`. Stage them.
3. **Dead config:** delete `ADMIN_PASSWORD`, then the admin project's secrets (after
   the confirmation in §4).
4. **Databases last:** stage the new URLs for both databases on every consumer (P3
   steps 2–5). Then submit both RDS modifications and go straight to step 5.
5. **One redeploy round:**
   - **Storefront:** redeploy the *current production deployment* (dashboard ⋯ →
     Redeploy, or `vercel redeploy <deployment-url> --scope cambridgetcgs-projects`).
     Do not use `deploy-from-main.py`: it ships whatever `main` holds.
   - **tcg-wholesale:** same-build redeploy only. Use dashboard Redeploy of the current
     production deployment, or the gitSource call with sha
     `b43864719e70bd4ae4098154f05cd62bf7a808ce`, as in the freeze decision. Neither
     route has been tried on this unlinked project (unverified). Wholesale must be
     live on the new values **before** you revoke anything it uses. Otherwise
     `wholesaletcgdirect.com`, and any storefront reads from it, break.
   - **cambridgetcg-admin:** nothing reads its env, so a redeploy is optional and
     harmless.
   - **rewardspro-production:** redeploy only if its secrets changed.
6. **`WHOLESALE_API_KEY`** (P6): once the wholesale DB works, issue the key, stage
   it, and redeploy the storefront again. The old key is still valid, so there is no
   downtime.
7. **Verify** by behaviour:
   - `pnpm audit:deploy-verify`;
   - the next `health.yml` run, and any external heartbeat;
   - Stripe webhook deliveries return 2xx;
   - a magic-link email arrives;
   - Google sign-in works;
   - `/admin/system/cron` shows runs succeeding;
   - `wholesaletcgdirect.com` behaves as before;
   - storefront logs show no new DB or `db-source` errors.
8. **Revoke the old credentials:**
   - AWS: deactivate now, delete after 24–48 h of quiet;
   - Stripe: "expire now" (optional);
   - old OAuth secrets;
   - the old `WHOLESALE_API_KEY` row (`revoked_at`);
   - old Vercel and GitHub tokens;
   - the keychain item.

   The old DB passwords already stopped working at step 4.
9. **Clear the clipboard** (`pbcopy </dev/null`, plus any clipboard-history app).
   Then add the entry to §8.

**Rollback:** before step 8, rolling back to a pre-rotation deployment is a valid
escape hatch. After step 8, a pre-rotation deployment carries revoked credentials.
Roll back only to deployments made after the rotation.

## 6. The helper script

`scripts/rotate-vercel-env.sh [--dry-run] NAME TARGET PROJECT [PROJECT...]`
(zsh, macOS). It reads the clipboard with `pbpaste` and confirms that NAME already
exists (`vercel env ls`). It then pipes the value to `vercel env update NAME TARGET
--project P --scope cambridgetcgs-projects --sensitive --yes` and prints only a type
hint and the length. For a DB URL the hint is the scheme and instance label.

It refuses:

- an empty clipboard;
- whitespace;
- its own name;
- `NAME=value` lines;
- wrong shapes (for example `sk_test_…` or `pk_live_…` as `STRIPE_SECRET_KEY`, a
  short `AUTH_SECRET`, or a non-Postgres URL);
- `ENCRYPTION_*`.

It never creates a variable. `--dry-run` writes nothing. Run `--help` for the full
contract. The offline self-test is `zsh scripts/rotate-vercel-env.test.sh`. It uses a
fake `pbpaste` and a fake `vercel` on PATH and makes no network calls.

## 7. Known traps

| Trap | What happens | Guard |
|---|---|---|
| The clipboard still holds the command line | The command text becomes the secret | The script refuses whitespace, its own name and `NAME=` lines |
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
| `printf '%s' '<value>' \| vercel env add` (deploy runbook example) | The value lands in shell history | Use the script (clipboard → stdin) |
| `security … -w "<value>"` | The value is in argv | Put `-w` last and let it prompt (P11) |
| Instant Rollback after revocation | Rolls back to revoked credentials | Roll back only to post-rotation deployments |
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
| Wholesale RDS master password | tcg-wholesale `DATABASE_URL`; storefront `WHOLESALE_DATABASE_URL` (and `WHOLESALE_COVERAGE_DATABASE_URL` if it uses the master role, unverified) | in progress (2026-10-11) |
| Redeploy round (§5 step 5) | storefront; tcg-wholesale (same build) | pending (2026-10-11) |
| Verification (§5 step 7) | all | pending (2026-10-11) |
| `WHOLESALE_API_KEY` | storefront; wholesale `channel_api_keys` | pending (2026-10-11) |
| Revoking the old credentials (§5 step 8) | all | pending (2026-10-11) |

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
7. **Confirm which role `WHOLESALE_COVERAGE_DATABASE_URL` uses,** and whether
   `AUTH_GITHUB_SECRET` was in the 2026-07-25 pull.
8. **Cloudflare:** replace the Global API Key with a scoped token, or let wholesale
   retirement remove it (P8).
9. **Cadence:** the owner accepts or edits §1, then sets reminders. Set an expiry on
   every new token.
10. **Wholesale retirement** removes many of these secrets outright (Shopify,
    Cloudflare, Bright Data, `NEXTAUTH_SECRET`, wholesale DB URLs). See the
    [retirement runbook](wholesale-app-retirement-runbook.md).

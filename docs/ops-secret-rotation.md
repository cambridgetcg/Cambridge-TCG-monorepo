# Secrets: assume breach

**Will trace:** Yu, 2026-10-11: "now the keys only last 7 days max … prob need a
rotation protocol." Yu, 2026-10-28: "依家cyber能力太勁😂 易攻難守. 基本上一定穿窿"
(attacks are cheap now and defence is hard; assume we will be breached).

These are principles, in the sense of [AGENTS.md](../AGENTS.md): each gives its
reason, so use judgement. The cadence table near the end is a proposal until Yu
chooses. Per-secret details (which projects hold what, side effects, provider
steps) live in the [playbooks](ops-secret-rotation-playbooks.md), a snapshot
from 2026-10-11.

## The stance

Every secret we hold will leak one day. It might go through a commit, a log, an env
pull, a screenshot, a vendor breach or an agent transcript. We can't build a wall
that never fails. What we can do is make a leak worth little, notice it fast and
close it in minutes.

## Principles

1. **Hold fewer secrets.** Prefer credentials that expire on their own (OIDC,
   short-lived tokens, provider-managed integrations) over static keys. Delete any
   variable that nothing reads.
   *Why:* a secret that doesn't exist can't leak, and a key that expires in an hour
   is worth little to whoever finds it. PR #71 replaces the storefront's static AWS
   key with Vercel OIDC this way.

2. **Keep each one small.** Give a token only the scopes its app uses. Use one
   credential per app and per environment, and keep superuser database URLs out of
   apps.
   *Why:* when a credential leaks, the damage is as big as its permissions.

3. **Notice fast.** Keep GitHub secret scanning and push protection on for every
   repository, and act on the alerts. Treat any value seen outside its store as
   leaked.
   *Why:* the time between a leak and its rotation belongs to the attacker, and
   scrapers find secrets in public repositories within minutes.

4. **Keep rotation cheap.** One command should replace a value without a person
   copying it. Then redeploy, verify and revoke the old value. If rotating something
   hurts, fix that before anything else.
   *Why:* a painful rotation gets put off, while a cheap one can become routine and
   double as a drill.

5. **Keep values away from eyes, chat, argv, logs and files.** Pipe the value from
   its generator or provider straight into the store, and store it as Sensitive.
   Refer to secrets by name. If something must be identified, use a key ID's last
   four characters, never the value.
   *Why:* every place a value lands is one more place it can leak from, and agent
   transcripts count.

6. **Deleting isn't revoking.** Removing a file, rewriting history or making a
   repository private revokes nothing. Only the issuer can revoke, so confirm that
   the old credential is dead: the provider should refuse it.
   *Why:* copies already exist in forks, caches, scrapers and backups.

7. **Log what happened, never the value.** Record the name, where it lives, the
   date, the status and how it was verified.
   *Why:* the next person needs to know what is still open.

Starting a production rotation is Yu's call (AGENTS.md, principle 1). Once Yu says
go, an agent may run the cheap path below.

## The cheap path

**Self-generated secrets** (`AUTH_SECRET`, `NEXTAUTH_SECRET`, `CRON_SECRET`): use a
fresh value for each target.

```sh
openssl rand -hex 32 | tr -d '\n' | vercel env update NAME production \
  --sensitive --yes --project PROJECT --scope cambridgetcgs-projects
```

**Provider-issued secrets** (Stripe, Google OAuth, Shopify, AWS keys): roll the
secret at the provider, copy it, and run
[`scripts/rotate-vercel-env.sh`](../scripts/rotate-vercel-env.sh)` NAME TARGET PROJECT`.
The script moves the value from the clipboard to stdin and refuses obvious
mis-pastes.

**Then, for both kinds:**

1. Redeploy, because an env change only reaches new deployments:
   `vercel redeploy <current production url> --target production`.
2. Verify by behaviour. For example, a sign-in works, a cron run succeeds, or a
   webhook arrives.
3. Revoke the old value at the issuer, and confirm the issuer refuses it.
4. Add a line to the log below.

## Cadence (proposal, for Yu to choose)

| Class | Proposal | Why |
|---|---|---|
| Anything leaked or possibly leaked | Now | Assume it is already in use |
| Static cloud keys (AWS) | Replace with OIDC; 90 days until then | Static keys are the most valuable to steal |
| Vercel and GitHub tokens | 90 days, with an expiry set on the token | The expiry enforces the schedule |
| Stripe, OAuth client secrets, third-party API keys | 12 months | Providers allow an overlap, so a roll costs no downtime |
| `CRON_SECRET`, DB passwords | 12 months | Cheap, apart from a connection blip |
| `AUTH_SECRET`, `NEXTAUTH_SECRET` | On exposure | Users see side effects (playbooks §4 P4) |

## Log

### 2026-10-28

- Yu made every non-archived cambridgetcg repository public. Secret scanning and
  push protection were turned on for all 382 of them.
- **The first scan found 11 alerts across 5 repositories.** Each value was tested
  read-only by piping it from the alert API into the provider, so no value was ever
  shown. Old AWS keys, an expired STS key and a GitHub OAuth token were all dead and
  were resolved as revoked. Two credentials are live (see Open). Two Cloudflare
  account tokens returned 401 against the one known account; they are probably dead
  but not confirmed.
- **Storefront `AUTH_SECRET`** (production and preview): rotated through the cheap
  path, with a separate value for each target. Production was redeployed. Verified
  by CSRF token issuance on cambridgetcg.com. A magic-link sign-in is not yet tested.
- **Old standalone `cambridgetcg-storefront` repository:** its history held a
  committed log and state file with app secrets, an AWS key pair and a database URL.
  The repository was made private again. `AUTH_SECRET` is now rotated. The AWS pair
  was verified dead (AWS STS returned `InvalidClientTokenId`). The database password
  was rotated on 2026-10-11/12.
- **Monorepo secret-scanning alerts #1 to #3** (a Shopify token in a wholesale tool,
  and an AWS pair in the RewardsPro docs): all verified dead (Shopify returned 401;
  STS returned `InvalidClientTokenId`) and resolved as revoked.

### Open

- **eBay production keyset (Cert ID):** live, found by secret scanning. Reset it,
  then update every store that holds it.
- **Shopify Partner API client token:** live, found by secret scanning. Revoke it, and
  replace it only if something still uses it.
- The two Cloudflare account-token alerts: confirm they are revoked in the dashboard
- `CRON_SECRET` (storefront, tcg-wholesale, rewardspro-production)
- `AUTH_GOOGLE_SECRET` (storefront)
- `WHOLESALE_API_KEY` (storefront, and the key row on the wholesale side)
- `ADMIN_PASSWORD` on the storefront: delete it
- `AUTH_SECRET` and `NEXTAUTH_SECRET` on cambridgetcg-admin: delete them (nothing reads
  them)
- Secrets still stored as plain Config instead of Sensitive: `WHOLESALE_API_KEY`
  (storefront), and `CRON_SECRET` and `NEXTAUTH_SECRET` (tcg-wholesale)
- PR #71: switch the storefront's AWS access to OIDC
- Earlier entries: playbooks §8 (2026-10-11)

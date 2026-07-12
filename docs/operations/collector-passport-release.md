# Collector Passport release runbook

This runbook covers storefront migrations 0120–0122 and the code that depends
on them. It does not authorize a production change. A generic “push/deploy”
request is not enough to apply production schema or enable private object
storage; record Yu's explicit approval for the named environment and migration
set immediately before the action.

## What the three migrations do

1. `0120_collector_passport.sql` adds private-by-default, collector-authored
   Passport fields and a publication/withdrawal receipt log. Existing showcase
   rows remain unpublished.
2. `0121_collector_media_vault.sql` adds an owner-only opaque-object ledger and
   atomic quota reservation function. It creates no bucket and the runtime mode
   remains `off`.
3. `0122_source_rights_workbench.sql` adds non-effective review proposals. No
   row can override the deployed source registry and there is no activation
   endpoint.

The code reads all three new schemas. Apply the migrations in numeric order
before deploying this commit. Do not enable media intake as part of the same
change.

## Preflight

- Confirm the target database and Vercel project in words.
- Take a database snapshot and record its identifier, start/end time and known
  retention.
- Record current row counts for `users`, `portfolio_cards`, `showcase_cards`
  and `collectives`.
- Confirm migrations 0117–0119 are present and their retention cleanup is
  operating.
- Run `pnpm verify`, the full storefront Vitest suite, storefront production
  build and `git diff --check` on the exact commit.
- Read `docs/operations/collector-media-vault.md`; leave
  `COLLECTOR_MEDIA_VAULT_MODE=off`.

## Apply

From `apps/storefront`, against the explicitly named database, use the tracked
runner's bounded `--only` mode. It removes a file-owned outer `BEGIN/COMMIT`
before wrapping the body and its `schema_migrations` insert in one transaction:

```sh
node scripts/migrate.mjs --only 0120_collector_passport.sql,0121_collector_media_vault.sql,0122_source_rights_workbench.sql
```

The runner applies only those filenames in lexical order and records each one.
Stop at the first failure. Do not use raw `psql -f` without also solving the
`schema_migrations` ledger atomically, and do not edit a partially applied
database by hand while the cause is unknown.

## Database verification

- Every existing `showcase_cards.passport_public` is false.
- No publication log row was fabricated by migration.
- The three new tables exist with their checks and indexes.
- `collector_media_vault` is empty.
- `source_rights_review_versions` and `source_rights_review_cells` are empty.
- `reserve_collector_media_vault_object` is `SECURITY INVOKER`.
- Application and migration database identities have only their expected
  privileges.

## Deploy with doors closed

Deploy the reviewed code with media mode `off` and no public bucket changes.
The release must not change any existing quote, avatar, auction, trade-photo,
identity-document or dispute-evidence upload pause.

Smoke checks:

- Signed-out owner Passport/media/admin APIs reject.
- A private draft remains absent from the public exact-handle API.
- Publishing one collector-authored label creates one current item; no SKU,
  card/set field, image, holding, cost, date, note, value or internal id appears.
- Withdrawal returns the same public 404 as an unknown/private profile.
- Making the profile private withdraws every item; reopening it does not revive
  them.
- Private JSON archive downloads no-store and excludes the documented
  mixed-source fields.
- `/account/media` says “Built, not enabled” and sends no S3 request.
- Source Rights admin shows deployed policy as effective and proposals as not
  effective. Public `/api/v1/sources` contains no proposal or agreement data.
- Maintenance can redact Passport/source-review actor ids and delete expired
  Passport receipts in a disposable fixture.

## Media enablement is a later release

Do not switch media to `read-only` or `on` until the separate media runbook's
bucket, KMS, IAM, account-erasure, cleanup and staging-probe gates pass. The
first production media release should be `read-only`, followed by explicit
approval for `on`.

## Rollback

If application checks fail, return the deployment to the last known-good code.
Leave the additive schemas in place while investigating; old code ignores
them. Set media mode to `off` before any other rollback action. Do not drop
tables, truncate receipts, restore publication defaults, or restore a snapshot
without a separate evidence-backed decision.

If an item was published unexpectedly, withdraw it through the same transition
so the receipt remains truthful. Do not repair privacy by deleting the audit
fact first.

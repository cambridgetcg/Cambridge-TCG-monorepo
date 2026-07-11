# Person publication reset

Migration `0117_privacy_defaults.sql` is schema-only. It adds versioned receipt
columns, makes new person-facing rows private by default, and creates a private
audit ledger. It does not change existing publication choices during an
application deploy.

The separate reset command is deliberately dry-run first. Run it only after the
new application gates are live and public probes confirm that a row without a
current receipt is not served.

The same operation clears legacy `phone_verified` flags created by the old
self-submission stub. Those rows contain no verification evidence. The reset
does not erase the submitted phone number; runtime code does not read or trust
it, and any later deletion is a separate retention decision.

## Release order

1. Take an encrypted database snapshot, wait until it is available, verify that
   encryption is reported as enabled, and record its identifier outside the
   repository. Stop if any of those checks fail.
2. Record one UTC cutoff immediately before the schema/application release. Use
   that exact timestamp for every preview and apply command below.
3. Plan migrations and stop unless `0117_privacy_defaults.sql` is the only
   pending file. Then apply that exact plan and verify its six receipt columns,
   two ledger tables, and private defaults exist. Do not deploy the application
   before this succeeds; its queries read the new columns.
4. Deploy the gated application. Probe a private profile, review, activity,
   message recipient, collective member, and suspended account. Unknown and
   unpublished people must be indistinguishable on public routes.
5. Run the read-only preview. Save its JSON output with the release record.

Load `STOREFRONT_DATABASE_URL` from Keychain or the deployment secret store
without printing it or putting it in shell history. The command also reads an
untracked `apps/storefront/.env.local` when that is the deployment tool's secure
output. Confirm the variable or file exists without displaying its value.

With the secure connection exposed to the command as `DATABASE_URL`, run the
read-only plan first. `--expect-only` makes both commands stop if production is
missing an older migration or if another migration has appeared.

```sh
pnpm --filter cambridgetcg-storefront exec node scripts/migrate.mjs \
  --plan --expect-only 0117_privacy_defaults.sql

pnpm --filter cambridgetcg-storefront exec node scripts/migrate.mjs \
  --expect-only 0117_privacy_defaults.sql
```

Do not use the unrestricted migration command for this release.

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts \
  --legacy-before='2026-07-11T20:00:00Z'
```

The preview performs no writes. Counts cover only legacy rows before the cutoff.
Profile, messaging, and review rows with a current receipt are excluded, so a
new choice made after the gated deploy is not erased. The preview separately
counts legacy self-submitted phone flags that will be cleared.

## Apply once

Compare the preview counts with the pre-release counts and snapshot. Yu must
confirm the data operation explicitly. Then run:

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts \
  --apply \
  --gated-app-live \
  --legacy-before='2026-07-11T20:00:00Z' \
  --confirm='APPLY-PERSON-PUBLICATION-RESET-20260711'
```

The command takes one advisory lock and one short database transaction. It
captures each affected identifier and prior boolean/visibility value, verifies
capture and update counts match, performs the reset, and writes the one-shot run
marker. Any error rolls the entire operation back. A second apply reports the
existing run and does not reset choices made later.

## Reconcile

After apply, run the read-only reconciliation:

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts --reconcile
```

`ledger` is what the reset captured. `still_reset` is the subset currently at
the reset baseline. `changed_since_reset` includes rows now at a different
value or missing. Reconciliation is not a change history: a later explicit
private choice can have the same value as the reset baseline and is therefore
indistinguishable without a per-field change marker.

Repeat the public probes after reconciliation. Do not log or publish the ledger:
it contains internal row identifiers even though it contains no profile,
message, review, or collection content.

## Rollback and recovery

There is intentionally no automated logical rollback command. After the reset,
an untouched `false` or `private` value is indistinguishable from a person's
later explicit choice of that same value. Replaying the audit ledger could
therefore republish a profile, message setting, activity, collective membership,
or review after its owner chose privacy.

An application rollback must leave the reset `false` and `private` values
intact. Restore the previous application only under a restricted or read-only
posture until its public readers and writers are confirmed compatible with
those values and the additive receipt columns. Do not update ledger rows back
to `true` or `public` as part of an application rollback.

The pre-release database snapshot is the only full data-recovery path. Snapshot
recovery is an operator-controlled incident action, not this script's inverse:
it may overwrite every post-snapshot change, including unrelated trades,
orders, reviews, and account choices. Use a maintenance window, compare the
snapshot with current state, record the accepted data loss, and obtain explicit
operator approval before restoring it.

The ledger and run marker remain private for audit and reconciliation. A future
logical restore is safe only after every affected field has a durable change
marker that can distinguish reset state from a later same-value choice.

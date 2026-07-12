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

## Exact reset scope

The preview and apply use the following predicates. The cutoff is the one UTC
timestamp recorded after the gated deployment is ready and probed.

| Table | Rows selected | Apply action |
| --- | --- | --- |
| `users` | Non-service accounts created before the cutoff with `is_public=TRUE` and no current profile-publication receipt | Set `is_public=FALSE` |
| `users` | Non-service accounts created before the cutoff with `accepts_messages=TRUE` and no current messaging receipt | Set `accepts_messages=FALSE` |
| `activity_feed` | Rows created before the cutoff with `is_public=TRUE` | Set `is_public=FALSE` |
| `collective_members` | Rows invited before the cutoff with `visibility='public'` | Set `visibility='private'` |
| `trade_reviews` | Rows created before the cutoff with `is_public=TRUE` and no current publication receipt | Set `is_public=FALSE` |
| `user_bounty_eligibility` | Every row with `phone_verified=TRUE`, regardless of cutoff | Set `phone_verified=FALSE`, clear `phone_verified_at`, and refresh `updated_at`; the submitted phone number remains |
| `peer_arrivals` | Rows with `arrived_at` before the cutoff | Delete the row |
| `agent_guestbook` | Rows with `created_at` before the cutoff | Delete the row |
| `agent_match_queue` | Rows with `enqueued_at` before the cutoff | Delete the row |
| `agent_registration_buckets` | Rows whose UTC `bucket_day` is on or before the cutoff's UTC date | Delete the row |
| `agent_rate_buckets` | Rows whose `bucket_minute` is earlier than seven days before the cutoff | Delete the row |
| `users` service steward | The pre-cutoff `agents-self-serve@cambridgetcg.com` row when public or accepting messages | Set `is_public=FALSE` and `accepts_messages=FALSE` |
| `carried_state` | Rows with `created_at` before the cutoff | Delete the row |
| `agent_feedback` | Rows with `received_at` before the cutoff | Delete the row |

Deleted row content is not copied into the reset ledger. The ledger records the
affected identifier and that the row was present; only the encrypted snapshot
is a full recovery source for deleted content.

## Release order

1. Take an encrypted database snapshot, wait until it is available, verify that
   encryption is reported as enabled, and record its identifier outside the
   repository. Stop if any of those checks fail.
2. Plan migrations. If `0117_privacy_defaults.sql` is pending, stop unless it
   is the only pending file, then apply that exact plan. If the plan reports no
   pending migrations, do not try to reapply it. In either case, verify the six
   receipt columns, two ledger tables, and private defaults exist before
   deploying; the application reads them. Stop on any other migration plan.
3. Deploy the gated application and wait until the production deployment reports
   `READY`. Probe a private profile, review, activity, message recipient,
   collective member, and suspended account. Unknown and unpublished people
   must be indistinguishable on public routes. Stop if deployment readiness or
   any probe fails.
4. Only after step 3 succeeds, record one UTC cutoff. Never record or reuse a
   cutoff from before this gated production deployment was `READY` and probed.
   Use that exact timestamp for every preview and apply command below.
5. Run the read-only preview. Save its JSON output with the release record.

Load `STOREFRONT_DATABASE_URL` from Keychain or the deployment secret store
without printing it or putting it in shell history. The command also reads an
untracked `apps/storefront/.env.local` when that is the deployment tool's secure
output. Confirm the variable or file exists without displaying its value.

Download the current AWS RDS trust bundle to a temporary file. The migration
and reset commands refuse to connect without it, so TLS verifies both the
certificate chain and the database endpoint name. The file contains no secret.

```sh
RDS_CA_FILE="$(mktemp -t cambridgetcg-rds-ca)"
export RDS_CA_FILE
trap 'rm -f "$RDS_CA_FILE"' EXIT
node -e '
  fetch("https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem")
    .then((response) => {
      if (!response.ok) throw new Error(`RDS CA download failed: ${response.status}`);
      return response.text();
    })
    .then((body) => {
      if (!body.includes("-----BEGIN CERTIFICATE-----")) {
        throw new Error("RDS CA download was not a PEM bundle");
      }
      require("node:fs").writeFileSync(process.env.RDS_CA_FILE, body, { mode: 0o600 });
    });
'
```

Set the cutoff once in the release shell. Replace the placeholder with the UTC
timestamp recorded in step 4; the guard stops the release if it is unchanged.

```sh
LEGACY_CUTOFF='<recorded-UTC-cutoff>'
test "$LEGACY_CUTOFF" != '<recorded-UTC-cutoff>' || exit 1
```

With the secure connection exposed to the command as `DATABASE_URL`, run the
read-only plan first.

```sh
pnpm --filter cambridgetcg-storefront exec node scripts/migrate.mjs \
  --ca-file "$RDS_CA_FILE" \
  --plan
```

Continue only if the result is exactly `0117_privacy_defaults.sql` or `No
pending migrations.` If `0117_privacy_defaults.sql` is pending, apply it with
the exact guard below. `--expect-only` stops if production is missing an older
migration or another migration has appeared.

```sh
pnpm --filter cambridgetcg-storefront exec node scripts/migrate.mjs \
  --ca-file "$RDS_CA_FILE" \
  --expect-only 0117_privacy_defaults.sql
```

Skip that apply command when the plan says `No pending migrations.` The reset
preview performs the detailed `0117` schema check before it reports any
candidates, and stops without writing if the schema is incomplete.

Do not use the unrestricted migration command for this release.

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts \
  --ca-file="$RDS_CA_FILE" \
  --legacy-before="$LEGACY_CUTOFF"
```

The preview performs no writes and reports a separate count for every row class
in the exact-scope table above. Profile, messaging, and review rows with a
current receipt are excluded, so a new choice made after the gated deploy is
not erased. Phone flags are counted regardless of cutoff; registration buckets
use the cutoff's UTC date; stale rate buckets use cutoff minus seven days.

## Apply once

Compare every preview count with the pre-release counts and snapshot. Yu must
explicitly approve all updates and permanent row deletions in the exact-scope
table, with the understanding that deleted content has only snapshot-based full
recovery. Then run:

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts \
  --apply \
  --gated-app-live \
  --ca-file="$RDS_CA_FILE" \
  --legacy-before="$LEGACY_CUTOFF" \
  --confirm='APPLY-PERSON-PUBLICATION-RESET-20260711'
```

The command takes one advisory lock and one short database transaction. It
captures each affected identifier, the prior value for updates, and a
`row-present` marker for deletions. It verifies capture and action counts match,
performs the reset, and writes the one-shot run marker. Any error rolls the
entire operation back. A second apply reports the existing run and does not
reset choices made later.

## Reconcile

After apply, run the read-only reconciliation:

```sh
pnpm --filter cambridgetcg-storefront exec tsx \
  scripts/reset-person-publication.ts \
  --ca-file="$RDS_CA_FILE" \
  --reconcile
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

The ledger also cannot recreate deleted peer arrivals, guestbook entries, match
queue rows, registration or rate buckets, carried state, or agent feedback. It
records identifiers, not deleted row content.

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

# Community data network release

This release expands organisation and catalog coverage while making every
person-facing community surface private by default. Apply it in this order so
the application never asks for columns that do not exist yet.

## Before deployment

1. Take the normal encrypted database snapshot.
2. Record the current production commit and the counts of public profiles,
   message preferences, public activity rows, public reviews and public
   collective members. Also record the count of `agent_feedback` rows whose
   content has not yet been redacted.
3. Record the configured RDS snapshot/backup retention. Active rollback rows
   are dropped within 30 days, but backup copies age out on that separate
   schedule. Do not proceed while the backup retention is unknown.
4. Get Yu's explicit confirmation for the production data operation in
   migration 0117 and record when and where it was given. A request to build,
   push or deploy application code is not that confirmation. No confirmation
   means stop before the first `psql` command.
5. From the repository root, apply each migration manually and fail on the
   first SQL error:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/storefront/drizzle/0117_privacy_defaults.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/storefront/drizzle/0118_collective_directory.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/storefront/drizzle/0119_feedback_retention.sql
   ```

   Never use shell tracing and never print `DATABASE_URL`.
6. Confirm all three migrations completed, the one-shot marker
   `0117_privacy_defaults_20260711` exists in `privacy_migration_history`, the
   five defaults in migration
   0117 are private/off, every feedback row has `content_expires_at` and
   `lifecycle_expires_at`, and the `privacy_action_rate_buckets` table
   exists. Confirm every directory publication receipt has
   `actor_expires_at` and `receipt_expires_at`; confirm the content,
   lifecycle, actor, receipt and action-bucket expiry indexes exist.
7. Confirm either `RATE_LIMIT_HASH_SECRET` or `AUTH_SECRET` is configured with
   at least 32 characters. Do not print the secret. Feedback POST fails closed
   with 503 when neither safe hashing secret is available.
8. Confirm the trusted deployment edge overwrites `x-forwarded-for` or
   `x-real-ip` with the connecting client IP. The feedback limiter trusts the
   first forwarded address, as the existing Vercel deployment does. If a
   replacement proxy passes caller-supplied forwarding headers through, keep
   the public POST disabled until that proxy boundary is fixed; otherwise a
   caller could rotate header values to avoid the limit.
9. Record the greatest public-upload presign TTL the previous build could
   mint. The retired helper's default was 600 seconds. Deploying paused routes
   does not revoke a URL already issued by object storage.

Migration 0117 records each changed row in
`privacy_publication_reset_20260711`. The ledger contains internal identifiers
and prior settings only. Keep it private only through the rollback review and
drop it no later than its earliest `delete_after` deadline (30 days after
migration application):

```sql
SELECT MIN(delete_after) AS deadline
  FROM privacy_publication_reset_20260711;
-- After production probes and the rollback review are closed:
DROP TABLE privacy_publication_reset_20260711;
```

## Deploy and probe

Deploy the storefront only after all three migrations are present. Then check:

- `/api/v1/coverage`
- `/api/v1/directory/organisations`
- `/api/v1/directory/coverage`
- `/api/v1/directory/schema`
- `/api/v1/sources`
- `GET /api/v1/feedback` describes 180-day content retention and the enforced
  5/hour + 20/day HMAC bucket limits
- a valid feedback POST returns `status: "received"`, `persisted: true` and a
  `content_expires_at` plus `lifecycle_expires_at`; verify application logs
  contain only its reference, kind and lifecycle timestamps — never message
  content or contact details
- trigger one authenticated maintenance tick and require
  `feedbackRetentionSweep.status="fulfilled"`. Then require each query below
  to return zero:

  ```sql
  SELECT COUNT(*) FROM agent_feedback
   WHERE content_expires_at <= NOW()
     AND (content_redacted_at IS NULL OR reporter_contact IS NOT NULL
          OR notes IS NOT NULL OR triaged_by IS NOT NULL
          OR raw_body <> jsonb_build_object('retention_redacted', TRUE));

  SELECT COUNT(*) FROM agent_feedback AS feedback
   WHERE lifecycle_expires_at <= NOW()
     AND NOT EXISTS (
       SELECT 1 FROM agent_feedback AS child
        WHERE child.duplicate_of_id = feedback.id
     );

  SELECT COUNT(*) FROM collective_directory_publication_log
   WHERE (actor_user_id IS NOT NULL AND actor_expires_at <= NOW())
      OR receipt_expires_at <= NOW();

  SELECT COUNT(*) FROM privacy_action_rate_buckets
   WHERE expires_at <= NOW();

  SELECT COUNT(*) FROM agent_registration_buckets;

  SELECT COUNT(*) FROM email_unsubscribe_log
   WHERE ip IS NOT NULL OR user_agent IS NOT NULL;
  ```
- `/api/v1/bridge` returns `status: "paused"`
- a private username returns the same 404 shape as an unknown username
- the account profile page can independently publish a profile and allow
  direct messages
- every quote, avatar, auction-image and trade-photo upload/signing route
  returns `503` with `code: "public_upload_intake_paused"`, and neither an
  auction-image nor trade-photo phase-two URL can be registered

### Drain presigned uploads before calling the release safe

After the paused upload build is live, wait at least the greatest upload URL
TTL the previous build could mint (currently 600 seconds). This is a release
gate: a URL minted one second before deploy can otherwise create a publicly
readable object after an earlier zero-count audit.

After the full drain, re-run a read-only whole-bucket inventory and the
`verifications/`, `disputes/`, `quotes/`, auction and trade-photo prefix
counts. Require zero objects everywhere before closing the gate. Also record
all four S3 Public Access Block flags and the effective bucket-policy public
read statement. The audited bucket currently permits public reads, so a
non-zero count is release-blocking: keep intake paused, restrict public access,
and investigate rather than treating it as harmless media. Never print AWS
credentials in the release log.

Do not publish a seeded organisation until its steward has confirmed the
organisation facts and public contact link. Do not seed members, attendees or
personal contact details.

## Off-switch

If the directory causes harm or exposes a field unexpectedly, unpublish all
collectives first:

```sql
BEGIN;
UPDATE collectives
   SET directory_listed = FALSE,
       directory_listed_at = NULL,
       directory_notice_version = NULL,
       directory_authority_attested_at = NULL,
       updated_at = NOW()
 WHERE directory_listed = TRUE;
COMMIT;
```

The directory then fails closed without unpublishing unrelated `/c` web
profiles. Other surfaces retain their own independent publication state;
mixed-source card, set and price coverage remains paused. Record the operator
incident separately because this emergency database switch is not a steward
action. Do not roll application code back to a pre-release commit:
that would restore public collective rosters, unsafe feedback logging and old
publication defaults. Keep the privacy-hardening build live, or deploy a
forward fix that preserves its public projections, feedback persistence and
retention sweep while disabling the faulty directory code.

Restoring a person's prior publication setting is a separate, deliberate
decision. Use the private migration ledger and the database snapshot; never
bulk-restore those settings merely to make a rollback look identical.

Migration 0119 introduces an intentional deletion boundary. Once the
maintenance sweep redacts content and contact from an expired feedback row,
rolling back application
code or schema does not recreate the removed message or reply address. The
minimised lifecycle row remains only until two years after receipt, when it is
deleted. Expired HMAC rate buckets are deleted entirely.
Migration 0118 gives each private directory receipt actor id the same 180-day
boundary; after it is detached, the pseudonymised receipt remains only until
its two-year deletion deadline.

# Collector Media Vault

The Collector Media Vault is an isolated, owner-only store for ordinary
collection photos. It does not reopen avatar, auction, trade, dispute, quote,
or identity-document uploads. Those routes keep their existing pauses.

The subsystem deploys safely with `COLLECTOR_MEDIA_VAULT_MODE=off`. Do not set
it to `read-only` or `on` until every prerequisite below has been recorded and
tested in the target environment.

## What the server accepts

- One raw JPEG, PNG, or WebP request body; no multipart form and no filename.
- At most 3 MiB, enforced from both `Content-Length` and a bounded stream read.
- At most 40 million decoded pixels and one image frame.
- The declared content type must match the decoded format.
- Sharp applies orientation, strips metadata, fits within 4096 × 4096, and
  creates a WebP no larger than 3 MiB before any storage call.

The database reserves an owner quota before the write: 20 rows and 100 MiB,
counting pending, ready, and cleanup-owned deleting rows. The reservation function holds an
account-scoped PostgreSQL advisory lock across usage calculation and insert.
The object key is 256 random bits and contains no account id or filename.

## Modes

| Mode | Metadata list | Download | New upload | Delete |
| --- | --- | --- | --- | --- |
| `off` with complete config | allowed | blocked | blocked | allowed |
| absent/incomplete config | blocked | blocked | blocked | blocked |
| `read-only` | allowed | allowed | blocked | allowed |
| `on` | allowed | allowed | allowed | allowed |

Every unavailable operation returns `503` before reading an upload body. Delete
is deliberately independent of the intake switch. If storage configuration is
missing, deletion fails while retaining the database row and object pointer.

## Dedicated environment

All values are required except the session token. There is no fallback to
`AWS_*`, `AUCTION_S3_BUCKET`, or any shared client.

```text
COLLECTOR_MEDIA_VAULT_MODE=off
COLLECTOR_MEDIA_VAULT_BUCKET=
COLLECTOR_MEDIA_VAULT_REGION=eu-west-2
COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN=
COLLECTOR_MEDIA_VAULT_ACCESS_KEY_ID=
COLLECTOR_MEDIA_VAULT_SECRET_ACCESS_KEY=
COLLECTOR_MEDIA_VAULT_SESSION_TOKEN=
COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED=false
```

Use a dedicated workload identity where the platform supports short-lived
credentials. The static-looking names above are a deployment interface, not a
recommendation to create long-lived keys.

## AWS prerequisites

Create a new bucket. Never reuse the former public media bucket.

1. Enable all four S3 Block Public Access controls at both account and bucket
   level. Record the read-only verification output.
2. Set Object Ownership to `BucketOwnerEnforced`; ACLs must be disabled.
3. Disable website hosting. Have no public bucket policy or access point.
4. Deny requests without TLS.
5. Configure default SSE-KMS with a customer-managed key and S3 Bucket Keys.
   The application derives `ExpectedBucketOwner` from the 12-digit account in
   this key ARN and sends it with every S3 operation.
6. Give the vault principal only these bucket/prefix operations:
   `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` under
   `collector-media/v1/*`, plus only the KMS encrypt/decrypt/data-key operations
   required for that key. It must not change bucket policies, ACLs, ownership,
   encryption, lifecycle, or public-access settings.
7. Require the exact KMS key and `aws:kms` encryption in bucket policy. Deny
   unencrypted or differently encrypted writes.
8. Do not configure browser CORS. Uploads pass through the authenticated
   server, so the bucket has no browser upload origin.
9. Verify the shipped maintenance cleanup for pending rows whose
   `pending_expires_at` is older than 24 hours. It runs in bounded batches,
   deletes S3 first and the row second, and keeps the pointer for retry when S3
   deletion is not confirmed. A bucket lifecycle rule may be a second safety
   net, but must leave enough time for the application cleanup and must not
   replace its database reconciliation.
10. Keep object versioning disabled unless the delete path is extended and
    tested to remove every version and delete marker. Do not enable Object Lock.

AWS references:

- [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [S3 Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [Default bucket encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html)
- [Lifecycle rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html)

## Privacy and deletion prerequisites

Before enabling intake, approve and publish the collection-photo purpose,
lawful basis, owner notice, retention period, support process, and account
erasure behavior. The migration deliberately uses `ON DELETE RESTRICT` for the
owner foreign key: deleting an account without deleting its objects would
otherwise erase the only private object pointer and leave an orphan in S3.

The account-erasure workflow must therefore:

1. list the owner's vault rows;
2. delete every referenced S3 object;
3. delete the rows and confirm no rows remain;
4. only then delete the user record.

Do not set `COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED=true` until that workflow
and a failed-S3-delete retry have been tested. Non-off modes fail closed without
that explicit operational assertion. Logging must never contain request bodies, signed URLs, object keys,
checksums, bucket names, credentials, or account ids. Existing route logs use
only a fixed event name and exception class name.

## Release sequence

1. Apply `apps/storefront/drizzle/0121_collector_media_vault.sql`.
2. Deploy code and complete configuration with mode `off`.
3. Verify bucket policy, account and bucket public-access blocks, ownership,
   encryption/KMS policy, IAM Access Analyzer, lifecycle, logging retention,
   and an empty prefix.
4. In a disposable private staging bucket, test unauthenticated access,
   cross-owner ids, cross-origin mutation, oversized/chunked bodies, disguised
   files, metadata removal, concurrent quota attempts, write failure, access
   expiry, owner delete, and the 24-hour maintenance cleanup retry.
5. Set staging to `on`; verify S3 receives only WebP and every object reports
   the intended KMS key. Verify direct unauthenticated S3 GET returns denied.
6. Set production to `read-only` first and verify an operator-owned fixture.
7. Explicitly approve `on`. Keep rollback simple: return to `read-only` to stop
   intake or `off` to stop reads; deletion remains available while the
   dedicated configuration remains present.

`/account/media` is always reachable so the boundary is visible. With incomplete
configuration it renders only “Built, not enabled”. With complete configuration,
`off` exposes only the owner metadata list and deletion; `read-only` adds
download; upload is shown only in `on`. Download returns a 60-second bearer URL
whose host and opaque object path are visible to the owner's browser. The app
does not log or persist it; treat it as a temporary secret.

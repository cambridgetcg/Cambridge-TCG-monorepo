# Private verification storage — production gate

Status: **safe only as a paused deployment; activation is blocked**. An authorized
root operator created the dedicated bucket and scoped IAM user after the
read-only audit. The bucket controls below were then independently re-read and
match the reviewed design. Vercel API metadata now shows current update
timestamps for the two AWS credential variables, the dedicated bucket variable
and both paused-mode variables. Sensitive credential values are intentionally
not downloadable, so an environment pull cannot establish their runtime value.
The application cutover still needs a post-deploy function smoke test, and
identity collection must remain paused until the activation proof passes.

## Read-only evidence (2026-08-25)

- AWS account `034362054546`; local CLI caller
  `arn:aws:iam::034362054546:root`; configured and bucket region `us-east-1`.
  This proves only that the local operator CLI is using root. It does **not**
  prove that the deployed storefront uses root credentials.
- Storefront production declares `AWS_REGION` and `AUCTION_S3_BUCKET`; the
  bucket resolves to `cambridgetcg-auction-images`. A prior attempted
  Vercel-environment STS call fell back to the local CLI profile and therefore
  must not be treated as live runtime identity evidence. Vercel API metadata
  confirms that the two AWS credential variables and
  `VERIFICATION_S3_BUCKET` were re-entered with current update timestamps, but
  their sensitive values are intentionally not downloadable. A post-deploy
  function smoke test is still required to prove the runtime principal.
- The production identity modes remain paused; the enabling value
  `IDENTITY_VERIFICATION_MODE=reviewed-private-storage` is absent and has not
  been activated. In this state POST cannot mint an upload URL.
- `cambridgetcg-auction-images` has all four bucket Block Public Access flags
  disabled. No account-level Block Public Access configuration exists. AWS
  reports `PolicyStatus.IsPublic=true`; its policy allows anonymous
  `s3:GetObject` over `arn:aws:s3:::cambridgetcg-auction-images/*`.
- ACL: owner `FULL_CONTROL` only; Object Ownership:
  `BucketOwnerEnforced`. Default encryption: SSE-S3 (`AES256`). Versioning was
  never enabled. There is no access logging or Object Lock.
- Lifecycle only aborts incomplete multipart uploads after seven days. It does
  not expire a completed presigned PUT abandoned before DB persistence.
- CORS permits `PUT` and `GET` from `https://cambridgetcg.com` and
  `http://localhost:3000`, with all request headers allowed.
- A signed HEAD confirmed the synthetic current-prefix probe did not exist.
  Anonymous GET and HEAD both returned `403`. That nonexistent-object result is
  inconclusive by itself because S3 can mask absence from a caller without
  `s3:ListBucket`; the public bucket policy remains the proof that existing
  objects under that shared bucket are publicly readable.
- A privacy-safe aggregate query returned zero objects and zero active
  multipart uploads under the current `verifications/` prefix. No object key or
  content was printed. Legacy objects outside that prefix were not inspected
  and remain a gap.
- A later privacy-safe production aggregate confirmed zero
  `verification_documents` rows. This makes the new uniqueness migration
  low-risk for the present deployment, but every environment must still run
  the aggregate-only duplicate preflight before applying it.
- The dedicated bucket
  `cambridgetcg-verification-documents-prod-034362054546` now exists. A
  post-provision read confirmed: all four BPA flags true, policy status
  non-public, TLS-only deny with no allow, owner-only ACL,
  `BucketOwnerEnforced`, SSE-S3, versioning never enabled, exact pending-tag
  seven-day expiry, one-day multipart abort and production-only CORS.
- IAM user `cambridgetcg-storefront-prod` now exists without console use and
  has one active access key. Its S3 resources match this record and it has no
  `ListBucket`. Its live `PrivateVerificationPendingUpload` statement requires
  `upload-state=pending` and permits no other request tag key. Object read,
  deletion and tag lifecycle actions are separate. Its email statement allows
  only `ses:SendRawEmail`; policy simulation confirms `ses:SendEmail` and
  `s3:ListBucket` are denied.
- CLI environment pull/run output cannot prove the value of sensitive Vercel
  variables. The current timestamps prove that the intended production
  variables were updated, while runtime credential and bucket access remain
  unproven until a newly deployed function performs isolated STS and S3 smoke
  checks and returns the expected IAM-user ARN without exposing credentials.

## Approved design and live bucket configuration

| Property | Required value |
|---|---|
| Bucket | `cambridgetcg-verification-documents-prod-034362054546` |
| Region | `us-east-1` |
| Prefix | `verifications/{userId}/{uuid}.{ext}` |
| Object Ownership | `BucketOwnerEnforced` |
| Block Public Access | all four flags `true` |
| Bucket policy | no Allow statement; explicit deny for non-TLS requests |
| Default encryption | SSE-S3 (`AES256`) |
| Versioning | never enable; participant deletion must not leave a noncurrent sensitive version |
| CORS origin | `https://cambridgetcg.com` only |
| CORS methods | `PUT`, `GET`, `HEAD` |
| CORS headers | `content-type`, `x-amz-tagging` |
| Lifecycle | pending-tag expiry after 7 days; incomplete multipart abort after 1 day |

The current paused implementation signs each direct PUT with
`x-amz-tagging: upload-state=pending`. Phase 2 HEADs the object, validates owner
prefix, MIME type and a 10 MiB limit, stores an idempotent row, then changes the
tag to `upload-state=linked`. The daily repair sweep selects DB references only
and retags only explicitly pending referenced objects. It never lists the
bucket, fails closed on missing/unknown tags, and logs aggregate counts only.
Unreferenced pending objects retain the tag and lifecycle removes them.

That flow is **not activation-ready**. A browser PUT URL is reusable until its
ten-minute expiry and points at the eventual linked key. It can therefore be
replayed or raced after validation, or replayed after deletion, to replace or
recreate bytes. The 10 MiB limit is also checked only after S3 accepts the
object. Keep POST paused until a reviewed staging-to-immutable-final design
enforces size at S3 admission and has replay/race/delete regression coverage.

Collection remains fail-closed unless **both** of these are present:

```text
IDENTITY_VERIFICATION_MODE=reviewed-private-storage
VERIFICATION_S3_BUCKET=cambridgetcg-verification-documents-prod-034362054546
```

Do not set the mode until the migration, bucket, principal, synthetic access
probe, repair sweep and live application smoke tests have all passed **and**
every blocker in the activation section below is closed.

Before migration 0132, run this aggregate-only duplicate preflight. It returns
only a count and must never print `s3_key`, user identifiers or document data:

```sql
SELECT COUNT(*) AS duplicate_s3_key_groups
FROM (
  SELECT 1
  FROM verification_documents
  GROUP BY s3_key
  HAVING COUNT(*) > 1
) AS duplicate_groups;
```

Apply the unique index only when the count is zero. A non-zero result requires
privacy-reviewed adjudication; do not automatically delete or merge rows.

## Exact S3 configuration

The following files are shown inline so an operator can review them before
placing them in a protected temporary directory.

`public-access-block.json`:

```json
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": true,
  "RestrictPublicBuckets": true
}
```

`ownership.json`:

```json
{
  "Rules": [{ "ObjectOwnership": "BucketOwnerEnforced" }]
}
```

`encryption.json`:

```json
{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": { "SSEAlgorithm": "AES256" },
      "BucketKeyEnabled": false
    }
  ]
}
```

`bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546",
        "arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

`cors.json`:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://cambridgetcg.com"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["content-type", "x-amz-tagging"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

`lifecycle.json`:

```json
{
  "Rules": [
    {
      "ID": "ExpirePendingVerificationUploads",
      "Status": "Enabled",
      "Filter": {
        "And": {
          "Prefix": "verifications/",
          "Tags": [{ "Key": "upload-state", "Value": "pending" }]
        }
      },
      "Expiration": { "Days": 7 }
    },
    {
      "ID": "AbortIncompleteVerificationMultipartUploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "verifications/" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

The authorized operator applied these bucket mutations in this order. Keep the
commands as the reproducible configuration record; do not rerun them blindly:

```bash
aws s3api create-bucket \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --region us-east-1
aws s3api put-public-access-block \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --public-access-block-configuration file://public-access-block.json
aws s3api put-bucket-ownership-controls \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --ownership-controls file://ownership.json
aws s3api put-bucket-encryption \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --server-side-encryption-configuration file://encryption.json
aws s3api put-bucket-policy \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --policy file://bucket-policy.json
aws s3api put-bucket-cors \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --cors-configuration file://cors.json
aws s3api put-bucket-lifecycle-configuration \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --lifecycle-configuration file://lifecycle.json
aws s3api put-bucket-tagging \
  --bucket cambridgetcg-verification-documents-prod-034362054546 \
  --tagging 'TagSet=[{Key=DataClass,Value=identity-verification},{Key=Environment,Value=production},{Key=ManagedBy,Value=cambridge-tcg-release}]'
```

## Least-privilege storefront principal

The no-console IAM user `cambridgetcg-storefront-prod` is the immediate scoped
runtime principal. Migrate to Vercel OIDC and a temporary-credential role as a
separate hardening step after this release gate.

`storefront-runtime-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicMediaObjectWrites",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::cambridgetcg-auction-images/*"
    },
    {
      "Sid": "PrivateVerificationPendingUpload",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546/verifications/*",
      "Condition": {
        "StringEquals": {
          "s3:RequestObjectTag/upload-state": "pending"
        },
        "ForAllValues:StringEquals": {
          "s3:RequestObjectTagKeys": ["upload-state"]
        }
      }
    },
    {
      "Sid": "PrivateVerificationObjectLifecycle",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectTagging",
        "s3:PutObjectTagging"
      ],
      "Resource": "arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546/verifications/*"
    },
    {
      "Sid": "SendCambridgeTransactionalEmail",
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "arn:aws:ses:us-east-1:034362054546:identity/cambridgetcg.com",
      "Condition": {
        "StringLike": { "ses:FromAddress": "*@cambridgetcg.com" }
      }
    }
  ]
}
```

There is deliberately no `s3:ListBucket`, IAM, bucket-policy, KMS, RDS or admin
permission. `HeadObject` is authorized by `s3:GetObject`.

These are the reviewed principal-creation and simulation commands. Creation has
already occurred; retain them for audit and do not create a second user/key:

```bash
aws iam create-user --user-name cambridgetcg-storefront-prod \
  --tags Key=Project,Value=cambridge-tcg Key=Purpose,Value=storefront-production-runtime
aws iam put-user-policy \
  --user-name cambridgetcg-storefront-prod \
  --policy-name CambridgeTcgStorefrontRuntime \
  --policy-document file://storefront-runtime-policy.json
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546/verifications/privacy-gate/probe.txt \
  --context-entries \
    ContextKeyName=s3:RequestObjectTag/upload-state,ContextKeyValues=pending,ContextKeyType=string \
    ContextKeyName=s3:RequestObjectTagKeys,ContextKeyValues=upload-state,ContextKeyType=stringList
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod \
  --action-names s3:GetObject s3:DeleteObject s3:GetObjectTagging s3:PutObjectTagging \
  --resource-arns arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546/verifications/privacy-gate/probe.txt
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod \
  --action-names s3:ListBucket \
  --resource-arns arn:aws:s3:::cambridgetcg-verification-documents-prod-034362054546
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod \
  --action-names ses:SendRawEmail \
  --resource-arns arn:aws:ses:us-east-1:034362054546:identity/cambridgetcg.com \
  --context-entries \
    ContextKeyName=ses:FromAddress,ContextKeyValues=smoke@cambridgetcg.com,ContextKeyType=string
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod \
  --action-names ses:SendEmail \
  --resource-arns arn:aws:ses:us-east-1:034362054546:identity/cambridgetcg.com \
  --context-entries \
    ContextKeyName=ses:FromAddress,ContextKeyValues=smoke@cambridgetcg.com,ContextKeyType=string
```

The authorized operator already created one access key and updated the three
Vercel production variables. The commands below are retained as a redacted
procedure record only; do not create a second key or rerun them. An environment
change does not rewrite an already-running deployment.

```bash
set +x
task_credentials_json="$(aws iam create-access-key --user-name cambridgetcg-storefront-prod)"
task_access_key_id="$(jq -r '.AccessKey.AccessKeyId' <<<"$task_credentials_json")"
task_secret_access_key="$(jq -r '.AccessKey.SecretAccessKey' <<<"$task_credentials_json")"
printf '%s' "$task_access_key_id" | vercel env update AWS_ACCESS_KEY_ID production --cwd apps/storefront
printf '%s' "$task_secret_access_key" | vercel env update AWS_SECRET_ACCESS_KEY production --cwd apps/storefront
printf '%s' 'cambridgetcg-verification-documents-prod-034362054546' | \
  vercel env add VERIFICATION_S3_BUCKET production --cwd apps/storefront
unset task_secret_access_key task_access_key_id task_credentials_json
```

Deploy with identity collection still paused. Under the Vercel production
environment, STS must return this exact principal before activation:

```text
arn:aws:iam::034362054546:user/cambridgetcg-storefront-prod
```

Do **not** deactivate or delete any root key based on the earlier fallback STS
result. Root-key removal is a separate action requiring a positive access-key
match, complete consumer inventory, a tested non-root operator/admin path and
post-cutover last-used/CloudTrail evidence.

## Activation blockers and proof

Infrastructure verification alone does not authorize activation. Before
setting the reviewed mode, all of these code/data controls are required:

1. Replace the reusable browser-writable final key with a staging upload and a
   server-controlled immutable finalization step. Bind validation to the exact
   bytes finalized, make replay after finalization/deletion harmless, and add
   race/replay/delete tests.
2. Enforce the 10 MiB maximum at S3 admission (not only after upload), plus a
   reviewed per-user document/upload quota or rate limit. The current signed PUT
   permits S3 to accept oversized abandoned objects until lifecycle cleanup.
3. Record actor-attributed audit events before issuing an admin read URL, or
   enable and verify an equivalent S3 data-event audit. The current admin path
   issues a signed URL without an actor/document access record.
4. Run the aggregate duplicate preflight above before migration 0132 in every
   target environment and define human adjudication for any non-zero result.
5. Close account-erasure and SQL-cascade orphaning: a durable deletion/outbox
   path or verified inventory process must remove linked S3 bytes even after
   the database row disappears. Pending-only lifecycle does not cover linked
   objects.

The IAM pending-tag prerequisite is closed: the live
`CambridgeTcgStorefrontRuntime` policy splits `s3:PutObject` from lifecycle
actions, requires `s3:RequestObjectTag/upload-state=pending`, restricts
`s3:RequestObjectTagKeys` to `upload-state`, and was re-simulated. The five
code/data blockers above remain open.

After those blockers are closed, create one synthetic non-document object under
a synthetic verification namespace and verify:

1. scoped signed PUT succeeds with `upload-state=pending`;
2. anonymous GET of that **existing** object returns `403`;
3. signed HEAD/GET succeeds;
4. object tags report `pending`;
5. tag replacement to `linked` succeeds;
6. signed delete succeeds and signed HEAD then returns `404`;
7. policy status is non-public, all four BPA flags are true, encryption/CORS/
   lifecycle/ownership match this record, and versioning output remains empty;
8. focused tests, storefront typecheck/build and the post-deploy audit pass;
9. authenticated owner/admin read and participant deletion work; an unrelated
   account cannot mint or use a read URL;
10. the 04:10 UTC repair sweep reports aggregate counts only.

Only after recording those results may production receive:

```text
IDENTITY_VERIFICATION_MODE=reviewed-private-storage
```

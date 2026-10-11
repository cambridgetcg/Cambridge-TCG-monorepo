# @cambridge-tcg/aws

Shared AWS client factories for the Cambridge TCG monorepo.

## What it does

- **One S3 client** per process (replaces 4 separate instantiations across apps)
- **One SES client** per process (replaces 11 separate instantiations in storefront)
- **Vercel whitespace trimming** on all environment variables
- **Vercel OIDC → IAM role** credentials when `AWS_ROLE_ARN` is set, static keys otherwise ([runbook](../../docs/ops-aws-oidc.md))
- **Graceful degradation** — nullable factories return `null` when credentials are missing, so apps can build and start without AWS access
- **Consistent region resolution** from `AWS_REGION` env var

## Usage

```typescript
// S3 — get the singleton client
import { createS3Client, createS3ClientOrThrow } from "@cambridge-tcg/aws/s3";

const s3 = createS3Client(); // null if no creds
const s3 = createS3ClientOrThrow(); // throws if no creds

// Presigned upload URL
import { getPresignedUploadUrl } from "@cambridge-tcg/aws/s3";

const { uploadUrl, publicUrl, s3Key } = await getPresignedUploadUrl({
  bucket: "my-bucket",
  key: "uploads/file.jpg",
  contentType: "image/jpeg",
  expiresIn: 600, // seconds, default 600
});

// Simple operations
import { deleteObject, getObject, headObject } from "@cambridge-tcg/aws/s3";

await deleteObject("my-bucket", "key");
const response = await getObject("my-bucket", "key");
const head = await headObject("my-bucket", "key");

// SES — get the singleton client
import { createSESClient, createSESClientOrThrow } from "@cambridge-tcg/aws/ses";

const ses = createSESClient(); // null if no creds
const ses = createSESClientOrThrow(); // throws if no creds

// Credential resolution (used internally, available for custom clients)
import { resolveAwsConfig } from "@cambridge-tcg/aws";

const result = resolveAwsConfig("eu-west-2"); // custom default region
if (result.ok) {
  // result.config.region, result.config.credentialSource,
  // result.config.credentials (static keys, or a lazy role provider)
}
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ROLE_ARN` | No | IAM role to assume with the Vercel OIDC token. When set, it wins over static keys |
| `AWS_ACCESS_KEY_ID` | Without a role | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Without a role | IAM secret key |
| `AWS_REGION` | No | Region override (default: `us-east-1`); also the STS region for the role |
| `AWS_OIDC_ALLOW_STATIC_FALLBACK` | No | `1` lets `AWS_ROLE_ARN` fall back to static keys when no OIDC token source exists (local only; never set on Vercel) |

Credential precedence (`resolveAwsConfig`):

1. `AWS_ROLE_ARN` + an OIDC token source (Vercel production/preview deployment, or `VERCEL_OIDC_TOKEN` from `vercel env pull`) → `@vercel/oidc-aws-credentials-provider` assumes the role. Static keys are ignored.
2. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` → static keys (tcg-wholesale, local dev).
3. Otherwise an error result; nullable factories return `null`.

`AWS_ROLE_ARN` with no token source is an error, not a silent fallback to static keys, unless `AWS_OIDC_ALLOW_STATIC_FALLBACK=1`. Each new client logs, without values, which source it uses, e.g. `[packages/aws] S3 client ready (credentials=vercel-oidc-role, region=us-east-1)`.

Tests: `pnpm --filter @cambridge-tcg/aws test`.

## Sub-paths

| Path | Contents |
|------|----------|
| `@cambridge-tcg/aws` | All exports (credentials, S3, SES) |
| `@cambridge-tcg/aws/s3` | S3 client, presigned URLs, CRUD operations |
| `@cambridge-tcg/aws/ses` | SES client factory |

## Architecture

The package uses singleton clients — one S3 and one SES client per Node.js process. This is correct because each app (storefront, wholesale) runs in its own process on Vercel. The singleton avoids creating new TCP+TLS connections for every operation.

Wholesale uses `eu-west-2` as its default region (matching its RDS). Storefront uses `us-east-1`. Both read from the same `AWS_REGION` env var, but the default differs per app.

## Re-exports

The package re-exports `S3Client`, `PutObjectCommand`, `DeleteObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `getSignedUrl`, `SESClient`, `SendEmailCommand`, and `SendRawEmailCommand` so that consuming apps don't need direct `@aws-sdk/*` dependencies for basic operations.

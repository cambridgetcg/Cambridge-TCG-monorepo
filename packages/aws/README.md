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
| `AWS_OIDC_ALLOW_STATIC_FALLBACK` | No | Local only. `1` lets `AWS_ROLE_ARN` fall back to static keys when no OIDC token source exists. Refused (error) whenever the process shows a Vercel deployment marker (`VERCEL_ENV` other than `development`, a deployed `VERCEL_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, or the Vercel request context), and ignored with a warning when a token source exists. Never set it on Vercel |

Credential precedence (`resolveAwsConfig`):

1. `AWS_ROLE_ARN` + an OIDC token source (Vercel production/preview deployment with `VERCEL=1`, or a `VERCEL_OIDC_TOKEN` env var) → `@vercel/oidc-aws-credentials-provider` assumes the role. Static keys are ignored. The provider package is imported on the first credential request, so static-key processes never load it.
2. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` → static keys (tcg-wholesale, local dev).
3. Otherwise an error result; nullable factories return `null`.

`AWS_ROLE_ARN` with no token source is an error, not a silent fallback to static keys. Locally, and only locally, `AWS_OIDC_ALLOW_STATIC_FALLBACK=1` turns that case into static keys; on anything that looks deployed it stays an error. To run locally against static keys with an environment that carries `AWS_ROLE_ARN` (for example a pulled production env file), unset `AWS_ROLE_ARN` in that process.

A development token from `vercel env pull` is a token source, but the storefront role's trust policy accepts only the production `sub`, so it cannot assume that role (see the runbook).

Each new client logs, without values, which source it uses, e.g. `[packages/aws] S3 client ready (credentials=vercel-oidc-role, region=us-east-1)`; this line is also logged on the static-key path.

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

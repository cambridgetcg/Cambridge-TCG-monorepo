/**
 * @cambridge-tcg/aws — shared AWS client factories and helpers.
 *
 * Provides configured S3 and SES clients with:
 * - Vercel whitespace trim on all env vars
 * - Vercel OIDC → IAM role credentials when AWS_ROLE_ARN is set, static keys
 *   otherwise (see credentials.ts and docs/ops-aws-oidc.md)
 * - Graceful null return when credentials are missing (no crash in dev)
 * - Singleton pattern (one client per service per process)
 * - Consistent region resolution across apps
 *
 * Sub-paths:
 * - `@cambridge-tcg/aws/s3` — S3 client + presigned uploads + CRUD
 * - `@cambridge-tcg/aws/ses` — SES client factory
 */

export {
  resolveAwsConfig,
  resolveAwsConfigOrThrow,
  vercelOidcTokenSource,
  ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS,
  STATIC_FALLBACK_ENV,
  type AwsCredentials,
  type AwsCredentialProvider,
  type AwsCredentialSource,
  type AwsConfig,
  type AwsConfigResult,
} from "./credentials";

export {
  createS3Client,
  createS3ClientOrThrow,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteObject,
  getObject,
  headObject,
  getObjectTagging,
  putObjectTagging,
  type CreateS3ClientOpts,
  type PresignedUploadResult,
  type PresignedUploadOpts,
  type PresignedDownloadOpts,
} from "./s3";

export {
  createSESClient,
  createSESClientOrThrow,
  type CreateSESClientOpts,
} from "./ses";

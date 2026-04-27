/**
 * @cambridge-tcg/aws — shared AWS client factories and helpers.
 *
 * Provides configured S3 and SES clients with:
 * - Vercel whitespace trim on all env vars
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
  type AwsCredentials,
  type AwsConfig,
  type AwsConfigResult,
} from "./credentials";

export {
  createS3Client,
  createS3ClientOrThrow,
  getPresignedUploadUrl,
  deleteObject,
  getObject,
  headObject,
  type CreateS3ClientOpts,
  type PresignedUploadResult,
  type PresignedUploadOpts,
} from "./s3";

export {
  createSESClient,
  createSESClientOrThrow,
  type CreateSESClientOpts,
} from "./ses";

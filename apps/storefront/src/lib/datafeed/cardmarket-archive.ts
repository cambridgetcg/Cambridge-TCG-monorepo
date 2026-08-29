import { createHash } from "node:crypto";

import {
  HeadObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { createS3ClientOrThrow } from "@cambridge-tcg/aws/s3";
import {
  assertCardmarketPublicFileUrl,
  type CardmarketPublicFileArtifact,
} from "@cambridge-tcg/data-ingest/cardmarket";

export const CARDMARKET_ARCHIVE_MANIFEST_SCHEMA =
  "cambridgetcg.price-evidence-manifest/1" as const;
export const CARDMARKET_ARCHIVE_PUBLICATION_STATE = "withheld" as const;
export const CARDMARKET_ARCHIVE_RIGHTS_TIER = "proprietary" as const;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const GAME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CardmarketArchiveArtifactKind =
  | "price-guide"
  | "product-list-singles"
  | "product-list-nonsingles";

export interface ArchiveCardmarketPublicFileInput {
  artifact: CardmarketPublicFileArtifact;
  bucket: string;
  game_slug: string;
  cardmarket_game_id: number;
}

export interface CardmarketArchiveObjectIdentity {
  bucket: string;
  key: string;
  version_id: string | null;
  created: boolean;
}

export interface ArchiveCardmarketPublicFileResult {
  raw: CardmarketArchiveObjectIdentity;
  manifest: CardmarketArchiveObjectIdentity & { sha256: string };
  artifact_kind: CardmarketArchiveArtifactKind;
  publication_state: typeof CARDMARKET_ARCHIVE_PUBLICATION_STATE;
}

export interface CardmarketArtifactEnvelopeFacts {
  version: 1;
  source_stated_at: string;
  row_count: number;
}

type S3Command = HeadObjectCommand | PutObjectCommand;

export interface CardmarketArchiveS3Port {
  send(command: S3Command): Promise<{
    VersionId?: string;
    Metadata?: Record<string, string>;
  }>;
}

export interface CardmarketArchiveDependencies {
  s3?: CardmarketArchiveS3Port;
}

interface StoredOnceResult {
  version_id: string | null;
  created: boolean;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Base64(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function isPreconditionFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "PreconditionFailed" ||
    candidate.$metadata?.httpStatusCode === 412
  );
}

function requireCanonicalTimestamp(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`cardmarket_archive_invalid_${field}`);
  }
  return parsed;
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function datePath(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

export function classifyCardmarketArchiveArtifact(
  artifact: CardmarketPublicFileArtifact,
): CardmarketArchiveArtifactKind {
  const pathname = assertCardmarketPublicFileUrl(
    artifact.final_url,
    artifact.kind,
  ).pathname;
  if (/\/priceGuide\/price_guide_[1-9]\d*\.json$/.test(pathname)) {
    return "price-guide";
  }
  if (/\/productList\/products_singles_[1-9]\d*\.json$/.test(pathname)) {
    return "product-list-singles";
  }
  if (/\/productList\/products_nonsingles_[1-9]\d*\.json$/.test(pathname)) {
    return "product-list-nonsingles";
  }
  throw new Error("cardmarket_archive_unrecognized_artifact_path");
}

function gameIdFromPath(pathname: string): number {
  const match = pathname.match(/_(\d+)\.json$/);
  const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("cardmarket_archive_invalid_artifact_game_id");
  }
  return parsed;
}

export function inspectCardmarketArtifactEnvelope(
  artifact: CardmarketPublicFileArtifact,
): CardmarketArtifactEnvelopeFacts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes));
  } catch {
    throw new Error("cardmarket_archive_invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("cardmarket_archive_invalid_envelope");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== 1 || typeof envelope.createdAt !== "string") {
    throw new Error("cardmarket_archive_invalid_envelope");
  }
  requireCanonicalTimestamp(envelope.createdAt, "source_stated_at");
  const rows =
    artifact.kind === "price-guide" ? envelope.priceGuides : envelope.products;
  if (!Array.isArray(rows)) {
    throw new Error("cardmarket_archive_invalid_envelope");
  }
  return {
    version: 1,
    source_stated_at: envelope.createdAt,
    row_count: rows.length,
  };
}

export function buildCardmarketArchiveKeys(input: {
  artifact: CardmarketPublicFileArtifact;
  game_slug: string;
}): {
  artifact_kind: CardmarketArchiveArtifactKind;
  raw_key: string;
  manifest_key: string;
} {
  if (!GAME_SLUG.test(input.game_slug)) {
    throw new Error("cardmarket_archive_invalid_game_slug");
  }
  if (!SHA256_HEX.test(input.artifact.sha256)) {
    throw new Error("cardmarket_archive_invalid_sha256");
  }
  const retrieved = requireCanonicalTimestamp(
    input.artifact.retrieved_at,
    "retrieved_at",
  );
  const artifactKind = classifyCardmarketArchiveArtifact(input.artifact);
  const day = datePath(retrieved);
  const observation = compactTimestamp(retrieved);
  return {
    artifact_kind: artifactKind,
    raw_key: `raw/cardmarket/${input.game_slug}/${artifactKind}/${day}/${input.artifact.sha256}.json`,
    manifest_key: `manifests/cardmarket/${input.game_slug}/${artifactKind}/${day}/${observation}-${input.artifact.sha256}.json`,
  };
}

async function headExisting(
  s3: CardmarketArchiveS3Port,
  bucket: string,
  key: string,
  expectedSha256: string,
): Promise<StoredOnceResult> {
  const output = (await s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  ));
  if (output.Metadata?.sha256 !== expectedSha256) {
    throw new Error("cardmarket_archive_existing_object_digest_conflict");
  }
  return { version_id: output.VersionId ?? null, created: false };
}

async function putOnce(input: {
  s3: CardmarketArchiveS3Port;
  bucket: string;
  key: string;
  bytes: Uint8Array;
  sha256: string;
  metadata: Record<string, string>;
  tagging: string;
}): Promise<StoredOnceResult> {
  const commandInput: PutObjectCommandInput = {
    Bucket: input.bucket,
    Key: input.key,
    Body: input.bytes,
    ContentType: "application/json",
    CacheControl: "no-store",
    ServerSideEncryption: "AES256",
    ChecksumAlgorithm: "SHA256",
    ChecksumSHA256: sha256Base64(input.bytes),
    IfNoneMatch: "*",
    Metadata: { ...input.metadata, sha256: input.sha256 },
    Tagging: input.tagging,
  };
  try {
    const output = (await input.s3.send(
      new PutObjectCommand(commandInput),
    ));
    return { version_id: output.VersionId ?? null, created: true };
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    return headExisting(input.s3, input.bucket, input.key, input.sha256);
  }
}

export async function archiveCardmarketPublicFile(
  input: ArchiveCardmarketPublicFileInput,
  dependencies: CardmarketArchiveDependencies = {},
): Promise<ArchiveCardmarketPublicFileResult> {
  if (!input.bucket.trim()) throw new Error("cardmarket_archive_bucket_required");
  if (!Number.isSafeInteger(input.cardmarket_game_id) || input.cardmarket_game_id <= 0) {
    throw new Error("cardmarket_archive_invalid_game_id");
  }
  if (input.artifact.byte_length !== input.artifact.bytes.byteLength) {
    throw new Error("cardmarket_archive_byte_length_mismatch");
  }
  if (sha256Hex(input.artifact.bytes) !== input.artifact.sha256) {
    throw new Error("cardmarket_archive_digest_mismatch");
  }

  const sourceUrl = assertCardmarketPublicFileUrl(
    input.artifact.source_url,
    input.artifact.kind,
  );
  const finalUrl = assertCardmarketPublicFileUrl(
    input.artifact.final_url,
    input.artifact.kind,
  );
  if (
    sourceUrl.pathname !== finalUrl.pathname ||
    gameIdFromPath(finalUrl.pathname) !== input.cardmarket_game_id
  ) {
    throw new Error("cardmarket_archive_artifact_identity_mismatch");
  }
  const envelope = inspectCardmarketArtifactEnvelope(input.artifact);

  const s3 = dependencies.s3 ?? (createS3ClientOrThrow({ defaultRegion: "us-east-1" }) as S3Client);
  const keys = buildCardmarketArchiveKeys({
    artifact: input.artifact,
    game_slug: input.game_slug,
  });
  const tag = "publication-state=withheld&rights-tier=proprietary";
  const raw = await putOnce({
    s3,
    bucket: input.bucket,
    key: keys.raw_key,
    bytes: input.artifact.bytes,
    sha256: input.artifact.sha256,
    tagging: tag,
    metadata: {
      source: "cardmarket",
      game: input.game_slug,
      "artifact-kind": keys.artifact_kind,
      "retrieved-at": input.artifact.retrieved_at,
      "publication-state": CARDMARKET_ARCHIVE_PUBLICATION_STATE,
    },
  });

  const manifestValue = {
    schema: CARDMARKET_ARCHIVE_MANIFEST_SCHEMA,
    source: "cardmarket",
    game: {
      slug: input.game_slug,
      cardmarket_id: input.cardmarket_game_id,
    },
    artifact_kind: keys.artifact_kind,
    source_url: input.artifact.source_url,
    final_url: input.artifact.final_url,
    retrieved_at: input.artifact.retrieved_at,
    source_stated_at: envelope.source_stated_at,
    response: {
      content_type: input.artifact.headers.content_type,
      content_length: input.artifact.headers.content_length,
      etag: input.artifact.headers.etag,
      last_modified: input.artifact.headers.last_modified,
      cache_control: input.artifact.headers.cache_control,
    },
    artifact: {
      sha256: input.artifact.sha256,
      byte_length: input.artifact.byte_length,
      format: "json",
      parser_version: null,
      rows_declared: envelope.row_count,
    },
    acquisition: {
      method: "official-public-file",
      proxy_label: input.artifact.provenance.via_proxy ?? null,
    },
    storage: {
      bucket: input.bucket,
      key: keys.raw_key,
      version_id: raw.version_id,
      encryption: "AES256",
    },
    rights: {
      tier: CARDMARKET_ARCHIVE_RIGHTS_TIER,
      acquisition_basis: "official_public_file_and_editorial_application_permission",
      review_status: "pending_written_confirmation_for_subscriber_display",
      allow_private_storage: true,
      allow_subscriber_display: false,
      allow_raw_export: false,
      publication_state: CARDMARKET_ARCHIVE_PUBLICATION_STATE,
    },
  } as const;
  const manifestBytes = jsonBytes(manifestValue);
  const manifestSha256 = sha256Hex(manifestBytes);
  const manifest = await putOnce({
    s3,
    bucket: input.bucket,
    key: keys.manifest_key,
    bytes: manifestBytes,
    sha256: manifestSha256,
    tagging: tag,
    metadata: {
      source: "cardmarket",
      game: input.game_slug,
      "artifact-kind": keys.artifact_kind,
      "manifest-schema": CARDMARKET_ARCHIVE_MANIFEST_SCHEMA,
      "publication-state": CARDMARKET_ARCHIVE_PUBLICATION_STATE,
    },
  });

  return {
    raw: { bucket: input.bucket, key: keys.raw_key, ...raw },
    manifest: {
      bucket: input.bucket,
      key: keys.manifest_key,
      sha256: manifestSha256,
      ...manifest,
    },
    artifact_kind: keys.artifact_kind,
    publication_state: CARDMARKET_ARCHIVE_PUBLICATION_STATE,
  };
}

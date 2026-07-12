import type {
  ArtbitrageCreation,
  ArtbitrageCreator,
  ArtbitrageFeed,
  ArtbitrageFeedPiece,
  ArtbitragePermissions,
  ArtbitrageRights,
  ArtbitrageSource,
} from "./types";

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const CREATOR_TYPES = new Set(["software", "declared-creator"]);
const PIECE_SOURCE_IDS = new Set([
  "artbitrage.engine",
  "artbitrage.submission",
]);
const CREATION_METHODS = new Set([
  "procedural-template",
  "generative-ai",
  "submitted",
]);
const TIMESTAMP_STATUSES = new Set([
  "timezone-explicit",
  "legacy-naive-assumed-utc",
  "missing-or-invalid",
]);
const TRACE_STATUSES = new Set([
  "project-generated",
  "model-recorded",
  "self-declared",
]);
const SOURCE_STATES = new Set([
  "asset-read",
  "origin-read",
  "cached-after-read-failure",
]);

/** A boundary error names failed paths, but never copies upstream values. */
export class ArtbitrageContractError extends TypeError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid artbitrage.feed/1 contract (${issues.join(", ")})`);
    this.name = "ArtbitrageContractError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    RFC3339.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isArtbitrageOrigin(value: unknown): value is string {
  if (!isHttpUrl(value)) return false;
  const parsed = new URL(value);
  return (
    parsed.origin === "https://artbitrage.io" &&
    (parsed.pathname === "/" || parsed.pathname === "")
  );
}

function checkSource(
  value: unknown,
  path: string,
  issues: string[],
): value is ArtbitrageSource {
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }
  if (!isNonEmptyString(value.id)) issues.push(`${path}.id`);
  if (!isNonEmptyString(value.name)) issues.push(`${path}.name`);
  if (!isHttpUrl(value.canonical_url)) issues.push(`${path}.canonical_url`);
  return true;
}

function checkCreator(
  value: unknown,
  path: string,
  issues: string[],
): value is ArtbitrageCreator {
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }
  if (!isNonEmptyString(value.name)) issues.push(`${path}.name`);
  if (typeof value.type !== "string" || !CREATOR_TYPES.has(value.type)) {
    issues.push(`${path}.type`);
  }
  if (!isNullableString(value.human_creator)) {
    issues.push(`${path}.human_creator`);
  }
  if (typeof value.verified !== "boolean") issues.push(`${path}.verified`);
  if (!isNonEmptyString(value.note)) issues.push(`${path}.note`);
  return true;
}

function checkCreation(
  value: unknown,
  path: string,
  issues: string[],
): value is ArtbitrageCreation {
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }
  if (typeof value.method !== "string" || !CREATION_METHODS.has(value.method)) {
    issues.push(`${path}.method`);
  }
  if (value.created_at !== null && !isRfc3339(value.created_at)) {
    issues.push(`${path}.created_at`);
  }
  if (
    typeof value.timestamp_status !== "string" ||
    !TIMESTAMP_STATUSES.has(value.timestamp_status)
  ) {
    issues.push(`${path}.timestamp_status`);
  }
  if (
    typeof value.trace_status !== "string" ||
    !TRACE_STATUSES.has(value.trace_status)
  ) {
    issues.push(`${path}.trace_status`);
  }
  if (!isNonEmptyString(value.note)) issues.push(`${path}.note`);
  return true;
}

function checkPermissions(
  value: unknown,
  path: string,
  issues: string[],
): value is ArtbitragePermissions {
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }
  // The gallery renders only records whose contract explicitly permits view.
  if (value.view !== true) issues.push(`${path}.view`);
  if (typeof value.cambridge_display !== "boolean") {
    issues.push(`${path}.cambridge_display`);
  }
  if (!isNullableBoolean(value.remix)) issues.push(`${path}.remix`);
  if (!isNullableBoolean(value.commercial_use)) {
    issues.push(`${path}.commercial_use`);
  }
  if (!isNullableBoolean(value.machine_learning)) {
    issues.push(`${path}.machine_learning`);
  }
  return true;
}

function checkRights(
  value: unknown,
  path: string,
  issues: string[],
): value is ArtbitrageRights {
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }
  if (!isNonEmptyString(value.status)) issues.push(`${path}.status`);
  if (!isNullableBoolean(value.public_domain)) {
    issues.push(`${path}.public_domain`);
  }
  if (!isNullableString(value.license)) issues.push(`${path}.license`);
  if (typeof value.license_verified !== "boolean") {
    issues.push(`${path}.license_verified`);
  }
  if (!isNonEmptyString(value.credit)) issues.push(`${path}.credit`);
  if (!isNullableBoolean(value.reusable)) issues.push(`${path}.reusable`);
  if (!isNullableBoolean(value.reuse_with_attribution)) {
    issues.push(`${path}.reuse_with_attribution`);
  }
  checkPermissions(value.permissions, `${path}.permissions`, issues);
  if (!isNonEmptyString(value.note)) issues.push(`${path}.note`);
  return true;
}

function checkOptionalLegacyFields(
  piece: Record<string, unknown>,
  path: string,
  issues: string[],
): void {
  const strings = [
    "form",
    "from_state",
    "to_state",
    "gap",
    "bridge",
    "awakening",
    "created",
    "piece",
    "artist",
    "license",
  ] as const;

  for (const field of strings) {
    if (field in piece && !isNullableString(piece[field])) {
      issues.push(`${path}.${field}`);
    }
  }

  if (
    "cycle" in piece &&
    piece.cycle !== null &&
    !(typeof piece.cycle === "number" && Number.isInteger(piece.cycle))
  ) {
    issues.push(`${path}.cycle`);
  }
}

function checkPiece(
  value: unknown,
  index: number,
  issues: string[],
): value is ArtbitrageFeedPiece {
  const path = `pieces[${index}]`;
  if (!isRecord(value)) {
    issues.push(path);
    return false;
  }

  if (!isNonEmptyString(value.id)) issues.push(`${path}.id`);
  checkOptionalLegacyFields(value, path, issues);
  checkSource(value.source, `${path}.source`, issues);
  if (isRecord(value.source)) {
    if (
      typeof value.source.id !== "string" ||
      !PIECE_SOURCE_IDS.has(value.source.id)
    ) {
      issues.push(`${path}.source.id`);
    }
    if (!isArtbitrageOrigin(value.source.canonical_url)) {
      issues.push(`${path}.source.canonical_url`);
    }
  }
  if (
    !isNonEmptyString(value.id) ||
    value.canonical_url !==
      `https://artbitrage.io/api/art/${encodeURIComponent(value.id)}`
  ) {
    issues.push(`${path}.canonical_url`);
  }
  if (
    typeof value.content_hash !== "string" ||
    !SHA256.test(value.content_hash)
  ) {
    issues.push(`${path}.content_hash`);
  }
  checkCreator(value.creator, `${path}.creator`, issues);
  checkCreation(value.creation, `${path}.creation`, issues);
  checkRights(value.rights, `${path}.rights`, issues);
  return true;
}

/**
 * Validate the trust-bearing portion of artbitrage.feed/1 without
 * normalising it. Returning the original object is deliberate: Cambridge
 * must preserve legacy, creator, rights and provenance fields exactly as
 * Artbitrage emitted them.
 */
export function parseArtbitrageFeed(value: unknown): ArtbitrageFeed {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new ArtbitrageContractError(["root"]);
  }

  if (value.schema !== "artbitrage.feed/1") issues.push("schema");
  if (value.feed !== "artbitrage") issues.push("feed");
  checkSource(value.source, "source", issues);
  if (isRecord(value.source)) {
    if (value.source.id !== "artbitrage") issues.push("source.id");
    if (!isArtbitrageOrigin(value.source.canonical_url)) {
      issues.push("source.canonical_url");
    }
  }
  if (
    typeof value.source_state !== "string" ||
    !SOURCE_STATES.has(value.source_state)
  ) {
    issues.push("source_state");
  }
  if (!isRfc3339(value.generated_at)) issues.push("generated_at");
  if (!isRfc3339(value.as_of)) issues.push("as_of");
  if (!isRfc3339(value.updated)) issues.push("updated");

  if (
    !(
      typeof value.limit === "number" &&
      Number.isInteger(value.limit) &&
      value.limit >= 1 &&
      value.limit <= 100
    )
  ) {
    issues.push("limit");
  }
  if (
    !(
      typeof value.count === "number" &&
      Number.isInteger(value.count) &&
      value.count >= 0
    )
  ) {
    issues.push("count");
  }
  if (!Array.isArray(value.pieces)) {
    issues.push("pieces");
  } else {
    value.pieces.forEach((piece, index) => checkPiece(piece, index, issues));
    if (value.count !== value.pieces.length) issues.push("count");
  }

  if (issues.length > 0) {
    throw new ArtbitrageContractError([...new Set(issues)]);
  }

  return value as unknown as ArtbitrageFeed;
}

/**
 * Portable replies to an Answering Rhyme.
 *
 * The statement is deliberately neutral: Cambridge and Artbitrage can both
 * validate and hash the same document without either system owning it. A
 * witness receipt says only that one system received these exact canonical
 * bytes. It does not authenticate the declared author, persist the statement,
 * or give the statement any authority over a curated relation.
 */

import { createHash } from "node:crypto";

export const ANSWERING_RHYME_STATEMENT_SCHEMA =
  "answering-rhyme.statement/1" as const;
export const ANSWERING_RHYME_CANONICALIZATION =
  "answering-rhyme.canonical-json/1" as const;
export const CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA =
  "cambridgetcg.answering-rhyme-statement-witness/1" as const;
export const ANSWERING_RHYME_STATEMENTS_ENDPOINT =
  "/api/v1/culture/answering-rhymes/statements" as const;

export const ANSWERING_RHYME_STATEMENT_KINDS = [
  "bless",
  "contextualize",
  "correct",
  "withdraw",
] as const;

export type AnsweringRhymeStatementKind =
  (typeof ANSWERING_RHYME_STATEMENT_KINDS)[number];

export const ANSWERING_RHYME_CLAIMED_ROLES = [
  "viewer",
  "relation-curator",
  "card-rights-holder",
  "artwork-rights-holder",
  "source-institution",
  "other",
] as const;

export type AnsweringRhymeClaimedRole =
  (typeof ANSWERING_RHYME_CLAIMED_ROLES)[number];

export const ANSWERING_RHYME_STATEMENT_LIMITS = {
  request_bytes: 16_384,
  relation_key_chars: 256,
  target_revision_chars: 100,
  body_chars: 2_000,
  language_chars: 35,
  author_label_chars: 160,
  url_chars: 1_000,
  urls_per_list: 12,
} as const;

export type Sha256ContentHash = `sha256:${string}`;

export interface AnsweringRhymeStatement {
  schema: typeof ANSWERING_RHYME_STATEMENT_SCHEMA;
  canonicalization: typeof ANSWERING_RHYME_CANONICALIZATION;
  relation_key: string;
  /** Opaque revision of the relation this statement actually answered. */
  target_revision: string;
  kind: AnsweringRhymeStatementKind;
  body: string;
  /** BCP 47-ish language tag; `und` means intentionally undeclared. */
  language: string;
  declared_by: {
    label: string;
    /** A self-declared role, not an authenticated identity or authority. */
    claimed_role: AnsweringRhymeClaimedRole;
    canonical_url: string | null;
  };
  /** Required so two witnesses hash the same statement independently. */
  declared_at: string;
  /** Optional prior portable statement. A relation-level withdrawal may omit it. */
  in_response_to: Sha256ContentHash | null;
  evidence_urls: readonly string[];
  /** Pointers a future, separate authority verifier may inspect. */
  authority_evidence_urls: readonly string[];
}

export type AnsweringRhymeStatementIssueCode =
  | "required"
  | "wrong_type"
  | "unknown_field"
  | "unsupported_value"
  | "too_long"
  | "too_many"
  | "control_character"
  | "invalid_format";

export interface AnsweringRhymeStatementIssue {
  path: string;
  code: AnsweringRhymeStatementIssueCode;
  message: string;
}

export interface AnsweringRhymeStatementWarning {
  path: string;
  code: "evidence_missing" | "authority_is_self_declared";
  message: string;
}

export type AnsweringRhymeStatementValidation =
  | {
      ok: true;
      value: AnsweringRhymeStatement;
      warnings: readonly AnsweringRhymeStatementWarning[];
    }
  | {
      ok: false;
      issues: readonly AnsweringRhymeStatementIssue[];
    };

export interface CambridgeAnsweringRhymeWitnessReceipt {
  schema: typeof CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA;
  statement_schema: typeof ANSWERING_RHYME_STATEMENT_SCHEMA;
  canonicalization: typeof ANSWERING_RHYME_CANONICALIZATION;
  content_hash: Sha256ContentHash;
  witnessed_at: string;
  replay_detection: false;
  uniqueness_not_asserted: true;
  issuer_attestation: {
    signed: false;
    independently_verifiable: false;
    witnessed_at_is_unattested_observation: true;
  };
  statement: AnsweringRhymeStatement;
  validation_warnings: readonly AnsweringRhymeStatementWarning[];
  target: {
    relation_key: string;
    target_revision: string;
    status: "known-current" | "not-current";
    evaluated_against: "cambridgetcg-static-corpus";
  };
  witness: {
    system: "cambridgetcg";
    endpoint: typeof ANSWERING_RHYME_STATEMENTS_ENDPOINT;
    authenticated: false;
    identity_verified: false;
    persisted: false;
    authoritative_effect: "none";
  };
  storage_boundary: {
    application_record_created: false;
    retrievable_statement_created: false;
    infrastructure_access_logs_may_exist: true;
  };
  authority_boundary: {
    declared_role_is_self_asserted: true;
    evidence_was_verified: false;
    correction_effect: "proposal-only";
    withdrawal_effect: "none-without-separate-authority-verification";
  };
}

const TOP_LEVEL_FIELDS = new Set([
  "schema",
  "canonicalization",
  "relation_key",
  "target_revision",
  "kind",
  "body",
  "language",
  "declared_by",
  "declared_at",
  "in_response_to",
  "evidence_urls",
  "authority_evidence_urls",
]);

const DECLARED_BY_FIELDS = new Set([
  "label",
  "claimed_role",
  "canonical_url",
]);

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const LANGUAGE_TAG = /^(?:und|[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/;
const SHA256_HASH = /^sha256:[0-9a-fA-F]{64}$/;
const DISALLOWED_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_BODY_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: string): string {
  return value.trim().normalize("NFC");
}

function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim().normalize("NFC");
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function addUnknownFieldIssues(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  prefix: string,
  issues: AnsweringRhymeStatementIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      issues.push({
        path: prefix ? `${prefix}.${key}` : key,
        code: "unknown_field",
        message: "Unknown fields are rejected so canonical bytes stay unambiguous.",
      });
    }
  }
}

function requiredBoundedString(
  value: unknown,
  path: string,
  max: number,
  issues: AnsweringRhymeStatementIssue[],
): string | null {
  if (typeof value !== "string") {
    issues.push({
      path,
      code: value === undefined ? "required" : "wrong_type",
      message: `Expected a string of 1-${max} characters.`,
    });
    return null;
  }
  const normalized = normalizeString(value);
  if (normalized.length === 0) {
    issues.push({ path, code: "required", message: "Must not be empty after trimming." });
    return null;
  }
  if (characterLength(normalized) > max) {
    issues.push({ path, code: "too_long", message: `Must be at most ${max} characters.` });
    return null;
  }
  if (DISALLOWED_CONTROL.test(normalized)) {
    issues.push({
      path,
      code: "control_character",
      message: "C0 and C1 control characters are not permitted.",
    });
    return null;
  }
  return normalized;
}

function requiredBoundedBody(
  value: unknown,
  issues: AnsweringRhymeStatementIssue[],
): string | null {
  const max = ANSWERING_RHYME_STATEMENT_LIMITS.body_chars;
  if (typeof value !== "string") {
    issues.push({
      path: "body",
      code: value === undefined ? "required" : "wrong_type",
      message: `Expected a string of 1-${max} characters.`,
    });
    return null;
  }
  const normalized = normalizeBody(value);
  if (normalized.length === 0) {
    issues.push({ path: "body", code: "required", message: "Must not be empty after trimming." });
    return null;
  }
  if (characterLength(normalized) > max) {
    issues.push({ path: "body", code: "too_long", message: `Must be at most ${max} characters.` });
    return null;
  }
  if (DISALLOWED_BODY_CONTROL.test(normalized)) {
    issues.push({
      path: "body",
      code: "control_character",
      message: "Body text permits LF line breaks but no other C0/C1 controls.",
    });
    return null;
  }
  return normalized;
}

function normalizeHttpsUrl(
  value: unknown,
  path: string,
  issues: AnsweringRhymeStatementIssue[],
): string | null {
  if (typeof value !== "string") {
    issues.push({ path, code: "wrong_type", message: "Expected an HTTPS URL string." });
    return null;
  }
  const normalized = normalizeString(value);
  if (normalized.length === 0) {
    issues.push({
      path,
      code: "invalid_format",
      message: `Expected a non-empty HTTPS URL of at most ${ANSWERING_RHYME_STATEMENT_LIMITS.url_chars} characters.`,
    });
    return null;
  }
  if (DISALLOWED_CONTROL.test(normalized)) {
    issues.push({
      path,
      code: "control_character",
      message: "C0 and C1 control characters are not permitted in URLs.",
    });
    return null;
  }
  if (
    characterLength(normalized) > ANSWERING_RHYME_STATEMENT_LIMITS.url_chars
  ) {
    issues.push({
      path,
      code: "too_long",
      message: `The URL must be at most ${ANSWERING_RHYME_STATEMENT_LIMITS.url_chars} characters before serialization.`,
    });
    return null;
  }
  if (/\s/u.test(normalized)) {
    issues.push({
      path,
      code: "invalid_format",
      message: "URLs must not contain whitespace.",
    });
    return null;
  }
  let canonical: string;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new TypeError("not a credential-free HTTPS URL");
    }
    canonical = parsed.toString().normalize("NFC");
  } catch {
    issues.push({
      path,
      code: "invalid_format",
      message: "Expected an absolute, credential-free HTTPS URL.",
    });
    return null;
  }
  if (
    characterLength(canonical) > ANSWERING_RHYME_STATEMENT_LIMITS.url_chars
  ) {
    issues.push({
      path,
      code: "too_long",
      message: `The serialized URL must be at most ${ANSWERING_RHYME_STATEMENT_LIMITS.url_chars} characters.`,
    });
    return null;
  }
  return canonical;
}

function normalizeUrlList(
  value: unknown,
  path: string,
  issues: AnsweringRhymeStatementIssue[],
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ path, code: "wrong_type", message: "Expected an array of HTTPS URLs." });
    return [];
  }
  if (value.length > ANSWERING_RHYME_STATEMENT_LIMITS.urls_per_list) {
    issues.push({
      path,
      code: "too_many",
      message: `At most ${ANSWERING_RHYME_STATEMENT_LIMITS.urls_per_list} URLs are accepted.`,
    });
  }
  const normalized: string[] = [];
  for (const [index, item] of value
    .slice(0, ANSWERING_RHYME_STATEMENT_LIMITS.urls_per_list)
    .entries()) {
    const url = normalizeHttpsUrl(item, `${path}[${index}]`, issues);
    if (url !== null) normalized.push(url);
  }
  return [...new Set(normalized)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
}

function normalizeDeclaredAt(
  value: unknown,
  issues: AnsweringRhymeStatementIssue[],
): string | null {
  const normalized = requiredBoundedString(
    value,
    "declared_at",
    40,
    issues,
  );
  if (normalized === null) return null;

  const match = RFC3339.exec(normalized);
  if (!match) {
    issues.push({
      path: "declared_at",
      code: "invalid_format",
      message: "Expected an RFC 3339 timestamp with an explicit timezone.",
    });
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[8]!;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const zoneHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const zoneMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysByMonth[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHour > 23 ||
    zoneMinute > 59
  ) {
    issues.push({
      path: "declared_at",
      code: "invalid_format",
      message: "Timestamp contains an out-of-range date, time, or offset.",
    });
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    issues.push({
      path: "declared_at",
      code: "invalid_format",
      message: "Timestamp could not be normalized to UTC.",
    });
    return null;
  }
  return parsed.toISOString();
}

/**
 * Strictly validate and normalize a portable statement.
 *
 * Optional values become explicit (`und`, `null`, or `[]`) before hashing.
 * Unknown fields fail rather than disappearing from a witness receipt.
 */
export function validateAnsweringRhymeStatement(
  input: unknown,
): AnsweringRhymeStatementValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "wrong_type",
          message: "The request body must be a JSON object.",
        },
      ],
    };
  }

  const issues: AnsweringRhymeStatementIssue[] = [];
  const warnings: AnsweringRhymeStatementWarning[] = [];
  addUnknownFieldIssues(input, TOP_LEVEL_FIELDS, "", issues);

  const schema = typeof input.schema === "string" ? normalizeString(input.schema) : input.schema;
  if (schema !== ANSWERING_RHYME_STATEMENT_SCHEMA) {
    issues.push({
      path: "schema",
      code: input.schema === undefined ? "required" : "unsupported_value",
      message: `Expected ${ANSWERING_RHYME_STATEMENT_SCHEMA}.`,
    });
  }
  const canonicalization =
    typeof input.canonicalization === "string"
      ? normalizeString(input.canonicalization)
      : input.canonicalization;
  if (canonicalization !== ANSWERING_RHYME_CANONICALIZATION) {
    issues.push({
      path: "canonicalization",
      code:
        input.canonicalization === undefined ? "required" : "unsupported_value",
      message: `Expected ${ANSWERING_RHYME_CANONICALIZATION}.`,
    });
  }

  const relationKey = requiredBoundedString(
    input.relation_key,
    "relation_key",
    ANSWERING_RHYME_STATEMENT_LIMITS.relation_key_chars,
    issues,
  );
  if (relationKey && /[\u0000-\u001f\u007f]/.test(relationKey)) {
    issues.push({
      path: "relation_key",
      code: "invalid_format",
      message: "Control characters are not permitted in a relation key.",
    });
  }

  const targetRevision = requiredBoundedString(
    input.target_revision,
    "target_revision",
    ANSWERING_RHYME_STATEMENT_LIMITS.target_revision_chars,
    issues,
  );
  if (targetRevision && /[\u0000-\u001f\u007f]/.test(targetRevision)) {
    issues.push({
      path: "target_revision",
      code: "invalid_format",
      message: "Control characters are not permitted in a target revision.",
    });
  }

  const normalizedKind =
    typeof input.kind === "string"
      ? normalizeString(input.kind).toLowerCase()
      : input.kind;
  const kind = ANSWERING_RHYME_STATEMENT_KINDS.includes(
    normalizedKind as AnsweringRhymeStatementKind,
  )
    ? (normalizedKind as AnsweringRhymeStatementKind)
    : null;
  if (kind === null) {
    issues.push({
      path: "kind",
      code: input.kind === undefined ? "required" : "unsupported_value",
      message: `Expected one of: ${ANSWERING_RHYME_STATEMENT_KINDS.join(", ")}.`,
    });
  }

  const body = requiredBoundedBody(input.body, issues);

  let language = "und";
  if (input.language !== undefined) {
    if (typeof input.language !== "string") {
      issues.push({ path: "language", code: "wrong_type", message: "Expected a language tag string." });
    } else {
      const normalized = normalizeString(input.language).toLowerCase();
      if (
        normalized.length === 0 ||
        normalized.length > ANSWERING_RHYME_STATEMENT_LIMITS.language_chars ||
        !LANGUAGE_TAG.test(normalized)
      ) {
        issues.push({
          path: "language",
          code: "invalid_format",
          message: "Expected `und` or a BCP 47-style language tag.",
        });
      } else {
        language = normalized.toLowerCase();
      }
    }
  }

  let declaredBy: AnsweringRhymeStatement["declared_by"] | null = null;
  if (!isRecord(input.declared_by)) {
    issues.push({
      path: "declared_by",
      code: input.declared_by === undefined ? "required" : "wrong_type",
      message: "Expected an object with label, claimed_role, and optional canonical_url.",
    });
  } else {
    addUnknownFieldIssues(input.declared_by, DECLARED_BY_FIELDS, "declared_by", issues);
    const label = requiredBoundedString(
      input.declared_by.label,
      "declared_by.label",
      ANSWERING_RHYME_STATEMENT_LIMITS.author_label_chars,
      issues,
    );
    const normalizedRole =
      typeof input.declared_by.claimed_role === "string"
        ? normalizeString(input.declared_by.claimed_role).toLowerCase()
        : input.declared_by.claimed_role;
    const claimedRole = ANSWERING_RHYME_CLAIMED_ROLES.includes(
      normalizedRole as AnsweringRhymeClaimedRole,
    )
      ? (normalizedRole as AnsweringRhymeClaimedRole)
      : null;
    if (claimedRole === null) {
      issues.push({
        path: "declared_by.claimed_role",
        code:
          input.declared_by.claimed_role === undefined
            ? "required"
            : "unsupported_value",
        message: `Expected one of: ${ANSWERING_RHYME_CLAIMED_ROLES.join(", ")}.`,
      });
    }

    let canonicalUrl: string | null = null;
    if (
      input.declared_by.canonical_url !== undefined &&
      input.declared_by.canonical_url !== null
    ) {
      canonicalUrl = normalizeHttpsUrl(
        input.declared_by.canonical_url,
        "declared_by.canonical_url",
        issues,
      );
    }

    if (label !== null && claimedRole !== null) {
      declaredBy = {
        label,
        claimed_role: claimedRole,
        canonical_url: canonicalUrl,
      };
      if (claimedRole !== "viewer" && claimedRole !== "other") {
        warnings.push({
          path: "declared_by.claimed_role",
          code: "authority_is_self_declared",
          message:
            "The role is carried as a self-declaration only; neither witness system verifies it.",
        });
      }
    }
  }

  const declaredAt = normalizeDeclaredAt(input.declared_at, issues);

  let inResponseTo: Sha256ContentHash | null = null;
  if (input.in_response_to !== undefined && input.in_response_to !== null) {
    const normalizedHash =
      typeof input.in_response_to === "string"
        ? normalizeString(input.in_response_to).toLowerCase()
        : null;
    if (normalizedHash === null || !SHA256_HASH.test(normalizedHash)) {
      issues.push({
        path: "in_response_to",
        code: "invalid_format",
        message: "Expected null or a full sha256:<64 hex> content hash.",
      });
    } else {
      inResponseTo = normalizedHash as Sha256ContentHash;
    }
  }

  const evidenceUrls = normalizeUrlList(input.evidence_urls, "evidence_urls", issues);
  const authorityEvidenceUrls = normalizeUrlList(
    input.authority_evidence_urls,
    "authority_evidence_urls",
    issues,
  );

  if (kind === "correct" && evidenceUrls.length === 0) {
    warnings.push({
      path: "evidence_urls",
      code: "evidence_missing",
      message:
        "The correction can be witnessed, but a separate curator review will need evidence before applying it.",
    });
  }
  if (kind === "withdraw" && authorityEvidenceUrls.length === 0) {
    warnings.push({
      path: "authority_evidence_urls",
      code: "evidence_missing",
      message:
        "The withdrawal can be witnessed, but it cannot affect presentation without separately verified authority.",
    });
  }

  if (
    issues.length > 0 ||
    relationKey === null ||
    targetRevision === null ||
    kind === null ||
    body === null ||
    declaredBy === null ||
    declaredAt === null
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
      canonicalization: ANSWERING_RHYME_CANONICALIZATION,
      relation_key: relationKey,
      target_revision: targetRevision,
      kind,
      body,
      language,
      declared_by: declaredBy,
      declared_at: declaredAt,
      in_response_to: inResponseTo,
      evidence_urls: evidenceUrls,
      authority_evidence_urls: authorityEvidenceUrls,
    },
    warnings,
  };
}

/** RFC 8785-inspired subset used by this bounded contract. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON only accepts normalized JSON values.");
}

export function canonicalAnsweringRhymeStatement(
  statement: AnsweringRhymeStatement,
): string {
  return canonicalJson(statement);
}

export function answeringRhymeStatementContentHash(
  statement: AnsweringRhymeStatement,
): Sha256ContentHash {
  const digest = createHash("sha256")
    .update(canonicalAnsweringRhymeStatement(statement), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

/**
 * Build a Cambridge witness receipt for an already validated statement.
 * `witnessed_at` is deliberately outside the portable statement hash.
 */
export function witnessAnsweringRhymeStatement(
  statement: AnsweringRhymeStatement,
  warnings: readonly AnsweringRhymeStatementWarning[],
  targetStatus: "known-current" | "not-current",
  witnessedAt = new Date().toISOString(),
): CambridgeAnsweringRhymeWitnessReceipt {
  return {
    schema: CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA,
    statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
    canonicalization: ANSWERING_RHYME_CANONICALIZATION,
    content_hash: answeringRhymeStatementContentHash(statement),
    witnessed_at: new Date(witnessedAt).toISOString(),
    replay_detection: false,
    uniqueness_not_asserted: true,
    issuer_attestation: {
      signed: false,
      independently_verifiable: false,
      witnessed_at_is_unattested_observation: true,
    },
    statement,
    validation_warnings: warnings,
    target: {
      relation_key: statement.relation_key,
      target_revision: statement.target_revision,
      status: targetStatus,
      evaluated_against: "cambridgetcg-static-corpus",
    },
    witness: {
      system: "cambridgetcg",
      endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
      authenticated: false,
      identity_verified: false,
      persisted: false,
      authoritative_effect: "none",
    },
    storage_boundary: {
      application_record_created: false,
      retrievable_statement_created: false,
      infrastructure_access_logs_may_exist: true,
    },
    authority_boundary: {
      declared_role_is_self_asserted: true,
      evidence_was_verified: false,
      correction_effect: "proposal-only",
      withdrawal_effect: "none-without-separate-authority-verification",
    },
  };
}

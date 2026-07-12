/**
 * Pure contract for the operator source-rights workbench.
 *
 * A workbench review is evidence and a proposal. It is deliberately not an
 * authorization input: runtime gates continue to read only the deployed
 * @cambridge-tcg/data-ingest registry.
 */

import { createHash } from "node:crypto";
import {
  listSourceMeta,
  type SourceMeta,
} from "@cambridge-tcg/data-ingest";
import {
  SOURCE_RIGHTS_PURPOSES,
  SOURCE_RIGHTS_REVIEW_STATES,
  SOURCE_RIGHTS_VERDICTS,
  type SourceRightsPurpose,
  type SourceRightsReviewCell,
  type SourceRightsReviewState,
  type SourceRightsVerdict,
} from "./contract";
export {
  SOURCE_RIGHTS_PURPOSES,
  SOURCE_RIGHTS_REVIEW_STATES,
  SOURCE_RIGHTS_VERDICTS,
};
export type {
  SourceRightsPurpose,
  SourceRightsReviewCell,
  SourceRightsReviewState,
  SourceRightsVerdict,
};

export interface SourceRightsEvidence {
  url: string;
  title: string;
  observed_at: string;
}

export interface SourceRightsProposalContent {
  summary: string;
  public_evidence: SourceRightsEvidence[];
  agreement_reference: string | null;
  valid_until: string | null;
  review_trigger: string;
  cells: SourceRightsReviewCell[];
}

export interface SourceRightsRevisionArtifact extends SourceRightsProposalContent {
  schema: "cambridge-tcg/source-rights-review/v1";
  authority: "proposal-only";
  authority_notice: string;
  source_id: string;
  state: SourceRightsReviewState;
  base_registry_hash: string;
  parent_revision_hash: string | null;
  decision_note: string | null;
  landed_commit: string | null;
}

export class SourceRightsInputError extends Error {
  status: 400 | 413;

  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.name = "SourceRightsInputError";
    this.status = status;
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SourceRightsInputError("Review body is too large.", 413);
  }
  if (!request.body) throw new SourceRightsInputError("Review body must be valid JSON.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SourceRightsInputError("Review body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SourceRightsInputError) throw error;
    throw new SourceRightsInputError("Review body must be valid JSON.");
  }
}

const FIELD_PATH_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SECRET_QUERY_RE = /(?:token|secret|signature|sig|credential|password|passwd|api[-_]?key|access[-_]?key|authorization|x-amz)/i;
const SECRET_VALUE_RE = /(?:bearer\s|-----BEGIN|sk_(?:live|test)_|AKIA[0-9A-Z]{12,}|x-amz-signature)/i;
const ASSIGNED_SECRET_RE = /(?:api[-_ ]?key|access[-_ ]?key|token|secret|password|passwd)\s*[:=]\s*\S{6,}/i;

function assertNoSecretShape(value: string, label: string): string {
  if (SECRET_VALUE_RE.test(value) || ASSIGNED_SECRET_RE.test(value)) {
    throw new SourceRightsInputError(`${label} appears to contain a secret.`);
  }
  return value;
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new SourceRightsInputError(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new SourceRightsInputError(`${label} must be 1-${max} characters.`);
  }
  return assertNoSecretShape(normalized, label);
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, max);
}

function calendarDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new SourceRightsInputError(`${label} must be YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new SourceRightsInputError(`${label} is not a real calendar date.`);
  }
  return value;
}

function normalizeEvidence(value: unknown, today: string): SourceRightsEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new SourceRightsInputError("Provide 1-20 public evidence links.");
  }
  const normalized = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SourceRightsInputError(`Evidence ${index + 1} is invalid.`);
    }
    const record = entry as Record<string, unknown>;
    const rawUrl = requiredText(record.url, `Evidence ${index + 1} URL`, 2048);
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new SourceRightsInputError(`Evidence ${index + 1} URL is invalid.`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new SourceRightsInputError(`Evidence ${index + 1} must be a public HTTPS URL without credentials.`);
    }
    let decodedLocation = `${parsed.pathname}${parsed.hash}`;
    try { decodedLocation = decodeURIComponent(decodedLocation); } catch { /* raw form remains checked */ }
    assertNoSecretShape(decodedLocation, `Evidence ${index + 1} URL`);
    for (const [key, queryValue] of parsed.searchParams) {
      if (SECRET_QUERY_RE.test(key) || SECRET_QUERY_RE.test(queryValue) || SECRET_VALUE_RE.test(queryValue)) {
        throw new SourceRightsInputError(`Evidence ${index + 1} URL appears to contain a secret.`);
      }
    }
    const observedAt = calendarDate(record.observed_at, `Evidence ${index + 1} observed_at`);
    if (observedAt > today) {
      throw new SourceRightsInputError(`Evidence ${index + 1} cannot be observed in the future.`);
    }
    return {
      url: parsed.toString(),
      title: requiredText(record.title, `Evidence ${index + 1} title`, 200),
      observed_at: observedAt,
    };
  });

  const urls = normalized.map((entry) => entry.url);
  if (new Set(urls).size !== urls.length) {
    throw new SourceRightsInputError("Evidence URLs must be unique.");
  }
  return normalized.sort((a, b) => a.url.localeCompare(b.url));
}

function normalizeCells(value: unknown): SourceRightsReviewCell[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    throw new SourceRightsInputError("Provide 1-200 exact field-and-purpose cells.");
  }
  const cells = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SourceRightsInputError(`Review cell ${index + 1} is invalid.`);
    }
    const record = entry as Record<string, unknown>;
    const canonicalFieldPath = requiredText(
      record.proposed_field_path,
      `Review cell ${index + 1} field path`,
      160,
    );
    if (!FIELD_PATH_RE.test(canonicalFieldPath)) {
      throw new SourceRightsInputError(
        `Review cell ${index + 1} needs an exact dotted field path; wildcards and brackets are not allowed.`,
      );
    }
    if (!SOURCE_RIGHTS_PURPOSES.includes(record.purpose as SourceRightsPurpose)) {
      throw new SourceRightsInputError(`Review cell ${index + 1} purpose is invalid.`);
    }
    if (!SOURCE_RIGHTS_VERDICTS.includes(record.verdict as SourceRightsVerdict)) {
      throw new SourceRightsInputError(`Review cell ${index + 1} verdict is invalid.`);
    }
    const verdict = record.verdict as SourceRightsVerdict;
    const conditions = optionalText(record.conditions, `Review cell ${index + 1} conditions`, 2000);
    if ((verdict === "conditional" || verdict === "contract-required") && !conditions) {
      throw new SourceRightsInputError(
        `Review cell ${index + 1} must name the conditions for verdict '${verdict}'.`,
      );
    }
    let retentionDays: number | null = null;
    if (record.retention_days !== undefined && record.retention_days !== null && record.retention_days !== "") {
      const parsed = typeof record.retention_days === "number"
        ? record.retention_days
        : Number(record.retention_days);
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 36500) {
        throw new SourceRightsInputError(`Review cell ${index + 1} retention_days is invalid.`);
      }
      retentionDays = parsed;
    }
    return {
      proposed_field_path: canonicalFieldPath,
      purpose: record.purpose as SourceRightsPurpose,
      verdict,
      conditions,
      attribution: optionalText(record.attribution, `Review cell ${index + 1} attribution`, 1000),
      retention_days: retentionDays,
    };
  });

  const keys = cells.map((cell) => `${cell.proposed_field_path}\0${cell.purpose}`);
  if (new Set(keys).size !== keys.length) {
    throw new SourceRightsInputError("Each field-and-purpose pair may appear only once.");
  }
  return cells.sort((a, b) =>
    a.proposed_field_path.localeCompare(b.proposed_field_path) ||
    a.purpose.localeCompare(b.purpose),
  );
}

export function deployedSourceMeta(sourceId: string): SourceMeta {
  const meta = listSourceMeta().find((source) => source.id === sourceId);
  if (!meta) throw new SourceRightsInputError("Unknown deployed source.");
  return meta;
}

export function deployedRegistryHash(sourceId: string): string {
  const meta = deployedSourceMeta(sourceId);
  return sha256(stableJson({
    source_id: meta.id,
    status: meta.status,
    legacy_license: meta.license,
    legacy_redistribute: meta.redistribute,
    rights: meta.rights,
  }));
}

export function parseSourceRightsProposal(
  value: unknown,
  options: { sourceId: string; now?: Date },
): SourceRightsProposalContent {
  deployedSourceMeta(options.sourceId);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceRightsInputError("Review body must be an object.");
  }
  const body = value as Record<string, unknown>;
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const validUntil = body.valid_until == null || body.valid_until === ""
    ? null
    : calendarDate(body.valid_until, "valid_until");
  if (validUntil && validUntil < today) {
    throw new SourceRightsInputError("valid_until cannot already be in the past.");
  }
  const agreementReference = optionalText(body.agreement_reference, "agreement_reference", 200);
  if (
    agreementReference &&
    (SECRET_VALUE_RE.test(agreementReference) || /^https?:\/\//i.test(agreementReference) || agreementReference.includes("@"))
  ) {
    throw new SourceRightsInputError("agreement_reference must be an opaque non-secret record reference.");
  }

  return {
    summary: requiredText(body.summary, "summary", 1000),
    public_evidence: normalizeEvidence(body.public_evidence, today),
    agreement_reference: agreementReference,
    valid_until: validUntil,
    review_trigger: requiredText(body.review_trigger, "review_trigger", 1000),
    cells: normalizeCells(body.cells),
  };
}

export function buildSourceRightsArtifact(args: {
  sourceId: string;
  state: SourceRightsReviewState;
  content: SourceRightsProposalContent;
  baseRegistryHash?: string;
  parentRevisionHash?: string | null;
  decisionNote?: string | null;
  landedCommit?: string | null;
}): SourceRightsRevisionArtifact {
  if (!SOURCE_RIGHTS_REVIEW_STATES.includes(args.state)) {
    throw new SourceRightsInputError("Invalid review state.");
  }
  const landedCommit = args.landedCommit?.trim() || null;
  const decisionNote = args.decisionNote?.trim() || null;
  if (decisionNote) assertNoSecretShape(decisionNote, "Rejection reason");
  if (args.state === "rejected") {
    if (!decisionNote || decisionNote.length > 1000) {
      throw new SourceRightsInputError("A rejected review needs a 1-1000 character reason.");
    }
  } else if (decisionNote) {
    throw new SourceRightsInputError("Only a rejected review may carry a rejection reason.");
  }
  if (args.state === "landed") {
    if (!landedCommit || !SHA40_RE.test(landedCommit)) {
      throw new SourceRightsInputError("A landed observation needs a full lowercase 40-character commit SHA.");
    }
  } else if (landedCommit) {
    throw new SourceRightsInputError("Only a landed observation may carry a commit SHA.");
  }
  return {
    schema: "cambridge-tcg/source-rights-review/v1",
    authority: "proposal-only",
    authority_notice:
      "This review does not grant runtime permission. Only the deployed @cambridge-tcg/data-ingest registry is effective.",
    source_id: args.sourceId,
    state: args.state,
    base_registry_hash: args.baseRegistryHash ?? deployedRegistryHash(args.sourceId),
    parent_revision_hash: args.parentRevisionHash ?? null,
    decision_note: decisionNote,
    landed_commit: landedCommit,
    ...args.content,
  };
}

export function sourceRightsRevisionHash(artifact: SourceRightsRevisionArtifact): string {
  return sha256(stableJson(artifact));
}

export function sourceRightsArtifactJson(artifact: SourceRightsRevisionArtifact): string {
  return `${stableJson(artifact)}\n`;
}

export function allowedSourceRightsTransition(
  from: SourceRightsReviewState,
  to: SourceRightsReviewState,
): boolean {
  return (
    (from === "draft" && (to === "proposed" || to === "rejected")) ||
    (from === "proposed" && (to === "rejected" || to === "landed"))
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) throw new Error("Undefined cannot enter a canonical source-rights artifact.");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  const pairs = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`);
  return `{${pairs.join(",")}}`;
}

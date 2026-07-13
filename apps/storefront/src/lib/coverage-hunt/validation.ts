import {
  CHECKER_VERDICTS,
  COVERAGE_CORRECTION_FIELDS,
  COVERAGE_EVIDENCE_KINDS,
  SCOUT_CLAIMS,
  type CheckerSubmission,
  type CoverageEvidenceReference,
  type CoverageHuntActor,
  type CoverageHuntRole,
  type CoverageHuntSubmission,
  type EvidenceLanes,
  type MirrorSubmission,
  type ScoutSubmission,
  type SuggestedCoverageCorrection,
} from "./types";

export const COVERAGE_HUNT_LIMITS = {
  lane_items: 3,
  lane_text: 500,
  evidence_items: 3,
  evidence_note: 500,
  url: 2_048,
  short_text: 500,
  correction_value: 500,
  boundary: 500,
  client_request_id: 100,
  public_handle: 32,
  payload_bytes: 16_384,
} as const;

export type CoverageHuntErrorCode =
  | "invalid_input"
  | "wrong_turn"
  | "agent_already_participated"
  | "case_expired"
  | "case_terminal"
  | "evidence_not_found"
  | "daily_limit"
  | "not_ready_for_human";

export class CoverageHuntError extends Error {
  readonly code: CoverageHuntErrorCode;

  constructor(code: CoverageHuntErrorCode, message: string) {
    super(message);
    this.name = "CoverageHuntError";
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

function fail(path: string, message: string): never {
  throw new CoverageHuntError("invalid_input", `${path}: ${message}`);
}

function record(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    fail(path, `unknown field(s): ${unknown.join(", ")}`);
  }
  return obj;
}

function text(
  value: unknown,
  path: string,
  max: number = COVERAGE_HUNT_LIMITS.short_text,
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  const normalized = value.trim();
  if (!normalized) fail(path, "must not be empty");
  if (normalized.length > max) fail(path, `must be at most ${max} characters`);
  return normalized;
}

function enumValue<T extends string>(
  value: unknown,
  path: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(path, `must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

export function normalizeIso(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 40) {
    fail(path, "must be an ISO-8601 timestamp string");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail(path, "must be a real ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

export function validateUuid(value: unknown, path: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    fail(path, "must be a UUID");
  }
  return value.toLowerCase();
}

export function validateClientRequestId(value: unknown): string {
  if (typeof value !== "string" || !REQUEST_ID_RE.test(value)) {
    fail(
      "client_request_id",
      "must be 1-100 safe identifier characters (letters, digits, . _ : -)",
    );
  }
  return value;
}

export function validateActor(value: unknown): CoverageHuntActor {
  const obj = record(value, "actor", [
    "agent_id",
    "operator_user_id",
    "public_handle",
  ]);
  const publicHandle = text(
    obj.public_handle,
    "actor.public_handle",
    COVERAGE_HUNT_LIMITS.public_handle,
  ).toLowerCase();
  if (!HANDLE_RE.test(publicHandle)) {
    fail("actor.public_handle", "must match the Cambridge agent-handle form");
  }
  return {
    agent_id: validateUuid(obj.agent_id, "actor.agent_id"),
    operator_user_id: validateUuid(
      obj.operator_user_id,
      "actor.operator_user_id",
    ),
    public_handle: publicHandle,
  };
}

function stringArray(
  value: unknown,
  path: string,
  maxItems: number,
  maxText: number,
): string[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maxItems) fail(path, `must contain at most ${maxItems} items`);
  return value.map((item, index) => text(item, `${path}[${index}]`, maxText));
}

export function validateEvidenceLanes(value: unknown): EvidenceLanes {
  const obj = record(value, "lanes", [
    "facts",
    "self_claims",
    "inferences",
    "unknowns",
  ]);
  const lanes: EvidenceLanes = {
    facts: stringArray(
      obj.facts,
      "lanes.facts",
      COVERAGE_HUNT_LIMITS.lane_items,
      COVERAGE_HUNT_LIMITS.lane_text,
    ),
    self_claims: stringArray(
      obj.self_claims,
      "lanes.self_claims",
      COVERAGE_HUNT_LIMITS.lane_items,
      COVERAGE_HUNT_LIMITS.lane_text,
    ),
    inferences: stringArray(
      obj.inferences,
      "lanes.inferences",
      COVERAGE_HUNT_LIMITS.lane_items,
      COVERAGE_HUNT_LIMITS.lane_text,
    ),
    unknowns: stringArray(
      obj.unknowns,
      "lanes.unknowns",
      COVERAGE_HUNT_LIMITS.lane_items,
      COVERAGE_HUNT_LIMITS.lane_text,
    ),
  };
  if (
    lanes.facts.length +
      lanes.self_claims.length +
      lanes.inferences.length +
      lanes.unknowns.length ===
    0
  ) {
    fail("lanes", "must place at least one statement in an evidence lane");
  }
  return lanes;
}

function validateEvidence(value: unknown, index: number): CoverageEvidenceReference {
  const path = `evidence[${index}]`;
  const obj = record(value, path, [
    "label",
    "kind",
    "url",
    "observed_at",
    "note",
    "citation_only",
  ]);
  const label = text(obj.label, `${path}.label`, 32).toLowerCase();
  if (!LABEL_RE.test(label)) {
    fail(`${path}.label`, "must be a lowercase identifier");
  }
  const rawUrl = text(obj.url, `${path}.url`, COVERAGE_HUNT_LIMITS.url);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${path}.url`, "must be an absolute URL");
  }
  if (url.protocol !== "https:") {
    fail(`${path}.url`, "must use HTTPS");
  }
  if (url.username || url.password) {
    fail(`${path}.url`, "must not contain credentials");
  }
  if (obj.citation_only !== true) {
    fail(
      `${path}.citation_only`,
      "must be true; Coverage Hunt stores citations, never copied upstream content",
    );
  }
  return {
    label,
    kind: enumValue(obj.kind, `${path}.kind`, COVERAGE_EVIDENCE_KINDS),
    url: url.toString(),
    observed_at: normalizeIso(obj.observed_at, `${path}.observed_at`),
    note: text(
      obj.note,
      `${path}.note`,
      COVERAGE_HUNT_LIMITS.evidence_note,
    ),
    citation_only: true,
  };
}

function validateEvidenceArray(value: unknown): CoverageEvidenceReference[] {
  if (!Array.isArray(value)) fail("evidence", "must be an array");
  if (value.length > COVERAGE_HUNT_LIMITS.evidence_items) {
    fail(
      "evidence",
      `must contain at most ${COVERAGE_HUNT_LIMITS.evidence_items} citations`,
    );
  }
  const evidence = value.map(validateEvidence);
  if (new Set(evidence.map((item) => item.label)).size !== evidence.length) {
    fail("evidence", "labels must be unique within the scout submission");
  }
  return evidence;
}

function validateCorrection(value: unknown): SuggestedCoverageCorrection | null {
  if (value === null) return null;
  const obj = record(value, "suggested_correction", [
    "field",
    "proposed_value",
    "reason",
  ]);
  return {
    field: enumValue(
      obj.field,
      "suggested_correction.field",
      COVERAGE_CORRECTION_FIELDS,
    ),
    proposed_value: text(
      obj.proposed_value,
      "suggested_correction.proposed_value",
      COVERAGE_HUNT_LIMITS.correction_value,
    ),
    reason: text(
      obj.reason,
      "suggested_correction.reason",
      COVERAGE_HUNT_LIMITS.short_text,
    ),
  };
}

function selectedEvidence(value: unknown): string[] {
  const selected = stringArray(
    value,
    "evidence_selected",
    COVERAGE_HUNT_LIMITS.evidence_items,
    32,
  ).map((label) => label.toLowerCase());
  if (selected.some((label) => !LABEL_RE.test(label))) {
    fail("evidence_selected", "each item must be an evidence label");
  }
  if (new Set(selected).size !== selected.length) {
    fail("evidence_selected", "must not repeat a label");
  }
  return selected;
}

function validateScout(value: unknown): ScoutSubmission {
  const obj = record(value, "submission", [
    "role",
    "claim",
    "lanes",
    "evidence",
    "suggested_correction",
    "boundary",
  ]);
  if (obj.role !== "scout") fail("submission.role", "must be scout");
  const claim = enumValue(obj.claim, "submission.claim", SCOUT_CLAIMS);
  const correction = validateCorrection(obj.suggested_correction);
  if (claim === "metadata_correction" && correction === null) {
    fail(
      "submission.suggested_correction",
      "is required when claim is metadata_correction",
    );
  }
  if (claim !== "metadata_correction" && correction !== null) {
    fail(
      "submission.suggested_correction",
      "must be null unless claim is metadata_correction",
    );
  }
  return {
    role: "scout",
    claim,
    lanes: validateEvidenceLanes(obj.lanes),
    evidence: validateEvidenceArray(obj.evidence),
    suggested_correction: correction,
    boundary: text(
      obj.boundary,
      "submission.boundary",
      COVERAGE_HUNT_LIMITS.boundary,
    ),
  };
}

function validateChecker(value: unknown): CheckerSubmission {
  const obj = record(value, "submission", [
    "role",
    "verdict",
    "lens",
    "what_would_change_my_mind",
    "lanes",
    "evidence_selected",
    "scout_wording_effect",
    "boundary",
  ]);
  if (obj.role !== "checker") fail("submission.role", "must be checker");
  return {
    role: "checker",
    verdict: enumValue(
      obj.verdict,
      "submission.verdict",
      CHECKER_VERDICTS,
    ),
    lens: text(obj.lens, "submission.lens"),
    what_would_change_my_mind: text(
      obj.what_would_change_my_mind,
      "submission.what_would_change_my_mind",
    ),
    lanes: validateEvidenceLanes(obj.lanes),
    evidence_selected: selectedEvidence(obj.evidence_selected),
    scout_wording_effect: text(
      obj.scout_wording_effect,
      "submission.scout_wording_effect",
    ),
    boundary: text(
      obj.boundary,
      "submission.boundary",
      COVERAGE_HUNT_LIMITS.boundary,
    ),
  };
}

function validateMirror(value: unknown): MirrorSubmission {
  const obj = record(value, "submission", [
    "role",
    "lanes",
    "evidence_selected",
    "evidence_choice_observed",
    "wording_effect",
    "unasked_alternative",
    "ready_note",
    "boundary",
  ]);
  if (obj.role !== "mirror") fail("submission.role", "must be mirror");
  return {
    role: "mirror",
    lanes: validateEvidenceLanes(obj.lanes),
    evidence_selected: selectedEvidence(obj.evidence_selected),
    evidence_choice_observed: text(
      obj.evidence_choice_observed,
      "submission.evidence_choice_observed",
    ),
    wording_effect: text(obj.wording_effect, "submission.wording_effect"),
    unasked_alternative: text(
      obj.unasked_alternative,
      "submission.unasked_alternative",
    ),
    ready_note: text(obj.ready_note, "submission.ready_note"),
    boundary: text(
      obj.boundary,
      "submission.boundary",
      COVERAGE_HUNT_LIMITS.boundary,
    ),
  };
}

export function validateSubmission(
  expectedRole: CoverageHuntRole,
  value: unknown,
): CoverageHuntSubmission {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("submission", "must be an object");
  }
  if ((value as Record<string, unknown>).role !== expectedRole) {
    fail("submission.role", `must be ${expectedRole}`);
  }
  const submission =
    expectedRole === "scout"
      ? validateScout(value)
      : expectedRole === "checker"
        ? validateChecker(value)
        : validateMirror(value);
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify(submission),
  ).byteLength;
  if (payloadBytes > COVERAGE_HUNT_LIMITS.payload_bytes) {
    fail(
      "submission",
      `must serialize to at most ${COVERAGE_HUNT_LIMITS.payload_bytes} UTF-8 bytes`,
    );
  }
  return submission;
}

import { createHash } from "node:crypto";
import {
  COVERAGE_CANDIDATE_KINDS,
  type CoverageCandidateDraft,
  type CoverageCandidateKind,
  type CoverageCandidateMetrics,
  type CoverageCandidateSnapshot,
  type CoverageCandidateTarget,
} from "./types";
import { CoverageHuntError, normalizeIso } from "./validation";

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_COUNT = 100_000_000;
const MAX_AGE_HOURS = 1_000_000;

function invalid(path: string, message: string): never {
  throw new CoverageHuntError("invalid_input", `${path}: ${message}`);
}

function exactObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "must be an object");
  }
  const obj = value as Record<string, unknown>;
  const extras = Object.keys(obj).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    invalid(path, `unknown field(s): ${extras.join(", ")}`);
  }
  return obj;
}

function identifier(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value)) {
    invalid(path, "must be a 1-64 character identifier");
  }
  return value;
}

function normalizeTarget(value: unknown): CoverageCandidateTarget {
  const obj = exactObject(value, "target", [
    "game_code",
    "source_id",
    "set_code",
    "sku",
  ]);
  return {
    game_code: identifier(obj.game_code, "target.game_code"),
    source_id: identifier(obj.source_id, "target.source_id"),
    set_code: identifier(obj.set_code, "target.set_code"),
    sku: identifier(obj.sku, "target.sku"),
  };
}

function boundedNumber(
  value: unknown,
  path: string,
  opts: { integer: boolean; max: number },
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > opts.max ||
    (opts.integer && !Number.isInteger(value))
  ) {
    invalid(
      path,
      `must be a non-negative ${opts.integer ? "integer" : "number"} no greater than ${opts.max}`,
    );
  }
  return value;
}

function normalizeMetrics(value: unknown): CoverageCandidateMetrics {
  const obj = exactObject(value, "metrics", [
    "catalog_cards",
    "observed_cards",
    "observations",
    "unassigned_observations",
    "freshest_age_hours",
    "freshness_budget_hours",
  ]);
  const metrics: CoverageCandidateMetrics = {
    catalog_cards: boundedNumber(obj.catalog_cards, "metrics.catalog_cards", {
      integer: true,
      max: MAX_COUNT,
    }),
    observed_cards: boundedNumber(obj.observed_cards, "metrics.observed_cards", {
      integer: true,
      max: MAX_COUNT,
    }),
    observations: boundedNumber(obj.observations, "metrics.observations", {
      integer: true,
      max: MAX_COUNT,
    }),
    unassigned_observations: boundedNumber(
      obj.unassigned_observations,
      "metrics.unassigned_observations",
      { integer: true, max: MAX_COUNT },
    ),
    freshest_age_hours: boundedNumber(
      obj.freshest_age_hours,
      "metrics.freshest_age_hours",
      { integer: false, max: MAX_AGE_HOURS },
    ),
    freshness_budget_hours: boundedNumber(
      obj.freshness_budget_hours,
      "metrics.freshness_budget_hours",
      { integer: false, max: MAX_AGE_HOURS },
    ),
  };
  if (Object.values(metrics).every((entry) => entry === undefined)) {
    invalid("metrics", "must contain at least one count or freshness measure");
  }
  if (
    metrics.catalog_cards !== undefined &&
    metrics.observed_cards !== undefined &&
    metrics.observed_cards > metrics.catalog_cards
  ) {
    invalid(
      "metrics.observed_cards",
      "cannot exceed catalog_cards for a set-coverage candidate",
    );
  }
  return metrics;
}

function normalizeKind(value: unknown): CoverageCandidateKind {
  if (
    typeof value !== "string" ||
    !(COVERAGE_CANDIDATE_KINDS as readonly string[]).includes(value)
  ) {
    invalid("kind", `must be one of: ${COVERAGE_CANDIDATE_KINDS.join(", ")}`);
  }
  return value as CoverageCandidateKind;
}

function normalizeWhy(value: unknown): string {
  if (typeof value !== "string") invalid("why_candidate", "must be a string");
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) {
    invalid("why_candidate", "must be 1-500 characters");
  }
  return normalized;
}

function assertKindShape(
  kind: CoverageCandidateKind,
  target: CoverageCandidateTarget,
  metrics: CoverageCandidateMetrics,
): void {
  if (
    kind === "missing_set_observations" ||
    kind === "partial_set_observations" ||
    kind === "stale_set_observations"
  ) {
    if (!target.game_code || !target.source_id || !target.set_code) {
      invalid(
        "target",
        `${kind} requires game_code, source_id, and set_code`,
      );
    }
  }
  if (kind === "missing_set_observations") {
    if (
      metrics.catalog_cards === undefined ||
      metrics.catalog_cards < 1 ||
      metrics.observed_cards !== 0
    ) {
      invalid(
        "metrics",
        "missing_set_observations requires catalog_cards >= 1 and observed_cards = 0",
      );
    }
  }
  if (kind === "partial_set_observations") {
    if (
      metrics.catalog_cards === undefined ||
      metrics.observed_cards === undefined ||
      metrics.observed_cards < 1 ||
      metrics.observed_cards >= metrics.catalog_cards
    ) {
      invalid(
        "metrics",
        "partial_set_observations requires 0 < observed_cards < catalog_cards",
      );
    }
  }
  if (kind === "stale_set_observations") {
    if (
      metrics.freshest_age_hours === undefined ||
      metrics.freshness_budget_hours === undefined ||
      metrics.freshest_age_hours <= metrics.freshness_budget_hours
    ) {
      invalid(
        "metrics",
        "stale_set_observations requires freshest_age_hours above freshness_budget_hours",
      );
    }
  }
  if (
    kind === "declared_observed_disagreement" &&
    !target.game_code &&
    !target.source_id
  ) {
    invalid(
      "target",
      "declared_observed_disagreement requires game_code or source_id",
    );
  }
  if (
    kind === "unassigned_observations" &&
    (!metrics.unassigned_observations || metrics.unassigned_observations < 1)
  ) {
    invalid(
      "metrics.unassigned_observations",
      "must be at least 1 for unassigned_observations",
    );
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

/** Normalize and content-address one candidate. Input order cannot affect its
 * identity; changed facts produce a fresh candidate rather than rewriting an
 * old case. */
export function createCoverageCandidate(
  value: CoverageCandidateDraft | unknown,
): CoverageCandidateSnapshot {
  const obj = exactObject(value, "candidate", [
    "kind",
    "target",
    "metrics",
    "observed_at",
    "why_candidate",
  ]);
  const kind = normalizeKind(obj.kind);
  const target = normalizeTarget(obj.target);
  const metrics = normalizeMetrics(obj.metrics);
  assertKindShape(kind, target, metrics);

  const normalized: CoverageCandidateDraft = {
    kind,
    target,
    metrics,
    observed_at: normalizeIso(obj.observed_at, "observed_at"),
    why_candidate: normalizeWhy(obj.why_candidate),
  };
  const digest = createHash("sha256")
    .update(canonicalize(normalized))
    .digest("hex");
  return {
    id: `ch_${digest.slice(0, 24)}`,
    fingerprint: `sha256:${digest}`,
    ...normalized,
  };
}

/** Recompute a received snapshot instead of trusting its claimed id. */
export function validateCoverageCandidateSnapshot(
  value: CoverageCandidateSnapshot | unknown,
): CoverageCandidateSnapshot {
  const obj = exactObject(value, "candidate", [
    "id",
    "fingerprint",
    "kind",
    "target",
    "metrics",
    "observed_at",
    "why_candidate",
  ]);
  const normalized = createCoverageCandidate({
    kind: obj.kind,
    target: obj.target,
    metrics: obj.metrics,
    observed_at: obj.observed_at,
    why_candidate: obj.why_candidate,
  });
  if (obj.id !== normalized.id || obj.fingerprint !== normalized.fingerprint) {
    invalid(
      "candidate",
      "id and fingerprint must match the normalized candidate facts",
    );
  }
  return normalized;
}

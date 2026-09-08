/**
 * The credential-verification receipt is deliberately a small, closed contract.
 * It records only bounded labels and deployment metadata; provider payloads and
 * credential-adjacent values must remain outside it.
 */
export const VERIFICATION_RECEIPT_SCHEMA_VERSION =
  "credential-verification/v1" as const;
export const VERIFICATION_CHECK_VERSION = "github-oauth/1" as const;
export const VERIFICATION_READINESS_TTL_MS = 15 * 60 * 1_000;

export const VERIFICATION_STATUSES = Object.freeze([
  "passed",
  "failed",
  "blocked",
  "skipped",
] as const);
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_EVIDENCE_KINDS = Object.freeze([
  "mocked",
  "live_observed",
  "operator_declared",
  "not_observed",
] as const);
export type VerificationEvidenceKind =
  (typeof VERIFICATION_EVIDENCE_KINDS)[number];

export const VERIFICATION_SCOPES = Object.freeze([
  "preflight",
  "journey",
  "explain",
] as const);
export type VerificationScope = (typeof VERIFICATION_SCOPES)[number];

export const VERIFICATION_SCENARIOS = Object.freeze([
  "configuration_review",
  "positive_login",
  "expected_denial",
  "attempt_explanation",
] as const);
export type VerificationScenario = (typeof VERIFICATION_SCENARIOS)[number];

export const VERIFICATION_CHECK_NAMES = Object.freeze([
  "configuration",
  "provider_discovery",
  "requested_scopes",
  "authorization_request",
  "deployment_identity",
  "operator_declaration",
  "anonymous_baseline",
  "provider_callback",
  "expected_denial",
  "identity",
  "session",
  "logout",
  "attempt_explanation",
] as const);
export type VerificationCheckName = (typeof VERIFICATION_CHECK_NAMES)[number];

export const VERIFICATION_OUTCOMES = Object.freeze([
  "configured",
  "not_configured",
  "provider_discovered",
  "provider_not_discovered",
  "scopes_match",
  "scopes_mismatch",
  "authorization_request_matches",
  "authorization_request_mismatch",
  "deployment_current",
  "deployment_not_ready",
  "deployment_changed",
  "declared",
  "not_declared",
  "anonymous_session",
  "session_present",
  "callback_observed",
  "callback_not_observed",
  "denial_observed",
  "denial_not_observed",
  "identity_matches_expected",
  "identity_mismatch",
  "session_established",
  "session_not_established",
  "session_ended",
  "session_still_present",
  "explanation_matched",
  "explanation_not_available",
  "not_observed",
] as const);
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

/** Static labels only; no raw errors, URLs, provider responses, or free text. */
export const VERIFICATION_REASONS = Object.freeze([
  "config_missing_base",
  "config_invalid_base",
  "config_origin_not_approved",
  "config_production_acknowledgement_required",
  "config_fixture_required",
  "config_fixture_not_approved",
  "operator_declaration_required",
  "authorization_probe_not_requested",
  "discovery_provider_missing",
  "discovery_scope_mismatch",
  "redirect_callback_mismatch",
  "redirect_authorization_endpoint_mismatch",
  "deployment_not_ready",
  "deployment_identity_unavailable",
  "configuration_newer_than_deployment",
  "deployment_changed_during_run",
  "session_anonymous_baseline_missing",
  "session_identity_mismatch",
  "session_not_established",
  "logout_session_still_present",
  "cancelled_by_operator",
  "tool_unavailable",
  "tool_timeout",
  "tool_output_invalid",
  "tool_limit_reached",
  "attempt_not_found",
  "attempt_evidence_delayed",
] as const);
export type VerificationReason = (typeof VERIFICATION_REASONS)[number];

export type VerificationEnvironment = "production" | "staging";
/** A normalized public or loopback origin, never an OAuth/request URL. */
export type VerificationOrigin = string;

export interface VerificationDeploymentIdentity {
  readonly id: string | null;
  readonly sha: string | null;
  readonly observedAt: string;
}

export interface VerificationCheck {
  readonly name: VerificationCheckName;
  readonly required: boolean;
  readonly status: VerificationStatus;
  readonly evidence: VerificationEvidenceKind;
  readonly expected: VerificationOutcome;
  readonly observed: VerificationOutcome;
  readonly reason?: VerificationReason;
}

export interface VerificationReceipt {
  readonly schemaVersion: typeof VERIFICATION_RECEIPT_SCHEMA_VERSION;
  readonly checkVersion: typeof VERIFICATION_CHECK_VERSION;
  readonly provider: "github";
  readonly scope: VerificationScope;
  readonly scenario: VerificationScenario;
  readonly runId: string;
  readonly environment: VerificationEnvironment;
  /** Approved normalized origin: scheme, host, and optional port only. */
  readonly origin: VerificationOrigin;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly readinessExpiresAt: string;
  /** Snapshot before the run, retained only to detect a change during it. */
  readonly deploymentStarted: VerificationDeploymentIdentity | null;
  /** Deployment identity observed at completion. */
  readonly deployment: VerificationDeploymentIdentity | null;
  readonly checks: readonly VerificationCheck[];
}

export interface VerificationReceiptInput
  extends Omit<VerificationReceipt, "schemaVersion" | "checkVersion" | "readinessExpiresAt"> {
  readonly schemaVersion?: typeof VERIFICATION_RECEIPT_SCHEMA_VERSION;
  readonly checkVersion?: typeof VERIFICATION_CHECK_VERSION;
  readonly readinessExpiresAt?: string;
}

export interface VerificationSummary {
  readonly status: VerificationStatus;
  readonly incomplete: boolean;
  /** A denial can pass its own negative scenario without proving a login. */
  readonly positiveJourneyVerified: boolean;
  readonly requiredChecks: readonly VerificationCheckName[];
  readonly incompleteChecks: readonly VerificationCheckName[];
}

export const VERIFICATION_READINESS_STATUSES = Object.freeze([
  "current",
  "stale",
  "unknown",
] as const);
export type VerificationReadinessStatus =
  (typeof VERIFICATION_READINESS_STATUSES)[number];

export const VERIFICATION_READINESS_REASONS = Object.freeze([
  "required_checks_incomplete",
  "expired",
  "current_time_invalid",
  "receipt_completed_in_future",
  "deployment_changed",
  "configuration_changed",
  "environment_changed",
  "origin_changed",
  "check_version_changed",
  "journey_not_live_observed",
  "deployment_identity_unknown",
  "current_deployment_unknown",
  "current_configuration_unknown",
  "current_environment_unknown",
  "current_origin_unknown",
  "current_check_version_unknown",
] as const);
export type VerificationReadinessReason =
  (typeof VERIFICATION_READINESS_REASONS)[number];

export interface VerificationReadiness {
  readonly status: VerificationReadinessStatus;
  readonly reason?: VerificationReadinessReason;
}

export interface VerificationCurrentState {
  readonly environment: VerificationEnvironment | null;
  readonly origin: VerificationOrigin | null;
  readonly checkVersion: string | null;
  readonly deployment: VerificationDeploymentIdentity | null;
  /** This is a comparison result, never a credential fingerprint. */
  readonly configurationChanged: boolean | null;
}

const EXPECTED_OUTCOMES: Readonly<Record<VerificationCheckName, VerificationOutcome>> = {
  configuration: "configured",
  provider_discovery: "provider_discovered",
  requested_scopes: "scopes_match",
  authorization_request: "authorization_request_matches",
  deployment_identity: "deployment_current",
  operator_declaration: "declared",
  anonymous_baseline: "anonymous_session",
  provider_callback: "callback_observed",
  expected_denial: "denial_observed",
  identity: "identity_matches_expected",
  session: "session_established",
  logout: "session_ended",
  attempt_explanation: "explanation_matched",
};

const REQUIRED_CHECKS: Readonly<Record<VerificationScenario, readonly VerificationCheckName[]>> = {
  configuration_review: [
    "configuration",
    "provider_discovery",
    "requested_scopes",
    "authorization_request",
    "deployment_identity",
    "operator_declaration",
  ],
  positive_login: [
    "deployment_identity",
    "anonymous_baseline",
    "provider_callback",
    "identity",
    "session",
    "logout",
  ],
  expected_denial: [
    "deployment_identity",
    "anonymous_baseline",
    "provider_callback",
    "expected_denial",
    "logout",
  ],
  attempt_explanation: ["attempt_explanation"],
};

const SCENARIO_SCOPE: Readonly<Record<VerificationScenario, VerificationScope>> = {
  configuration_review: "preflight",
  positive_login: "journey",
  expected_denial: "journey",
  attempt_explanation: "explain",
};

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{1,128}$/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isIsoTime(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Reject paths, queries, fragments, credentials, and non-loopback HTTP. */
export function isNormalizedVerificationOrigin(value: unknown): value is VerificationOrigin {
  if (typeof value !== "string" || value.length > 255) return false;
  try {
    const url = new URL(value);
    const loopback = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "[::1]";
    return url.origin === value
      && url.username === ""
      && url.password === ""
      && url.pathname === "/"
      && url.search === ""
      && url.hash === ""
      && (url.protocol === "https:" || (url.protocol === "http:" && loopback));
  } catch {
    return false;
  }
}

function isDeploymentIdentity(value: unknown): value is VerificationDeploymentIdentity {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "sha", "observedAt"])) return false;
  return (
    (value.id === null || (typeof value.id === "string" && DEPLOYMENT_ID_PATTERN.test(value.id)))
    && (value.sha === null || (typeof value.sha === "string" && SHA_PATTERN.test(value.sha)))
    && isIsoTime(value.observedAt)
  );
}

function isCheck(value: unknown): value is VerificationCheck {
  if (!isRecord(value)) return false;
  const baseKeys = ["name", "required", "status", "evidence", "expected", "observed"];
  const keys = Object.keys(value);
  if (!hasExactKeys(value, "reason" in value ? [...baseKeys, "reason"] : baseKeys)) return false;
  if (
    !isOneOf(VERIFICATION_CHECK_NAMES, value.name)
    || typeof value.required !== "boolean"
    || !isOneOf(VERIFICATION_STATUSES, value.status)
    || !isOneOf(VERIFICATION_EVIDENCE_KINDS, value.evidence)
    || !isOneOf(VERIFICATION_OUTCOMES, value.expected)
    || !isOneOf(VERIFICATION_OUTCOMES, value.observed)
    || value.expected !== EXPECTED_OUTCOMES[value.name]
  ) return false;

  const hasReason = "reason" in value;
  if (hasReason && !isOneOf(VERIFICATION_REASONS, value.reason)) return false;
  if (value.status === "passed") {
    return !hasReason && value.evidence !== "not_observed" && value.observed === value.expected;
  }
  if (value.status === "failed") {
    return hasReason && value.observed !== value.expected;
  }
  return (
    hasReason
    && value.evidence === "not_observed"
    && value.observed === "not_observed"
  );
}

function sameKnownDeployment(
  left: VerificationDeploymentIdentity,
  right: VerificationDeploymentIdentity,
): boolean | null {
  if (!left.id || !left.sha || !right.id || !right.sha) return null;
  return left.id === right.id && left.sha === right.sha;
}

function deploymentChangedDuringRun(receipt: VerificationReceipt): boolean {
  if (!receipt.deploymentStarted || !receipt.deployment) return false;
  return sameKnownDeployment(receipt.deploymentStarted, receipt.deployment) === false;
}

function deploymentObservedWithinRun(receipt: VerificationReceipt): boolean {
  const started = Date.parse(receipt.startedAt);
  const completed = Date.parse(receipt.completedAt);
  return [receipt.deploymentStarted, receipt.deployment].every((deployment) =>
    deployment === null || (
      Date.parse(deployment.observedAt) >= started
      && Date.parse(deployment.observedAt) <= completed
    ),
  );
}

function hasKnownMatchingDeploymentSnapshots(receipt: VerificationReceipt): boolean {
  return receipt.deploymentStarted !== null
    && receipt.deployment !== null
    && sameKnownDeployment(receipt.deploymentStarted, receipt.deployment) === true;
}

function hasRequiredScenarioChecks(receipt: VerificationReceipt): boolean {
  const required = REQUIRED_CHECKS[receipt.scenario];
  return required.every((name) => receipt.checks.some((check) => check.name === name && check.required));
}

function hasOnlyScenarioChecks(receipt: VerificationReceipt): boolean {
  const allowed = REQUIRED_CHECKS[receipt.scenario];
  return receipt.checks.every((check) => allowed.includes(check.name));
}

/** Runtime guard for untrusted JSON. Unknown fields are rejected at every level. */
export function isVerificationReceipt(value: unknown): value is VerificationReceipt {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "checkVersion", "provider", "scope", "scenario", "runId",
    "environment", "origin", "startedAt", "completedAt", "readinessExpiresAt",
    "deploymentStarted", "deployment", "checks",
  ])) return false;
  if (
    value.schemaVersion !== VERIFICATION_RECEIPT_SCHEMA_VERSION
    || value.checkVersion !== VERIFICATION_CHECK_VERSION
    || value.provider !== "github"
    || !isOneOf(VERIFICATION_SCOPES, value.scope)
    || !isOneOf(VERIFICATION_SCENARIOS, value.scenario)
    || SCENARIO_SCOPE[value.scenario] !== value.scope
    || typeof value.runId !== "string" || !RUN_ID_PATTERN.test(value.runId)
    || (value.environment !== "production" && value.environment !== "staging")
    || !isNormalizedVerificationOrigin(value.origin)
    || !isIsoTime(value.startedAt)
    || !isIsoTime(value.completedAt)
    || !isIsoTime(value.readinessExpiresAt)
    || !(value.deploymentStarted === null || isDeploymentIdentity(value.deploymentStarted))
    || !(value.deployment === null || isDeploymentIdentity(value.deployment))
    || !Array.isArray(value.checks)
    || value.checks.length === 0
    || value.checks.length > VERIFICATION_CHECK_NAMES.length
    || !value.checks.every(isCheck)
  ) return false;

  const receipt = value as unknown as VerificationReceipt;
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) return false;
  if (
    Date.parse(receipt.readinessExpiresAt)
    !== Date.parse(receipt.completedAt) + VERIFICATION_READINESS_TTL_MS
  ) return false;
  if (new Set(receipt.checks.map((check) => check.name)).size !== receipt.checks.length) return false;
  if (!hasRequiredScenarioChecks(receipt) || !hasOnlyScenarioChecks(receipt)) return false;
  if (!deploymentObservedWithinRun(receipt)) return false;

  const deploymentCheck = receipt.checks.find((check) => check.name === "deployment_identity");
  if (deploymentCheck?.status === "passed" && !hasKnownMatchingDeploymentSnapshots(receipt)) {
    return false;
  }
  if (deploymentChangedDuringRun(receipt)) {
    return deploymentCheck?.status === "failed"
      && deploymentCheck.observed === "deployment_changed"
      && deploymentCheck.reason === "deployment_changed_during_run";
  }
  return true;
}

function freezeDeployment(
  deployment: VerificationDeploymentIdentity | null,
): VerificationDeploymentIdentity | null {
  return deployment === null ? null : Object.freeze({ ...deployment });
}

function freezeReceipt(receipt: VerificationReceipt): VerificationReceipt {
  return Object.freeze({
    ...receipt,
    deploymentStarted: freezeDeployment(receipt.deploymentStarted),
    deployment: freezeDeployment(receipt.deployment),
    checks: Object.freeze(receipt.checks.map((check) => Object.freeze({ ...check }))),
  });
}

/**
 * Construct a receipt only after the same strict validation used for JSON input.
 * The receipt is immutable historical evidence; readiness is assessed separately.
 */
export function createVerificationReceipt(input: VerificationReceiptInput): VerificationReceipt {
  const completedAt = input.completedAt;
  if (!isIsoTime(completedAt)) throw new TypeError("Invalid verification receipt");
  const candidate: VerificationReceipt = {
    ...input,
    schemaVersion: input.schemaVersion ?? VERIFICATION_RECEIPT_SCHEMA_VERSION,
    checkVersion: input.checkVersion ?? VERIFICATION_CHECK_VERSION,
    readinessExpiresAt: input.readinessExpiresAt
      ?? new Date(Date.parse(completedAt) + VERIFICATION_READINESS_TTL_MS).toISOString(),
  };
  if (!isVerificationReceipt(candidate)) throw new TypeError("Invalid verification receipt");
  return freezeReceipt(candidate);
}

/** Returns null rather than leaking parser details into a receipt consumer. */
export function parseVerificationReceipt(value: unknown): VerificationReceipt | null {
  return isVerificationReceipt(value) ? freezeReceipt(value) : null;
}

export function createVerificationRunId(): string {
  return crypto.randomUUID();
}

/** Aggregate only the requested scope; do not reinterpret a negative journey. */
export function summarizeVerificationReceipt(receipt: VerificationReceipt): VerificationSummary {
  const required = receipt.checks.filter((check) => check.required);
  const incomplete = required.filter((check) => check.status !== "passed");
  const status: VerificationStatus = incomplete.some((check) => check.status === "failed")
    ? "failed"
    : incomplete.some((check) => check.status === "blocked")
      ? "blocked"
      : incomplete.some((check) => check.status === "skipped")
        ? "skipped"
        : "passed";
  const positiveJourneyVerified = receipt.scope === "journey"
    && receipt.scenario === "positive_login"
    && hasKnownMatchingDeploymentSnapshots(receipt)
    && REQUIRED_CHECKS.positive_login.every((name) => receipt.checks.some((check) =>
      check.name === name
      && check.required
      && check.status === "passed"
      && check.evidence === "live_observed",
    ));
  return Object.freeze({
    status,
    incomplete: incomplete.length > 0,
    positiveJourneyVerified,
    requiredChecks: Object.freeze(required.map((check) => check.name)),
    incompleteChecks: Object.freeze(incomplete.map((check) => check.name)),
  });
}

/**
 * A stale or unknown readiness result never alters the receipt's historical fact.
 * Current reuse requires both a complete run and an explicit current comparison.
 */
export function assessVerificationReceiptReadiness(
  receipt: VerificationReceipt,
  now: Date,
  current: VerificationCurrentState | null,
): VerificationReadiness {
  if (!Number.isFinite(now.getTime())) {
    return Object.freeze({ status: "unknown", reason: "current_time_invalid" });
  }
  if (Date.parse(receipt.completedAt) > now.getTime()) {
    return Object.freeze({ status: "unknown", reason: "receipt_completed_in_future" });
  }
  if (summarizeVerificationReceipt(receipt).incomplete) {
    return Object.freeze({ status: "stale", reason: "required_checks_incomplete" });
  }
  if (
    receipt.scope === "journey"
    && receipt.checks.some((check) => check.required && check.evidence !== "live_observed")
  ) {
    return Object.freeze({ status: "stale", reason: "journey_not_live_observed" });
  }
  if (now.getTime() > Date.parse(receipt.readinessExpiresAt)) {
    return Object.freeze({ status: "stale", reason: "expired" });
  }
  if (current === null) {
    return Object.freeze({ status: "unknown", reason: "current_deployment_unknown" });
  }
  if (current.environment === null) {
    return Object.freeze({ status: "unknown", reason: "current_environment_unknown" });
  }
  if (current.environment !== receipt.environment) {
    return Object.freeze({ status: "stale", reason: "environment_changed" });
  }
  if (current.origin === null || !isNormalizedVerificationOrigin(current.origin)) {
    return Object.freeze({ status: "unknown", reason: "current_origin_unknown" });
  }
  if (current.origin !== receipt.origin) {
    return Object.freeze({ status: "stale", reason: "origin_changed" });
  }
  if (current.checkVersion === null) {
    return Object.freeze({ status: "unknown", reason: "current_check_version_unknown" });
  }
  if (current.checkVersion !== receipt.checkVersion) {
    return Object.freeze({ status: "stale", reason: "check_version_changed" });
  }
  if (current.configurationChanged === true) {
    return Object.freeze({ status: "stale", reason: "configuration_changed" });
  }
  if (current.configurationChanged === null) {
    return Object.freeze({ status: "unknown", reason: "current_configuration_unknown" });
  }
  if (!receipt.deployment) {
    return Object.freeze({ status: "unknown", reason: "deployment_identity_unknown" });
  }
  if (!current.deployment) {
    return Object.freeze({ status: "unknown", reason: "current_deployment_unknown" });
  }
  const same = sameKnownDeployment(receipt.deployment, current.deployment);
  if (same === null) {
    return Object.freeze({ status: "unknown", reason: "deployment_identity_unknown" });
  }
  return same
    ? Object.freeze({ status: "current" })
    : Object.freeze({ status: "stale", reason: "deployment_changed" });
}

/** Short CLI-facing name; retains the fully descriptive export above. */
export const assessReadiness = assessVerificationReceiptReadiness;

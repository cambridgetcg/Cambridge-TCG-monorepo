/**
 * The portable, non-sensitive event envelope for the GitHub verification
 * pilot. This module is intentionally free of server/runtime imports so the
 * operator CLI and error UI can validate references without importing request
 * context machinery.
 */
import { VERIFICATION_CHECK_VERSION } from "./contract";

export const CHECK_VERSION = VERIFICATION_CHECK_VERSION;
export const VERIFICATION_ATTEMPT_KIND = "github-oauth-attempt/v1";
export const SUPPORT_ID_HEADER = "x-ctcg-auth-attempt";
// This is a server milestone only, never proof of a usable browser session.
export const AUTH_COMPLETION_HEADER = "x-ctcg-auth-completion";
export const AUTH_COMPLETION_OBSERVED = "authjs-signin-observed";
export const VERIFICATION_VERSION_HEADER = "x-ctcg-verification-version";
export const VERIFICATION_DEPLOYMENT_ID_HEADER = "x-ctcg-deployment-id";
export const VERIFICATION_SHA_HEADER = "x-ctcg-commit-sha";

export const MAX_VERIFICATION_EVENTS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_ID = /^dpl_[a-zA-Z0-9]{1,128}$/;
const COMMIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const VERIFICATION_EVENT_CODES = [
  "github_signin_started",
  "github_callback_started",
  "github_profile_verified",
  "missing_request_context",
  "invalid_proof",
  "unavailable_verified_email",
  "provider_request_failed",
  "established_link",
  "first_link_session_target_mismatch",
  "registration_paused",
  "authjs_denial",
  "authjs_signin_completed",
  "response_observed",
  "observed_completion",
] as const;

export type VerificationAttemptEventCode = typeof VERIFICATION_EVENT_CODES[number];

export const AUTHJS_ERROR_CATEGORIES = [
  "access_denied",
  "oauth_callback_error",
  "oauth_account_not_linked",
  "configuration",
  "oauth_profile_parse_error",
  "oauth_signin_error",
  "invalid_check",
  "unspecified",
] as const;

export type AuthJsErrorCategory = typeof AUTHJS_ERROR_CATEGORIES[number];

export interface VerificationAttemptEvent {
  code: VerificationAttemptEventCode;
  category?: AuthJsErrorCategory;
}

export interface VerificationAttemptSummary {
  kind: typeof VERIFICATION_ATTEMPT_KIND;
  schema_version: "1";
  verification_version: typeof CHECK_VERSION;
  provider: "github";
  phase: "signin" | "callback";
  support_id: string;
  started_at: string;
  completed_at: string;
  deployment_id?: string;
  commit_sha?: string;
  events: VerificationAttemptEvent[];
}

export function isSupportId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isSafeDeploymentId(value: unknown): value is string {
  return typeof value === "string" && DEPLOYMENT_ID.test(value);
}

export function isSafeCommitSha(value: unknown): value is string {
  return typeof value === "string" && COMMIT_SHA.test(value);
}

export function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strictly parse a log event before a CLI prints an operator explanation. */
export function parseVerificationAttemptSummary(value: unknown): VerificationAttemptSummary | null {
  const summaryKeys = new Set([
    "kind", "schema_version", "verification_version", "provider", "phase",
    "support_id", "started_at", "completed_at", "deployment_id", "commit_sha", "events",
  ]);
  if (!isRecord(value)
    || Object.keys(value).some((key) => !summaryKeys.has(key))
    || value.kind !== VERIFICATION_ATTEMPT_KIND
    || value.schema_version !== "1"
    || value.verification_version !== CHECK_VERSION
    || value.provider !== "github"
    || (value.phase !== "signin" && value.phase !== "callback")
    || !isSupportId(value.support_id)
    || !isIsoInstant(value.started_at)
    || !isIsoInstant(value.completed_at)
    || (value.deployment_id !== undefined && !isSafeDeploymentId(value.deployment_id))
    || (value.commit_sha !== undefined && !isSafeCommitSha(value.commit_sha))
    || !Array.isArray(value.events)
    || value.events.length > MAX_VERIFICATION_EVENTS) return null;

  const events: VerificationAttemptEvent[] = [];
  for (const event of value.events) {
    if (!isRecord(event)
      || Object.keys(event).some((key) => key !== "code" && key !== "category")
      || !includes(VERIFICATION_EVENT_CODES, event.code)) return null;
    if (event.category !== undefined && !includes(AUTHJS_ERROR_CATEGORIES, event.category)) return null;
    events.push(event.category === undefined
      ? { code: event.code }
      : { code: event.code, category: event.category });
  }

  return {
    kind: VERIFICATION_ATTEMPT_KIND,
    schema_version: "1",
    verification_version: CHECK_VERSION,
    provider: "github",
    phase: value.phase,
    support_id: value.support_id,
    started_at: value.started_at,
    completed_at: value.completed_at,
    ...(value.deployment_id === undefined ? {} : { deployment_id: value.deployment_id }),
    ...(value.commit_sha === undefined ? {} : { commit_sha: value.commit_sha }),
    events,
  };
}

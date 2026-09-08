import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  AUTH_COMPLETION_HEADER,
  AUTH_COMPLETION_OBSERVED,
  AUTHJS_ERROR_CATEGORIES,
  CHECK_VERSION,
  MAX_VERIFICATION_EVENTS,
  SUPPORT_ID_HEADER,
  VERIFICATION_DEPLOYMENT_ID_HEADER,
  VERIFICATION_SHA_HEADER,
  VERIFICATION_VERSION_HEADER,
  VERIFICATION_ATTEMPT_KIND,
  VERIFICATION_EVENT_CODES,
  type AuthJsErrorCategory,
  type VerificationAttemptEvent,
  type VerificationAttemptEventCode,
  type VerificationAttemptSummary,
  isSafeCommitSha,
  isSafeDeploymentId,
  isSupportId,
} from "@/lib/verification/events";

export {
  AUTHJS_ERROR_CATEGORIES,
  CHECK_VERSION as VERIFICATION_OBSERVER_CHECK_VERSION,
  SUPPORT_ID_HEADER,
  VERIFICATION_DEPLOYMENT_ID_HEADER,
  VERIFICATION_SHA_HEADER,
  VERIFICATION_VERSION_HEADER,
  VERIFICATION_ATTEMPT_KIND,
  VERIFICATION_EVENT_CODES,
  parseVerificationAttemptSummary,
} from "@/lib/verification/events";
export type {
  AuthJsErrorCategory,
  VerificationAttemptEvent,
  VerificationAttemptEventCode,
  VerificationAttemptSummary,
} from "@/lib/verification/events";

/**
 * This is deliberately a small, in-process correlation seam. Its output is
 * designed for the bounded operator CLI; it is not an account lookup API and
 * is never persisted by the application.
 */
export interface VerificationObserver {
  record(event: VerificationAttemptEvent): void;
  currentSupportId(): string | null;
  emit(summary: VerificationAttemptSummary): void;
}

type AttemptContext = {
  summary: VerificationAttemptSummary;
};

const attemptStorage = new AsyncLocalStorage<AttemptContext>();

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function safeRecord(event: VerificationAttemptEvent, observer: VerificationObserver): void {
  // The ALS store remains the source of the attempt summary even when tests or
  // a future local sink pass a separate observer implementation.
  try {
    localObserver.record(event);
  } catch {
    // Diagnostics must never change an authentication outcome.
  }
  if (observer === localObserver) return;
  try {
    observer.record(event);
  } catch {
    // Diagnostics must never change an authentication outcome.
  }
}

function safeEmit(summary: VerificationAttemptSummary, observer: VerificationObserver): void {
  try {
    observer.emit(summary);
  } catch {
    // Logs are best-effort and must not block an authentication outcome.
  }
}

const localObserver: VerificationObserver = {
  record(event) {
    const context = attemptStorage.getStore();
    if (!context || context.summary.events.length >= MAX_VERIFICATION_EVENTS) return;
    if (!includes(VERIFICATION_EVENT_CODES, event.code)) return;
    if (event.category !== undefined && !includes(AUTHJS_ERROR_CATEGORIES, event.category)) return;
    context.summary.events.push(event.category === undefined
      ? { code: event.code }
      : { code: event.code, category: event.category });
  },
  currentSupportId() {
    return attemptStorage.getStore()?.summary.support_id ?? null;
  },
  emit(summary) {
    // Keep this one structured record intentionally free of request, provider,
    // identity, credential and URL data. The operator CLI validates it again.
    console.info(JSON.stringify(summary));
  },
};

/** Returns the local observer rather than introducing a logging-service seam. */
export function getVerificationObserver(): VerificationObserver {
  return localObserver;
}

export async function withGitHubVerificationAttempt<T>(
  phase: VerificationAttemptSummary["phase"],
  operation: () => Promise<T>,
  observer: VerificationObserver = getVerificationObserver(),
): Promise<T> {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const startedAt = new Date().toISOString();
  const summary: VerificationAttemptSummary = {
    kind: VERIFICATION_ATTEMPT_KIND,
    schema_version: "1",
    verification_version: CHECK_VERSION,
    provider: "github",
    phase,
    support_id: randomUUID(),
    started_at: startedAt,
    completed_at: startedAt,
    ...(isSafeDeploymentId(deploymentId) ? { deployment_id: deploymentId } : {}),
    ...(isSafeCommitSha(commitSha) ? { commit_sha: commitSha } : {}),
    events: [],
  };

  return attemptStorage.run({ summary }, async () => {
    safeRecord({ code: phase === "signin" ? "github_signin_started" : "github_callback_started" }, observer);
    try {
      return await operation();
    } finally {
      summary.completed_at = new Date().toISOString();
      safeEmit({ ...summary, events: [...summary.events] }, observer);
    }
  });
}

export function recordGitHubVerificationEvent(code: Exclude<VerificationAttemptEventCode, "authjs_denial">): void {
  safeRecord({ code }, getVerificationObserver());
}

/** Auth.js exposes only these public error labels; all other labels stay unspecified. */
export function recordAuthJsErrorType(errorType: unknown): void {
  const categories: Record<string, AuthJsErrorCategory> = {
    AccessDenied: "access_denied",
    OAuthCallbackError: "oauth_callback_error",
    OAuthAccountNotLinked: "oauth_account_not_linked",
    Configuration: "configuration",
    OAuthProfileParseError: "oauth_profile_parse_error",
    OAuthSignInError: "oauth_signin_error",
    InvalidCheck: "invalid_check",
  };
  const key = typeof errorType === "string" ? errorType : "";
  const category = Object.hasOwn(categories, key) ? categories[key]! : "unspecified";
  safeRecord({ code: "authjs_denial", category }, getVerificationObserver());
}

/**
 * Auth.js's error responses use immutable `Response.redirect()` headers. Copy
 * the body, status, status text and every header (including separate cookies)
 * before adding only our allowlisted metadata.
 */
export function cloneGitHubAuthResponse(response: Response): Response {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers.append(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    for (const cookie of cookies) headers.append("set-cookie", cookie);
  } else {
    const cookie = response.headers.get("set-cookie");
    if (cookie) headers.append("set-cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Metadata is public only on GitHub probe/callback responses, never general auth responses. */
export function addGitHubVerificationHeaders(
  response: Response,
  options: {
    includeSupportId?: boolean;
    environment?: Pick<NodeJS.ProcessEnv, "VERCEL_DEPLOYMENT_ID" | "VERCEL_GIT_COMMIT_SHA">;
  } = {},
): Response {
  const decorated = cloneGitHubAuthResponse(response);
  const environment = options.environment ?? process.env;
  try {
    const headers = decorated.headers;
    // Never inherit a forged or stale assertion in this module's header namespace.
    for (const name of [VERIFICATION_DEPLOYMENT_ID_HEADER, VERIFICATION_SHA_HEADER, SUPPORT_ID_HEADER, AUTH_COMPLETION_HEADER]) {
      headers.delete(name);
    }
    headers.set(VERIFICATION_VERSION_HEADER, CHECK_VERSION);
    const deploymentId = environment.VERCEL_DEPLOYMENT_ID?.trim();
    const sha = environment.VERCEL_GIT_COMMIT_SHA?.trim();
    if (isSafeDeploymentId(deploymentId)) headers.set(VERIFICATION_DEPLOYMENT_ID_HEADER, deploymentId);
    if (isSafeCommitSha(sha)) headers.set(VERIFICATION_SHA_HEADER, sha);
    const supportId = options.includeSupportId ? getVerificationObserver().currentSupportId() : null;
    if (isSupportId(supportId)) headers.set(SUPPORT_ID_HEADER, supportId);
    const attempt = attemptStorage.getStore()?.summary;
    if (options.includeSupportId && attempt?.phase === "callback"
      && attempt.events.some(event => event.code === "authjs_signin_completed")) {
      headers.set(AUTH_COMPLETION_HEADER, AUTH_COMPLETION_OBSERVED);
    }
  } catch {
    // The cloned response still preserves Auth.js's original result.
  }
  return decorated;
}

/**
 * Add a correlation reference only to Auth.js's own local, error-bearing login
 * redirects. Parsing is local validation; no location, query, or error value is
 * included in the record.
 */
export function addSupportIdToGitHubFailureRedirect(request: Request, response: Response): Response {
  const decorated = cloneGitHubAuthResponse(response);
  const supportId = getVerificationObserver().currentSupportId();
  const location = decorated.headers.get("location");
  if (!isSupportId(supportId) || !location) return decorated;

  try {
    const target = new URL(location, request.url);
    const requestOrigin = new URL(request.url).origin;
    const isLoginError = (target.pathname === "/login" || target.pathname === "/login/error")
      && target.searchParams.has("error")
      && [...target.searchParams.keys()].every((key) => key === "error");
    if (target.origin !== requestOrigin || !isLoginError) return decorated;
    target.searchParams.set("support", supportId);
    decorated.headers.set("location", target.toString());
  } catch {
    // Invalid redirects retain Auth.js's original result on the mutable copy.
  }
  return decorated;
}

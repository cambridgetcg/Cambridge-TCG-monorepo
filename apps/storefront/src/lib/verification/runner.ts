import {
  createVerificationReceipt,
  createVerificationRunId,
  summarizeVerificationReceipt,
  type VerificationCheck,
  type VerificationDeploymentIdentity,
  type VerificationEnvironment,
  type VerificationReceipt,
  type VerificationReason,
  type VerificationScenario,
} from "./contract";
import {
  CHECK_VERSION,
  parseVerificationAttemptSummary,
  type VerificationAttemptSummary,
} from "./events";

export const AUTH_VERIFY_MAX_BODY_BYTES = 64 * 1024;
export const AUTH_VERIFY_HTTP_TIMEOUT_MS = 10_000;
export const AUTH_VERIFY_SUBPROCESS_TIMEOUT_MS = 15_000;
export const AUTH_VERIFY_SUBPROCESS_MAX_BUFFER = 64 * 1024;

export type AuthVerifyMode = "preflight" | "journey" | "explain";
export type AuthVerifyStaticCode =
  | "config_missing_base"
  | "config_invalid_base"
  | "config_origin_not_approved"
  | "config_production_acknowledgement_required"
  | "config_fixture_required"
  | "config_fixture_not_approved"
  | "deployment_identity_unavailable"
  | "deployment_not_ready"
  | "configuration_newer_than_deployment"
  | "config_attempt_required"
  | "config_unknown_argument"
  | "config_invalid_argument"
  | "tool_unavailable"
  | "tool_timeout"
  | "tool_output_invalid"
  | "tool_limit_reached"
  | "attempt_not_found"
  | "attempt_evidence_delayed"
  | "verification_internal_error";

export class AuthVerifyInputError extends Error {
  constructor(readonly code: AuthVerifyStaticCode) {
    super(code);
    this.name = "AuthVerifyInputError";
  }
}

export interface AuthVerifyOptions {
  readonly provider: "github";
  readonly mode: AuthVerifyMode;
  readonly base: string;
  readonly json: boolean;
  readonly receiptPath?: string;
  readonly probeRedirect: boolean;
  readonly vercelMetadata: boolean;
  readonly allowProduction: boolean;
  readonly fixturePath?: string;
  readonly allowTestAccountEffects: boolean;
  readonly attempt?: string;
  /** A reviewed statement, not an assertion automatically inferred from GitHub. */
  readonly operatorDeclaredGitHubApp: boolean;
}

export interface GitHubVerificationDescriptorForRunner {
  readonly providerId: "github";
  readonly callbackPath: string;
  readonly minimumScopes: readonly string[];
  readonly expectedAuthorizationEndpoint: string;
  readonly productionOrigins: readonly string[];
  readonly approvedStagingOrigins: readonly string[];
  readonly vercel?: Readonly<{
    projectId: string;
    projectName: string;
    teamId: string;
    target: "preview" | "production";
  }>;
}

export interface VercelMetadataObservation extends VerificationDeploymentIdentity {
  readonly target: "preview" | "production";
  readonly configurationFreshness: "current" | "newer_than_deployment";
}

export interface AuthVerifyFixture {
  readonly origin: string;
  readonly environment: "staging";
  readonly scenario: "positive_login" | "expected_denial";
  /** Public Auth.js result only; never an asserted internal policy reason. */
  readonly expectedPublicErrorCode?: "access_denied";
  readonly dedicatedTestData: true;
  /** Used only by the browser runner; never included in an error, receipt, or output. */
  readonly expectedCtcgUserId: string;
  readonly protectedSurfacePath?: string;
}

export interface SafeHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Ephemeral response cookies for a same-origin CSRF continuation; never output. */
  readonly setCookies?: readonly string[];
  readonly body: string;
}

export interface SafeHttpRequest {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly redirect: "manual" | "error";
  readonly timeoutMs: number;
}

export interface AuthVerifyDependencies {
  readonly request: (request: SafeHttpRequest) => Promise<SafeHttpResponse>;
  readonly now?: () => Date;
  /** Tests must opt into live evidence explicitly; injected runners default mocked. */
  readonly journeyEvidence?: "mocked" | "live_observed";
  readonly runJourney?: (fixture: AuthVerifyFixture) => Promise<{
    callbackObserved: boolean;
    callbackSucceeded: boolean;
    baselineSessionState: "anonymous" | "authenticated" | "unknown" | "not_observed";
    resultingSessionState: "anonymous" | "authenticated" | "unknown" | "not_observed";
    finalSessionState: "anonymous" | "authenticated" | "unknown" | "not_observed";
    anonymousBaseline: boolean;
    expectedDenialObserved: boolean;
    identityMatchesExpected: boolean;
    sessionEstablished: boolean;
    logoutConfirmed: boolean;
    outcome: "completed" | "cancelled" | "timed_out" | "failed";
  }>;
  readonly readFixture?: (path: string) => Promise<unknown>;
  /** CLI metadata only: fixed project/team target, deployment ID, SHA, and configuration freshness. */
  readonly readVercelMetadata?: (descriptor: GitHubVerificationDescriptorForRunner, origin: string) => Promise<VercelMetadataObservation | null>;
  readonly readVercelLogs?: (descriptor: GitHubVerificationDescriptorForRunner, origin: string, supportId: string) => Promise<readonly unknown[]>;
}

const CHECK_EXPECTED = {
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
} as const;

type CheckName = keyof typeof CHECK_EXPECTED;

function check(
  name: CheckName,
  status: VerificationCheck["status"],
  evidence: VerificationCheck["evidence"],
  observed: VerificationCheck["observed"],
  reason?: VerificationCheck["reason"],
): VerificationCheck {
  return Object.freeze({
    name,
    required: true,
    status,
    evidence,
    expected: CHECK_EXPECTED[name],
    observed,
    ...(reason === undefined ? {} : { reason }),
  });
}

function nowIso(dependencies: AuthVerifyDependencies): string {
  return (dependencies.now?.() ?? new Date()).toISOString();
}

function canonicalOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function matchingOrigin(origin: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => canonicalOrigin(candidate) === origin);
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function environmentForOrigin(
  origin: string,
  descriptor: GitHubVerificationDescriptorForRunner,
): VerificationEnvironment | null {
  if (matchingOrigin(origin, descriptor.productionOrigins)) return "production";
  if (matchingOrigin(origin, descriptor.approvedStagingOrigins)) return "staging";
  // Loopback preflight is an explicit local probe surface only. It does not add
  // a journey fixture approval, deployment identity, or production equivalence.
  if (isLoopbackOrigin(origin)) return "staging";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scopesMatch(value: unknown, expected: readonly string[]): boolean {
  const actual = typeof value === "string" ? value.split(/[\s+]+/).filter(Boolean) : [];
  return actual.length === expected.length && actual.every((scope) => expected.includes(scope));
}

function safeJson(body: string): unknown | null {
  if (body.length > AUTH_VERIFY_MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function deploymentFromHeaders(response: SafeHttpResponse, at: string): VerificationDeploymentIdentity | null {
  const id = response.headers["x-ctcg-deployment-id"];
  const sha = response.headers["x-ctcg-commit-sha"];
  if ((id !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    || (sha !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha))) return null;
  if (!id && !sha) return null;
  return Object.freeze({ id: id ?? null, sha: sha?.toLowerCase() ?? null, observedAt: at });
}

function metadataVersionMatches(response: SafeHttpResponse): boolean {
  return response.headers["x-ctcg-verification-version"] === CHECK_VERSION;
}

function staticBlocked(name: CheckName, reason: VerificationCheck["reason"]): VerificationCheck {
  return check(name, "blocked", "not_observed", "not_observed", reason);
}

const FORWARDABLE_TOOL_REASONS = new Set<VerificationReason>([
  "deployment_not_ready",
  "configuration_newer_than_deployment",
  "tool_unavailable",
  "tool_timeout",
  "tool_output_invalid",
  "tool_limit_reached",
]);

function failureReasonForTool(error: unknown): VerificationReason {
  if (error instanceof AuthVerifyInputError && FORWARDABLE_TOOL_REASONS.has(error.code as VerificationReason)) {
    return error.code as VerificationReason;
  }
  throw error instanceof AuthVerifyInputError
    ? error
    : new AuthVerifyInputError("verification_internal_error");
}

function parseFixture(value: unknown): AuthVerifyFixture | null {
  const record = asRecord(value);
  if (!record || Object.keys(record).some((key) => ![
    "origin", "environment", "scenario", "expectedPublicErrorCode", "dedicatedTestData", "expectedCtcgUserId", "protectedSurfacePath",
  ].includes(key))) return null;
  const validExpectedPublicErrorCode = record.expectedPublicErrorCode === "access_denied";
  if (typeof record.origin !== "string" || record.environment !== "staging"
    || (record.scenario !== "positive_login" && record.scenario !== "expected_denial")
    || (record.scenario === "expected_denial" && !validExpectedPublicErrorCode)
    || (record.scenario === "positive_login" && record.expectedPublicErrorCode !== undefined)
    || record.dedicatedTestData !== true || typeof record.expectedCtcgUserId !== "string"
    || record.expectedCtcgUserId.length < 1 || record.expectedCtcgUserId.length > 256
    || (record.protectedSurfacePath !== undefined && (typeof record.protectedSurfacePath !== "string"
      || !/^\/[A-Za-z0-9/_-]{0,200}$/.test(record.protectedSurfacePath)))) return null;
  const expectedPublicErrorCode = validExpectedPublicErrorCode
    ? record.expectedPublicErrorCode as AuthVerifyFixture["expectedPublicErrorCode"]
    : undefined;
  return Object.freeze({
    origin: record.origin,
    environment: "staging",
    scenario: record.scenario,
    ...(expectedPublicErrorCode === undefined ? {} : { expectedPublicErrorCode }),
    dedicatedTestData: true,
    expectedCtcgUserId: record.expectedCtcgUserId,
    ...(record.protectedSurfacePath === undefined ? {} : { protectedSurfacePath: record.protectedSurfacePath }),
  });
}

export function parseAuthVerifyArguments(argv: readonly string[]): AuthVerifyOptions {
  const parsed: {
    provider?: string; mode?: string; base?: string; json: boolean; receiptPath?: string;
    probeRedirect: boolean; vercelMetadata: boolean; allowProduction: boolean; fixturePath?: string;
    allowTestAccountEffects: boolean; attempt?: string; operatorDeclaredGitHubApp: boolean;
  } = {
    json: false, probeRedirect: false, vercelMetadata: false, allowProduction: false,
    allowTestAccountEffects: false, operatorDeclaredGitHubApp: false,
  };
  const flagsWithValue = new Set(["--mode", "--base", "--receipt", "--fixture", "--attempt"]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (flagsWithValue.has(value)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new AuthVerifyInputError("config_invalid_argument");
      if (value === "--mode") parsed.mode = next;
      if (value === "--base") parsed.base = next;
      if (value === "--receipt") parsed.receiptPath = next;
      if (value === "--fixture") parsed.fixturePath = next;
      if (value === "--attempt") parsed.attempt = next;
      index += 1;
      continue;
    }
    if (value === "--json") parsed.json = true;
    else if (value === "--probe-redirect") parsed.probeRedirect = true;
    else if (value === "--vercel-metadata") parsed.vercelMetadata = true;
    else if (value === "--allow-production") parsed.allowProduction = true;
    else if (value === "--allow-test-account-effects") parsed.allowTestAccountEffects = true;
    else if (value === "--operator-declared-github-app") parsed.operatorDeclaredGitHubApp = true;
    else if (parsed.provider === undefined) parsed.provider = value;
    else throw new AuthVerifyInputError("config_unknown_argument");
  }
  if (parsed.provider !== "github") throw new AuthVerifyInputError("config_invalid_argument");
  if (parsed.mode !== "preflight" && parsed.mode !== "journey" && parsed.mode !== "explain") {
    throw new AuthVerifyInputError("config_invalid_argument");
  }
  if (!parsed.base) throw new AuthVerifyInputError("config_missing_base");
  if (!canonicalOrigin(parsed.base)) throw new AuthVerifyInputError("config_invalid_base");
  if (parsed.mode === "journey" && (!parsed.fixturePath || !parsed.allowTestAccountEffects)) {
    throw new AuthVerifyInputError("config_fixture_required");
  }
  if (parsed.mode === "explain" && !parsed.attempt) throw new AuthVerifyInputError("config_attempt_required");
  return Object.freeze({
    provider: "github", mode: parsed.mode, base: parsed.base, json: parsed.json,
    ...(parsed.receiptPath === undefined ? {} : { receiptPath: parsed.receiptPath }),
    probeRedirect: parsed.probeRedirect, vercelMetadata: parsed.vercelMetadata,
    allowProduction: parsed.allowProduction,
    ...(parsed.fixturePath === undefined ? {} : { fixturePath: parsed.fixturePath }),
    allowTestAccountEffects: parsed.allowTestAccountEffects,
    ...(parsed.attempt === undefined ? {} : { attempt: parsed.attempt }),
    operatorDeclaredGitHubApp: parsed.operatorDeclaredGitHubApp,
  });
}

function receipt(input: {
  readonly scope: "preflight" | "journey" | "explain";
  readonly scenario: VerificationScenario;
  readonly environment: VerificationEnvironment;
  readonly origin: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly deploymentStarted: VerificationDeploymentIdentity | null;
  readonly deployment: VerificationDeploymentIdentity | null;
  readonly checks: readonly VerificationCheck[];
}): VerificationReceipt {
  return createVerificationReceipt({
    provider: "github", scope: input.scope, scenario: input.scenario,
    runId: createVerificationRunId(), environment: input.environment, origin: input.origin,
    startedAt: input.startedAt, completedAt: input.completedAt,
    deploymentStarted: input.deploymentStarted, deployment: input.deployment,
    checks: input.checks,
  });
}

function ephemeralCookieHeader(cookies: readonly string[] | undefined): string | null {
  if (!cookies || cookies.length < 1 || cookies.length > 8) return null;
  const pairs = cookies.map((cookie) => cookie.split(";", 1)[0]?.trim() ?? "");
  if (pairs.some((pair) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}=[^;\r\n]{0,1024}$/.test(pair))) return null;
  const header = pairs.join("; ");
  return header.length <= 4096 ? header : null;
}

interface RedirectProbeResult {
  readonly authorization: VerificationCheck;
  readonly scopes: VerificationCheck;
}

async function probeRedirect(
  origin: string,
  descriptor: GitHubVerificationDescriptorForRunner,
  dependencies: AuthVerifyDependencies,
): Promise<RedirectProbeResult> {
  try {
    const csrf = await dependencies.request({
      method: "GET", url: `${origin}/api/auth/csrf`, redirect: "error", timeoutMs: AUTH_VERIFY_HTTP_TIMEOUT_MS,
    });
    const parsed = safeJson(csrf.body);
    const record = asRecord(parsed);
    const token = record && typeof record.csrfToken === "string" && record.csrfToken.length <= 2048
      ? record.csrfToken : null;
    const cookie = ephemeralCookieHeader(csrf.setCookies);
    if (!token || !cookie) return {
      authorization: check("authorization_request", "failed", "not_observed", "authorization_request_mismatch", "tool_output_invalid"),
      scopes: staticBlocked("requested_scopes", "tool_output_invalid"),
    };
    const response = await dependencies.request({
      method: "POST", url: `${origin}/api/auth/signin/github`, redirect: "manual", timeoutMs: AUTH_VERIFY_HTTP_TIMEOUT_MS,
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ csrfToken: token, callbackUrl: "/" }).toString(),
    });
    const location = response.headers.location;
    if (response.status < 300 || response.status > 399 || !location || location.length > 4096) {
      return {
        authorization: check("authorization_request", "failed", "not_observed", "authorization_request_mismatch", "redirect_authorization_endpoint_mismatch"),
        scopes: staticBlocked("requested_scopes", "tool_output_invalid"),
      };
    }
    const authorization = new URL(location);
    const expectedEndpoint = new URL(descriptor.expectedAuthorizationEndpoint);
    const scopes = authorization.searchParams.get("scope");
    const redirectUri = authorization.searchParams.get("redirect_uri");
    const callback = `${origin}${descriptor.callbackPath}`;
    const endpointMatches = authorization.origin === expectedEndpoint.origin
      && authorization.pathname === expectedEndpoint.pathname;
    if (!endpointMatches) return {
      authorization: check("authorization_request", "failed", "live_observed", "authorization_request_mismatch", "redirect_authorization_endpoint_mismatch"),
      scopes: staticBlocked("requested_scopes", "tool_output_invalid"),
    };
    return {
      authorization: redirectUri === callback
        ? check("authorization_request", "passed", "live_observed", "authorization_request_matches")
        : check("authorization_request", "failed", "live_observed", "authorization_request_mismatch", "redirect_callback_mismatch"),
      scopes: scopesMatch(scopes, descriptor.minimumScopes)
        ? check("requested_scopes", "passed", "live_observed", "scopes_match")
        : check("requested_scopes", "failed", "live_observed", "scopes_mismatch", "discovery_scope_mismatch"),
    };
  } catch {
    return {
      authorization: staticBlocked("authorization_request", "tool_unavailable"),
      scopes: staticBlocked("requested_scopes", "tool_unavailable"),
    };
  }
}

export async function runPreflight(
  options: AuthVerifyOptions,
  descriptor: GitHubVerificationDescriptorForRunner,
  dependencies: AuthVerifyDependencies,
): Promise<VerificationReceipt> {
  const origin = canonicalOrigin(options.base);
  if (!origin) throw new AuthVerifyInputError("config_invalid_base");
  const environment = environmentForOrigin(origin, descriptor);
  if (!environment) throw new AuthVerifyInputError("config_origin_not_approved");
  if (environment === "production" && !options.allowProduction) {
    throw new AuthVerifyInputError("config_production_acknowledgement_required");
  }
  const startedAt = nowIso(dependencies);
  let providers: SafeHttpResponse | null = null;
  try {
    providers = await dependencies.request({
      method: "GET", url: `${origin}/api/auth/providers`, redirect: "error", timeoutMs: AUTH_VERIFY_HTTP_TIMEOUT_MS,
    });
  } catch {
    // The three discovery checks below record the bounded absence independently.
  }
  const data = providers ? asRecord(safeJson(providers.body)) : null;
  const github = data ? asRecord(data.github) : null;
  const discovered = github?.id === "github";
  const versionMatches = providers !== null && metadataVersionMatches(providers);
  const deploymentStarted = providers ? deploymentFromHeaders(providers, nowIso(dependencies)) : null;
  const redirectProbe = options.probeRedirect
    ? await probeRedirect(origin, descriptor, dependencies)
    : null;
  const checks: VerificationCheck[] = [
    options.operatorDeclaredGitHubApp
      ? check("configuration", "passed", "operator_declared", "configured")
      : staticBlocked("configuration", "operator_declaration_required"),
    discovered
      ? check("provider_discovery", "passed", "live_observed", "provider_discovered")
      : staticBlocked("provider_discovery", "discovery_provider_missing"),
    // Auth.js provider discovery does not disclose scopes; only the explicit redirect probe can observe them.
    redirectProbe?.scopes ?? staticBlocked("requested_scopes", "authorization_probe_not_requested"),
    redirectProbe?.authorization ?? staticBlocked("authorization_request", "authorization_probe_not_requested"),
    deploymentStarted && versionMatches
      ? check("deployment_identity", "passed", "live_observed", "deployment_current")
      : staticBlocked("deployment_identity", "deployment_identity_unavailable"),
    options.operatorDeclaredGitHubApp
      ? check("operator_declaration", "passed", "operator_declared", "declared")
      : staticBlocked("operator_declaration", "operator_declaration_required"),
  ];
  let deployment = deploymentStarted;
  if (options.vercelMetadata) {
    if (!dependencies.readVercelMetadata || !descriptor.vercel) {
      checks[4] = staticBlocked("deployment_identity", "tool_unavailable");
      deployment = null;
    } else {
      try {
        const metadata = await dependencies.readVercelMetadata(descriptor, origin);
        deployment = metadata === null ? null : Object.freeze({
          id: metadata.id,
          sha: metadata.sha,
          observedAt: metadata.observedAt,
        });
        checks[4] = metadata?.configurationFreshness === "newer_than_deployment"
          ? staticBlocked("deployment_identity", "configuration_newer_than_deployment")
          : deployment
            ? check("deployment_identity", "passed", "live_observed", "deployment_current")
            : staticBlocked("deployment_identity", "deployment_identity_unavailable");
      } catch (error) {
        checks[4] = staticBlocked("deployment_identity", failureReasonForTool(error));
        deployment = null;
      }
    }
  }
  if (!options.vercelMetadata) {
    try {
      const end = await dependencies.request({
        method: "GET", url: `${origin}/api/auth/providers`, redirect: "error", timeoutMs: AUTH_VERIFY_HTTP_TIMEOUT_MS,
      });
      deployment = metadataVersionMatches(end) ? deploymentFromHeaders(end, nowIso(dependencies)) : null;
      const changed = deploymentStarted && deployment
        && (deploymentStarted.id !== deployment.id || deploymentStarted.sha !== deployment.sha);
      checks[4] = changed
        ? check("deployment_identity", "failed", "live_observed", "deployment_changed", "deployment_changed_during_run")
        : deploymentStarted && deployment
          ? check("deployment_identity", "passed", "live_observed", "deployment_current")
          : staticBlocked("deployment_identity", "deployment_identity_unavailable");
    } catch {
      deployment = null;
      checks[4] = staticBlocked("deployment_identity", "tool_unavailable");
    }
  }
  // Both metadata sources must agree with the runtime check version and the
  // observed starting deployment; a control-plane read is not a substitute for
  // either boundary, and a change must yield evidence rather than a parser error.
  if (deploymentStarted && deployment
    && (deploymentStarted.id !== deployment.id || deploymentStarted.sha !== deployment.sha)) {
    checks[4] = check("deployment_identity", "failed", "live_observed", "deployment_changed", "deployment_changed_during_run");
  } else if (checks[4].status === "passed" && (!versionMatches || !deploymentStarted || !deployment)) {
    checks[4] = staticBlocked("deployment_identity", "deployment_identity_unavailable");
  }
  return receipt({
    scope: "preflight", scenario: "configuration_review", environment, origin,
    startedAt, completedAt: nowIso(dependencies), deploymentStarted, deployment, checks,
  });
}

export async function runJourney(
  options: AuthVerifyOptions,
  descriptor: GitHubVerificationDescriptorForRunner,
  dependencies: AuthVerifyDependencies,
): Promise<VerificationReceipt> {
  if (!options.fixturePath || !options.allowTestAccountEffects || !dependencies.readFixture || !dependencies.runJourney) {
    throw new AuthVerifyInputError("config_fixture_required");
  }
  const origin = canonicalOrigin(options.base);
  if (!origin || environmentForOrigin(origin, descriptor) !== "staging") {
    throw new AuthVerifyInputError("config_origin_not_approved");
  }
  let fixture: AuthVerifyFixture | null = null;
  try {
    fixture = parseFixture(await dependencies.readFixture(options.fixturePath));
  } catch {
    throw new AuthVerifyInputError("config_fixture_not_approved");
  }
  if (!fixture || canonicalOrigin(fixture.origin) !== origin || !matchingOrigin(origin, descriptor.approvedStagingOrigins)) {
    throw new AuthVerifyInputError("config_fixture_not_approved");
  }
  // Start the bounded run before observing the initial deployment snapshot.
  const startedAt = nowIso(dependencies);
  // A staging-looking public hostname is not sufficient: an authenticated Vercel
  // metadata read must identify the fixed project's preview target. Loopback is
  // permitted only for an explicit local fixture with dedicated test data.
  let deploymentStarted: VerificationDeploymentIdentity | null = null;
  let deployment: VerificationDeploymentIdentity | null = null;
  if (!isLoopbackOrigin(origin)) {
    if (!dependencies.readVercelMetadata || !descriptor.vercel || descriptor.vercel.target !== "preview") {
      throw new AuthVerifyInputError("deployment_identity_unavailable");
    }
    let metadata: VercelMetadataObservation | null = null;
    try {
      metadata = await dependencies.readVercelMetadata(descriptor, origin);
    } catch (error) {
      throw new AuthVerifyInputError(failureReasonForTool(error) as AuthVerifyStaticCode);
    }
    if (!metadata || metadata.target !== "preview") {
      throw new AuthVerifyInputError("deployment_identity_unavailable");
    }
    if (metadata.configurationFreshness === "newer_than_deployment") {
      throw new AuthVerifyInputError("configuration_newer_than_deployment");
    }
    deploymentStarted = Object.freeze({ id: metadata.id, sha: metadata.sha, observedAt: metadata.observedAt });
  }
  const result = await dependencies.runJourney(fixture);
  let endingMetadataReason: VerificationReason | null = null;
  if (deploymentStarted && dependencies.readVercelMetadata) {
    try {
      const metadata = await dependencies.readVercelMetadata(descriptor, origin);
      if (metadata?.target === "preview") {
        deployment = Object.freeze({ id: metadata.id, sha: metadata.sha, observedAt: metadata.observedAt });
        if (metadata.configurationFreshness === "newer_than_deployment") {
          endingMetadataReason = "configuration_newer_than_deployment";
        }
      }
    } catch (error) {
      endingMetadataReason = failureReasonForTool(error);
      deployment = null;
    }
  }
  const live = dependencies.journeyEvidence ?? "mocked";
  const nonObservation = "not_observed" as const;
  const unavailableReason = (state: typeof result.resultingSessionState) =>
    state === "not_observed" ? "tool_timeout" as const : "tool_output_invalid" as const;
  const baselineCheck = result.baselineSessionState === "anonymous" && result.anonymousBaseline
    ? check("anonymous_baseline", "passed", live, "anonymous_session")
    : result.baselineSessionState === "authenticated"
      ? check("anonymous_baseline", "failed", live, "session_present", "session_anonymous_baseline_missing")
      : staticBlocked("anonymous_baseline", unavailableReason(result.baselineSessionState));
  const checks: VerificationCheck[] = [
    baselineCheck,
    (fixture.scenario === "positive_login" ? result.callbackSucceeded : result.callbackObserved)
      ? check("provider_callback", "passed", live, "callback_observed")
      : staticBlocked("provider_callback", result.callbackObserved || result.outcome === "failed"
        ? "tool_output_invalid"
        : result.outcome === "cancelled" ? "cancelled_by_operator" : "tool_timeout"),
  ];
  if (fixture.scenario === "positive_login") {
    checks.push(
      result.identityMatchesExpected
        ? check("identity", "passed", live, "identity_matches_expected")
        : result.resultingSessionState === "authenticated"
          ? check("identity", "failed", live, "identity_mismatch", "session_identity_mismatch")
          : staticBlocked("identity", result.resultingSessionState === "anonymous"
            ? "session_not_established"
            : unavailableReason(result.resultingSessionState)),
      result.sessionEstablished && result.resultingSessionState === "authenticated"
        ? check("session", "passed", live, "session_established")
        : staticBlocked("session", result.resultingSessionState === "anonymous"
          ? "session_not_established"
          : unavailableReason(result.resultingSessionState)),
    );
  } else {
    checks.push(result.expectedDenialObserved
      ? check("expected_denial", "passed", live, "denial_observed")
      : result.resultingSessionState === "unknown" || result.resultingSessionState === "not_observed"
        ? staticBlocked("expected_denial", unavailableReason(result.resultingSessionState))
        : check("expected_denial", "failed", nonObservation, "denial_not_observed", "tool_output_invalid"));
  }
  checks.push(result.logoutConfirmed && result.finalSessionState === "anonymous"
    ? check("logout", "passed", live, "session_ended")
    : result.finalSessionState === "authenticated"
      ? check("logout", "blocked", live, "session_still_present", "logout_session_still_present")
      : staticBlocked("logout", result.finalSessionState === "unknown"
        ? "tool_output_invalid"
        : result.resultingSessionState === "authenticated" && !result.identityMatchesExpected
          ? "session_identity_mismatch"
          : result.resultingSessionState === "anonymous"
            ? "session_not_established"
            : "tool_timeout"));
  const deploymentChanged = deploymentStarted !== null && deployment !== null
    && (deploymentStarted.id !== deployment.id || deploymentStarted.sha !== deployment.sha);
  const deploymentCheck = deploymentChanged
    ? check("deployment_identity", "failed", "live_observed", "deployment_changed", "deployment_changed_during_run")
    : endingMetadataReason
      ? staticBlocked("deployment_identity", endingMetadataReason)
      : deploymentStarted && deployment
        ? check("deployment_identity", "passed", "live_observed", "deployment_current")
        : staticBlocked("deployment_identity", "deployment_identity_unavailable");
  checks.unshift(deploymentCheck);
  return receipt({
    scope: "journey", scenario: fixture.scenario, environment: "staging", origin, startedAt,
    completedAt: nowIso(dependencies), deploymentStarted, deployment, checks,
  });
}

const REMEDIATION: Readonly<Record<VerificationAttemptSummary["events"][number]["code"], string>> = {
  github_signin_started: "Retry only after checking the configured GitHub OAuth App declaration.",
  github_callback_started: "Compare the observed deployment and registered callback through the operator declaration.",
  github_profile_verified: "Review the verified-email and stable-ID policy in the authenticated operator path.",
  missing_request_context: "Check the GitHub callback route integration on the selected deployment.",
  invalid_proof: "Review the provider proof failure with the account owner; do not replay the authorization response.",
  unavailable_verified_email: "Use a GitHub account with a verified email or preserve the existing account-link policy.",
  provider_request_failed: "Wait for provider availability and start a new intentional attempt; do not retry a callback.",
  established_link: "Review the existing linked identity through the authenticated operator workflow.",
  first_link_session_target_mismatch: "Sign out and use the intended existing account before linking a different GitHub identity.",
  registration_paused: "Registration remains paused; use the existing admission path rather than provisioning an account.",
  authjs_denial: "Review the static Auth.js category and the selected deployment configuration.",
  authjs_signin_completed: "A sign-in event alone is not a session proof; run a dedicated fixture journey if authorized.",
  response_observed: "A callback response was observed; verify the resulting session separately in a dedicated fixture journey.",
  observed_completion: "A callback completed; verify the resulting session separately in a dedicated fixture journey.",
};

/**
 * Revalidates a structured Vercel envelope before accepting its event. A support
 * ID alone is never authority to read another deployment, target, or route.
 */
export function matchingAttemptFromStructuredLogs(
  entries: readonly unknown[],
  supportId: string,
  expected: Readonly<{ project: string; target: "preview" | "production"; origin: string }>,
): VerificationAttemptSummary | null {
  const matches = new Map<string, VerificationAttemptSummary>();
  const allowedKeys = ["project", "target", "path_class", "origin", "deployment_id", "commit_sha", "event"];
  for (const entry of entries.slice(0, 200)) {
    const envelope = asRecord(entry);
    if (!envelope
      || Object.keys(envelope).length !== allowedKeys.length
      || Object.keys(envelope).some((key) => !allowedKeys.includes(key))
      || envelope.project !== expected.project
      || envelope.target !== expected.target
      || envelope.path_class !== "github_auth"
      || envelope.origin !== expected.origin) continue;
    const deploymentId = typeof envelope.deployment_id === "string" ? envelope.deployment_id : null;
    const commitSha = typeof envelope.commit_sha === "string" ? envelope.commit_sha.toLowerCase() : null;
    const parsed = parseVerificationAttemptSummary(envelope.event);
    if (!parsed || parsed.support_id !== supportId || !deploymentId || !commitSha
      || parsed.deployment_id !== deploymentId || parsed.commit_sha?.toLowerCase() !== commitSha) continue;
    matches.set(JSON.stringify(parsed), parsed);
  }
  return matches.size === 1 ? [...matches.values()][0]! : null;
}

export async function runExplain(
  options: AuthVerifyOptions,
  descriptor: GitHubVerificationDescriptorForRunner,
  dependencies: AuthVerifyDependencies,
): Promise<{ readonly receipt: VerificationReceipt; readonly remediations: readonly string[] }> {
  if (!options.attempt || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.attempt)) {
    throw new AuthVerifyInputError("config_attempt_required");
  }
  const origin = canonicalOrigin(options.base);
  const environment = origin ? environmentForOrigin(origin, descriptor) : null;
  if (!environment) throw new AuthVerifyInputError("config_origin_not_approved");
  if (environment === "production" && !options.allowProduction) {
    throw new AuthVerifyInputError("config_production_acknowledgement_required");
  }
  const startedAt = nowIso(dependencies);
  let summary: VerificationAttemptSummary | null = null;
  let explanationFailure: VerificationReason | null = null;
  try {
    summary = dependencies.readVercelLogs && descriptor.vercel
      ? matchingAttemptFromStructuredLogs(
        await dependencies.readVercelLogs(descriptor, origin!, options.attempt),
        options.attempt,
        { project: descriptor.vercel.projectId, target: descriptor.vercel.target, origin: origin! },
      )
      : null;
  } catch (error) {
    explanationFailure = failureReasonForTool(error);
  }
  const explanation = summary
    ? check("attempt_explanation", "passed", "live_observed", "explanation_matched")
    : staticBlocked("attempt_explanation", explanationFailure
      ?? (dependencies.readVercelLogs && descriptor.vercel ? "attempt_not_found" : "tool_unavailable"));
  const result = receipt({
    scope: "explain", scenario: "attempt_explanation", environment, origin: origin!, startedAt,
    completedAt: nowIso(dependencies), deploymentStarted: null, deployment: null, checks: [explanation],
  });
  const remediations = summary
    ? Object.freeze([...new Set(summary.events.map((event) => REMEDIATION[event.code]))])
    : Object.freeze([]);
  return Object.freeze({ receipt: result, remediations });
}

export function formatVerificationReceipt(receipt: VerificationReceipt): string {
  const summary = summarizeVerificationReceipt(receipt);
  return [
    `GitHub verification ${receipt.scope}: ${summary.status.toUpperCase()}`,
    `scenario: ${receipt.scenario}`,
    ...receipt.checks.map((item) => `- ${item.status.toUpperCase()} ${item.name}: ${item.observed}${item.reason ? ` (${item.reason})` : ""}`),
    summary.positiveJourneyVerified ? "positive journey: verified" : "positive journey: not established",
  ].join("\n");
}

export function staticFailureStatus(code: AuthVerifyStaticCode): "blocked" | "failed" {
  return code === "verification_internal_error" ? "failed" : "blocked";
}

export function formatStaticFailure(code: AuthVerifyStaticCode): string {
  return `GitHub verification: ${staticFailureStatus(code).toUpperCase()}\n- ${code}`;
}

import { describe, expect, it } from "vitest";
import {
  VERIFICATION_CHECK_VERSION,
  VERIFICATION_RECEIPT_SCHEMA_VERSION,
  VERIFICATION_READINESS_TTL_MS,
  assessVerificationReceiptReadiness,
  createVerificationReceipt,
  createVerificationRunId,
  isNormalizedVerificationOrigin,
  parseVerificationReceipt,
  summarizeVerificationReceipt,
  type VerificationCheck,
  type VerificationReceiptInput,
} from "./contract";

const STARTED_AT = "2026-09-07T12:00:00.000Z";
const COMPLETED_AT = "2026-09-07T12:01:00.000Z";
const DEPLOYMENT = Object.freeze({
  id: "dpl_abc123",
  sha: "a".repeat(40),
  observedAt: COMPLETED_AT,
});

const EXPECTED = {
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

function passed<Name extends keyof typeof EXPECTED>(
  name: Name,
  evidence: VerificationCheck["evidence"] = "live_observed",
): VerificationCheck {
  return {
    name,
    required: true,
    status: "passed",
    evidence,
    expected: EXPECTED[name],
    observed: EXPECTED[name],
  };
}

function currentState(overrides: Record<string, unknown> = {}) {
  return {
    environment: "staging" as const,
    origin: "https://staging.example.test",
    checkVersion: VERIFICATION_CHECK_VERSION,
    deployment: DEPLOYMENT,
    configurationChanged: false,
    ...overrides,
  };
}

function receiptInput(
  overrides: Partial<VerificationReceiptInput> = {},
): VerificationReceiptInput {
  return {
    provider: "github",
    scope: "journey",
    scenario: "positive_login",
    runId: "b77e1e41-3fbd-4e85-9bfd-25dd10a4b6d0",
    environment: "staging",
    origin: "https://staging.example.test",
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    deploymentStarted: DEPLOYMENT,
    deployment: DEPLOYMENT,
    checks: [
      passed("deployment_identity"),
      passed("anonymous_baseline"),
      passed("provider_callback"),
      passed("identity"),
      passed("session"),
      passed("logout"),
    ],
    ...overrides,
  };
}

describe("credential verification receipt", () => {
  it("constructs an immutable, versioned positive journey receipt", () => {
    const receipt = createVerificationReceipt(receiptInput());

    expect(receipt).toMatchObject({
      schemaVersion: VERIFICATION_RECEIPT_SCHEMA_VERSION,
      checkVersion: VERIFICATION_CHECK_VERSION,
      readinessExpiresAt: new Date(
        Date.parse(COMPLETED_AT) + VERIFICATION_READINESS_TTL_MS,
      ).toISOString(),
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.checks)).toBe(true);
    expect(summarizeVerificationReceipt(receipt)).toMatchObject({
      status: "passed",
      incomplete: false,
      positiveJourneyVerified: true,
    });
  });

  it("uses UUID run IDs and accepts full Git commit SHAs", () => {
    expect(createVerificationRunId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createVerificationReceipt(receiptInput({
      deploymentStarted: { ...DEPLOYMENT, sha: "c".repeat(64) },
      deployment: { ...DEPLOYMENT, sha: "c".repeat(64) },
    })).deployment?.sha).toHaveLength(64);
  });

  it("keeps an expected denial distinct from a positive login", () => {
    const receipt = createVerificationReceipt(receiptInput({
      scenario: "expected_denial",
      checks: [
        passed("deployment_identity"),
        passed("anonymous_baseline"),
        passed("provider_callback"),
        passed("expected_denial"),
        passed("logout"),
      ],
    }));

    expect(summarizeVerificationReceipt(receipt)).toMatchObject({
      status: "passed",
      incomplete: false,
      positiveJourneyVerified: false,
    });
  });

  it("makes required blocked or skipped checks incomplete", () => {
    const blocked = createVerificationReceipt(receiptInput({
      checks: [
        { ...passed("deployment_identity"), status: "blocked", evidence: "not_observed", observed: "not_observed", reason: "deployment_identity_unavailable" },
        passed("anonymous_baseline"), passed("provider_callback"), passed("identity"),
        passed("session"), passed("logout"),
      ],
    }));
    const skipped = createVerificationReceipt(receiptInput({
      checks: [
        passed("deployment_identity"), passed("anonymous_baseline"), passed("provider_callback"),
        passed("identity"), passed("session"),
        { ...passed("logout"), status: "skipped", evidence: "not_observed", observed: "not_observed", reason: "cancelled_by_operator" },
      ],
    }));

    expect(summarizeVerificationReceipt(blocked)).toMatchObject({ status: "blocked", incomplete: true });
    expect(summarizeVerificationReceipt(skipped)).toMatchObject({ status: "skipped", incomplete: true });
  });

  it("rejects contradictions and missing scenario requirements", () => {
    expect(() => createVerificationReceipt(receiptInput({
      checks: [
        { ...passed("deployment_identity"), evidence: "not_observed" },
        passed("anonymous_baseline"), passed("provider_callback"), passed("identity"),
        passed("session"), passed("logout"),
      ],
    }))).toThrow("Invalid verification receipt");

    expect(() => createVerificationReceipt(receiptInput({
      checks: [
        passed("deployment_identity"), passed("anonymous_baseline"), passed("provider_callback"),
        passed("identity"), passed("session"),
      ],
    }))).toThrow("Invalid verification receipt");
    expect(() => createVerificationReceipt(receiptInput({ runId: "oauth-code-canary" })))
      .toThrow("Invalid verification receipt");
    expect(() => createVerificationReceipt(receiptInput({
      deployment: { ...DEPLOYMENT, id: "sk_live_canary" },
      deploymentStarted: { ...DEPLOYMENT, id: "sk_live_canary" },
    }))).toThrow("Invalid verification receipt");
  });

  it("rejects unknown fields, fake proof objects, sensitive canaries, and request URLs", () => {
    const receipt = createVerificationReceipt(receiptInput());
    const fakeProof = structuredClone(receipt) as unknown as Record<string, unknown>;
    fakeProof.proof = "credential-canary-secret";
    expect(parseVerificationReceipt(fakeProof)).toBeNull();

    const nestedUnknown = structuredClone(receipt) as unknown as { checks: Array<Record<string, unknown>> };
    nestedUnknown.checks[0].providerResponse = "credential-canary-secret";
    expect(parseVerificationReceipt(nestedUnknown)).toBeNull();

    const callbackOrigin = structuredClone(receipt) as unknown as Record<string, unknown>;
    callbackOrigin.origin = "https://staging.example.test/api/auth/callback/github";
    expect(parseVerificationReceipt(callbackOrigin)).toBeNull();
  });

  it("requires a deployment-change failure when a deployment moves during the run", () => {
    const changed = { ...DEPLOYMENT, sha: "b".repeat(40) };
    expect(() => createVerificationReceipt(receiptInput({ deployment: changed }))).toThrow();

    const receipt = createVerificationReceipt(receiptInput({
      deployment: changed,
      checks: [
        { ...passed("deployment_identity"), status: "failed", observed: "deployment_changed", reason: "deployment_changed_during_run" },
        passed("anonymous_baseline"), passed("provider_callback"), passed("identity"),
        passed("session"), passed("logout"),
      ],
    }));
    expect(summarizeVerificationReceipt(receipt)).toMatchObject({ status: "failed", incomplete: true });
  });

  it("requires known matching deployment snapshots for a passed deployment check", () => {
    expect(() => createVerificationReceipt(receiptInput({
      deploymentStarted: null,
      deployment: null,
    }))).toThrow("Invalid verification receipt");
    expect(() => createVerificationReceipt(receiptInput({
      deployment: { ...DEPLOYMENT, observedAt: "2026-09-07T12:01:01.000Z" },
    }))).toThrow("Invalid verification receipt");
  });

  it("expires reuse, detects changes, and leaves unknown freshness unknown", () => {
    const receipt = createVerificationReceipt(receiptInput());
    const beforeExpiry = new Date(Date.parse(COMPLETED_AT) + VERIFICATION_READINESS_TTL_MS - 1);
    const afterExpiry = new Date(Date.parse(COMPLETED_AT) + VERIFICATION_READINESS_TTL_MS + 1);

    expect(assessVerificationReceiptReadiness(receipt, beforeExpiry, currentState()))
      .toEqual({ status: "current" });
    expect(assessVerificationReceiptReadiness(receipt, beforeExpiry, currentState({
      deployment: { ...DEPLOYMENT, sha: "b".repeat(40) },
    }))).toEqual({ status: "stale", reason: "deployment_changed" });
    expect(assessVerificationReceiptReadiness(receipt, beforeExpiry, currentState({
      configurationChanged: null,
    }))).toEqual({ status: "unknown", reason: "current_configuration_unknown" });
    expect(assessVerificationReceiptReadiness(receipt, afterExpiry, currentState()))
      .toEqual({ status: "stale", reason: "expired" });
    expect(receipt.deployment).toEqual(DEPLOYMENT);
  });

  it("does not reuse evidence across origin, environment, check version, or invalid time", () => {
    const receipt = createVerificationReceipt(receiptInput());
    const now = new Date(Date.parse(COMPLETED_AT) + 1);

    expect(assessVerificationReceiptReadiness(receipt, now, currentState({
      origin: "https://other-staging.example.test",
    }))).toEqual({ status: "stale", reason: "origin_changed" });
    expect(assessVerificationReceiptReadiness(receipt, now, currentState({
      environment: "production",
    }))).toEqual({ status: "stale", reason: "environment_changed" });
    expect(assessVerificationReceiptReadiness(receipt, now, currentState({
      checkVersion: "github-oauth/other",
    }))).toEqual({ status: "stale", reason: "check_version_changed" });
    expect(assessVerificationReceiptReadiness(receipt, new Date("invalid"), currentState()))
      .toEqual({ status: "unknown", reason: "current_time_invalid" });
    expect(assessVerificationReceiptReadiness(receipt, new Date(Date.parse(STARTED_AT)), currentState()))
      .toEqual({ status: "unknown", reason: "receipt_completed_in_future" });
  });

  it("does not promote mocked journey evidence to live readiness", () => {
    const receipt = createVerificationReceipt(receiptInput({
      checks: [
        passed("deployment_identity"),
        passed("anonymous_baseline", "mocked"),
        passed("provider_callback", "mocked"),
        passed("identity", "mocked"),
        passed("session", "mocked"),
        passed("logout", "mocked"),
      ],
    }));
    const now = new Date(Date.parse(COMPLETED_AT) + 1);
    expect(summarizeVerificationReceipt(receipt)).toMatchObject({
      status: "passed",
      positiveJourneyVerified: false,
    });
    expect(assessVerificationReceiptReadiness(receipt, now, currentState()))
      .toEqual({ status: "stale", reason: "journey_not_live_observed" });

    const denial = createVerificationReceipt(receiptInput({
      scenario: "expected_denial",
      checks: [
        passed("deployment_identity"),
        passed("anonymous_baseline", "mocked"),
        passed("provider_callback", "mocked"),
        passed("expected_denial", "mocked"),
        passed("logout", "mocked"),
      ],
    }));
    expect(assessVerificationReceiptReadiness(denial, now, currentState()))
      .toEqual({ status: "stale", reason: "journey_not_live_observed" });
  });
});

describe("normalized verification origins", () => {
  it.each([
    "https://staging.example.test",
    "https://staging.example.test:8443",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ])("accepts approved-origin form %s", (origin) => {
    expect(isNormalizedVerificationOrigin(origin)).toBe(true);
  });

  it.each([
    "https://staging.example.test/",
    "https://staging.example.test/path",
    "https://staging.example.test?query=yes",
    "https://user:pass@staging.example.test",
    "http://staging.example.test",
  ])("rejects non-origin or insecure origin %s", (origin) => {
    expect(isNormalizedVerificationOrigin(origin)).toBe(false);
  });
});

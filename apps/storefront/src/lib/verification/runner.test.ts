import { describe, expect, it } from "vitest";

import {
  AuthVerifyInputError,
  formatStaticFailure,
  matchingAttemptFromStructuredLogs,
  parseAuthVerifyArguments,
  runExplain,
  runJourney,
  runPreflight,
  type AuthVerifyDependencies,
  type GitHubVerificationDescriptorForRunner,
} from "./runner";

const descriptor: GitHubVerificationDescriptorForRunner = {
  providerId: "github",
  callbackPath: "/api/auth/callback/github",
  minimumScopes: ["read:user", "user:email"],
  expectedAuthorizationEndpoint: "https://github.com/login/oauth/authorize",
  productionOrigins: ["https://cambridgetcg.com", "https://www.cambridgetcg.com"],
  approvedStagingOrigins: ["https://verify.example.test", "http://127.0.0.1:3100"],
  vercel: {
    projectId: "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD",
    projectName: "cambridgetcg-storefront",
    teamId: "team_HR4tb4WB0KZsKxqroSCTQrof",
    target: "preview",
  },
};

const now = () => new Date("2026-09-07T12:00:00.000Z");
const deploymentHeaders = {
  "x-ctcg-verification-version": "github-oauth/1",
  "x-ctcg-deployment-id": "dpl_123",
  "x-ctcg-commit-sha": "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
};

function dependencies(responses: readonly { status: number; headers: Record<string, string>; setCookies?: readonly string[]; body: string }[]): AuthVerifyDependencies {
  let index = 0;
  return {
    now,
    request: async () => responses[index++]!,
    readVercelMetadata: async () => ({ id: "dpl_123", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd", observedAt: now().toISOString(), target: "preview", configurationFreshness: "current" }),
    readFixture: async () => ({
      origin: "https://verify.example.test",
      environment: "staging",
      scenario: "positive_login",
      dedicatedTestData: true,
      expectedCtcgUserId: "private-fixture-user",
    }),
    runJourney: async () => ({
      callbackObserved: true,
      callbackSucceeded: true,
      baselineSessionState: "anonymous",
      resultingSessionState: "authenticated",
      finalSessionState: "anonymous",
      anonymousBaseline: true,
      expectedDenialObserved: false,
      identityMatchesExpected: true,
      sessionEstablished: true,
      logoutConfirmed: true,
      outcome: "completed",
    }),
  };
}

const preflightOptions = {
  provider: "github" as const,
  mode: "preflight" as const,
  base: "https://verify.example.test",
  json: true,
  probeRedirect: true,
  vercelMetadata: false,
  allowProduction: false,
  allowTestAccountEffects: false,
  operatorDeclaredGitHubApp: true,
};

describe("auth verification runner", () => {
  it("does not emit provider-response or CSRF canaries into a receipt", async () => {
    const receipt = await runPreflight(preflightOptions, descriptor, dependencies([
      { status: 200, headers: deploymentHeaders, body: JSON.stringify({ github: { id: "github" }, secret: "provider-canary" }) },
      { status: 200, headers: {}, setCookies: ["csrf_cookie=canary; Path=/; HttpOnly"], body: JSON.stringify({ csrfToken: "csrf-canary" }) },
      {
        status: 302,
        headers: { location: "https://github.com/login/oauth/authorize?scope=read%3Auser%20user%3Aemail&redirect_uri=https%3A%2F%2Fverify.example.test%2Fapi%2Fauth%2Fcallback%2Fgithub" },
        body: "redirect-canary",
      },
      { status: 200, headers: deploymentHeaders, body: JSON.stringify({ github: { id: "github" } }) },
    ]));

    expect(receipt.checks.every((item) => item.status === "passed")).toBe(true);
    const output = JSON.stringify(receipt);
    expect(output).not.toContain("provider-canary");
    expect(output).not.toContain("csrf-canary");
    expect(output).not.toContain("redirect-canary");
    // The canonical approved origin is intentionally permitted receipt metadata.
  });

  it("reports a control-plane deployment change instead of throwing while creating the receipt", async () => {
    const deps: AuthVerifyDependencies = {
      ...dependencies([{ status: 200, headers: deploymentHeaders, body: JSON.stringify({ github: { id: "github" } }) }]),
      readVercelMetadata: async () => ({ id: "dpl_changed", sha: "1234567890123456789012345678901234567890", observedAt: now().toISOString(), target: "preview", configurationFreshness: "current" }),
    };
    const result = await runPreflight({ ...preflightOptions, probeRedirect: false, vercelMetadata: true }, descriptor, deps);
    expect(result.checks.find(item => item.name === "deployment_identity")).toMatchObject({
      status: "failed", reason: "deployment_changed_during_run",
    });
  });

  it("blocks when approved credential metadata is newer than the deployment", async () => {
    const deps: AuthVerifyDependencies = {
      ...dependencies([{ status: 200, headers: deploymentHeaders, body: JSON.stringify({ github: { id: "github" } }) }]),
      readVercelMetadata: async () => ({
        id: "dpl_123", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        observedAt: now().toISOString(), target: "preview", configurationFreshness: "newer_than_deployment",
      }),
    };
    const result = await runPreflight(
      { ...preflightOptions, probeRedirect: false, vercelMetadata: true }, descriptor, deps,
    );
    expect(result.checks.find(item => item.name === "deployment_identity")).toMatchObject({
      status: "blocked", reason: "configuration_newer_than_deployment",
    });
  });

  it("does not let control-plane metadata override an incompatible runtime check version", async () => {
    const result = await runPreflight({ ...preflightOptions, probeRedirect: false, vercelMetadata: true }, descriptor, dependencies([
      { status: 200, headers: { ...deploymentHeaders, "x-ctcg-verification-version": "incompatible" }, body: JSON.stringify({ github: { id: "github" } }) },
    ]));
    expect(result.checks.find(item => item.name === "deployment_identity")).toMatchObject({
      status: "blocked", reason: "deployment_identity_unavailable",
    });
  });

  it("names missing declarations and unrequested probes without blaming tools", async () => {
    const response = { status: 200, headers: deploymentHeaders, body: JSON.stringify({ github: { id: "github" } }) };
    const result = await runPreflight({ ...preflightOptions, probeRedirect: false, operatorDeclaredGitHubApp: false }, descriptor, dependencies([response, response]));
    expect(result.checks.find(item => item.name === "operator_declaration")).toMatchObject({ status: "blocked", reason: "operator_declaration_required" });
    expect(result.checks.find(item => item.name === "configuration")).toMatchObject({ status: "blocked", reason: "operator_declaration_required" });
    expect(result.checks.find(item => item.name === "authorization_request")).toMatchObject({ status: "blocked", reason: "authorization_probe_not_requested" });
  });

  it("requires explicit base, fixture acknowledgement, and production acknowledgement", () => {
    expect(() => parseAuthVerifyArguments(["github", "--mode", "preflight"]))
      .toThrow(AuthVerifyInputError);
    expect(() => parseAuthVerifyArguments(["github", "--mode", "journey", "--base", "https://verify.example.test"]))
      .toThrow(AuthVerifyInputError);
    expect(() => parseAuthVerifyArguments(["github", "--mode", "preflight", "--base", "https://verify.example.test", "--unknown"]))
      .toThrow(AuthVerifyInputError);
    expect(formatStaticFailure("config_invalid_base")).not.toContain("https://");
  });

  it("rejects an unapproved origin and production without its explicit acknowledgement", async () => {
    await expect(runPreflight({ ...preflightOptions, base: "https://elsewhere.example.test" }, descriptor, dependencies([])))
      .rejects.toMatchObject({ code: "config_origin_not_approved" });
    await expect(runPreflight({ ...preflightOptions, base: "https://cambridgetcg.com", allowProduction: false }, descriptor, dependencies([])))
      .rejects.toMatchObject({ code: "config_production_acknowledgement_required" });
  });

  it("allows loopback fixtures only as mocked/incomplete evidence", async () => {
    const local: AuthVerifyDependencies = {
      ...dependencies([]),
      readFixture: async () => ({
        origin: "http://127.0.0.1:3100",
        environment: "staging",
        scenario: "positive_login",
        dedicatedTestData: true,
        expectedCtcgUserId: "private-fixture-user",
      }),
    };
    const receipt = await runJourney({
      provider: "github", mode: "journey", base: "http://127.0.0.1:3100", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      fixturePath: "/private/fixture.json", allowTestAccountEffects: true,
      operatorDeclaredGitHubApp: false,
    }, descriptor, local);
    expect(receipt.checks.find((item) => item.name === "deployment_identity")?.status).toBe("blocked");
    expect(receipt.checks.find((item) => item.name === "identity")?.evidence).toBe("mocked");
    expect(JSON.stringify(receipt)).not.toContain("private-fixture-user");
  });

  it("does not pass a positive provider callback from a raw callback observation alone", async () => {
    const local: AuthVerifyDependencies = {
      ...dependencies([]),
      readFixture: async () => ({
        origin: "http://127.0.0.1:3100",
        environment: "staging",
        scenario: "positive_login",
        dedicatedTestData: true,
        expectedCtcgUserId: "private-fixture-user",
      }),
      runJourney: async () => ({
        callbackObserved: true,
        callbackSucceeded: false,
        baselineSessionState: "anonymous",
        resultingSessionState: "authenticated",
        finalSessionState: "anonymous",
        anonymousBaseline: true,
        expectedDenialObserved: false,
        identityMatchesExpected: true,
        sessionEstablished: true,
        logoutConfirmed: true,
        outcome: "completed",
      }),
    };
    const receipt = await runJourney({
      provider: "github", mode: "journey", base: "http://127.0.0.1:3100", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      fixturePath: "/private/fixture.json", allowTestAccountEffects: true,
      operatorDeclaredGitHubApp: false,
    }, descriptor, local);
    expect(receipt.checks.find((item) => item.name === "provider_callback")).toMatchObject({
      status: "blocked", reason: "tool_output_invalid",
    });
  });

  it("keeps unknown session reads as not observed instead of asserting presence or mismatch", async () => {
    const local: AuthVerifyDependencies = {
      ...dependencies([]),
      readFixture: async () => ({
        origin: "http://127.0.0.1:3100",
        environment: "staging",
        scenario: "positive_login",
        dedicatedTestData: true,
        expectedCtcgUserId: "private-fixture-user",
      }),
      runJourney: async () => ({
        callbackObserved: true,
        callbackSucceeded: false,
        baselineSessionState: "unknown",
        resultingSessionState: "unknown",
        finalSessionState: "unknown",
        anonymousBaseline: false,
        expectedDenialObserved: false,
        identityMatchesExpected: false,
        sessionEstablished: false,
        logoutConfirmed: false,
        outcome: "failed",
      }),
    };
    const receipt = await runJourney({
      provider: "github", mode: "journey", base: "http://127.0.0.1:3100", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      fixturePath: "/private/fixture.json", allowTestAccountEffects: true,
      operatorDeclaredGitHubApp: false,
    }, descriptor, local);
    expect(receipt.checks.find((item) => item.name === "provider_callback")).toMatchObject({
      status: "blocked", observed: "not_observed", reason: "tool_output_invalid",
    });
    for (const name of ["anonymous_baseline", "identity", "session", "logout"] as const) {
      expect(receipt.checks.find((item) => item.name === name)).toMatchObject({
        status: "blocked", observed: "not_observed", reason: "tool_output_invalid",
      });
    }
    expect(JSON.stringify(receipt)).not.toContain("identity_mismatch");
    expect(JSON.stringify(receipt)).not.toContain("session_still_present");
  });

  it("marks a journey incomplete when its deployment changes during the browser wait", async () => {
    let metadataReads = 0;
    const runTimes = [
      "2026-09-07T12:00:00.000Z", // run start, before first deployment read
      "2026-09-07T12:00:03.000Z", // receipt completion, after second read
    ];
    const remote: AuthVerifyDependencies = {
      ...dependencies([]),
      now: () => new Date(runTimes.shift() ?? "2026-09-07T12:00:03.000Z"),
      readVercelMetadata: async () => {
        metadataReads += 1;
        return metadataReads === 1
          ? { id: "dpl_123", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd", observedAt: "2026-09-07T12:00:01.000Z", target: "preview" as const, configurationFreshness: "current" as const }
          : { id: "dpl_456", sha: "1234567890123456789012345678901234567890", observedAt: "2026-09-07T12:00:02.000Z", target: "preview" as const, configurationFreshness: "current" as const };
      },
    };
    const receipt = await runJourney({
      provider: "github", mode: "journey", base: "https://verify.example.test", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      fixturePath: "/private/fixture.json", allowTestAccountEffects: true,
      operatorDeclaredGitHubApp: false,
    }, descriptor, remote);
    expect(receipt.checks.find((item) => item.name === "deployment_identity")).toMatchObject({
      status: "failed", observed: "deployment_changed", reason: "deployment_changed_during_run",
    });
  });

  it("blocks a production-target Vercel alias even if it looks like staging", async () => {
    const aliasDescriptor: GitHubVerificationDescriptorForRunner = {
      ...descriptor,
      approvedStagingOrigins: ["https://cambridgetcg-alias.vercel.app"],
    };
    const remote: AuthVerifyDependencies = {
      ...dependencies([]),
      readFixture: async () => ({
        origin: "https://cambridgetcg-alias.vercel.app", environment: "staging",
        scenario: "positive_login", dedicatedTestData: true, expectedCtcgUserId: "private-fixture-user",
      }),
      readVercelMetadata: async () => ({
        id: "dpl_123", sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd", observedAt: now().toISOString(), target: "production", configurationFreshness: "current",
      }),
    };
    await expect(runJourney({
      provider: "github", mode: "journey", base: "https://cambridgetcg-alias.vercel.app", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      fixturePath: "/private/fixture.json", allowTestAccountEffects: true,
      operatorDeclaredGitHubApp: false,
    }, aliasDescriptor, remote)).rejects.toMatchObject({ code: "deployment_identity_unavailable" });
  });

  it("forwards bounded operator-tool failure labels instead of calling them missing evidence", async () => {
    const supportId = "c2b0768f-4b71-48a3-8e6f-246ec3a5e082";
    const result = await runExplain({
      provider: "github", mode: "explain", base: "https://verify.example.test", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: false,
      allowTestAccountEffects: false, attempt: supportId, operatorDeclaredGitHubApp: false,
    }, descriptor, {
      request: async () => ({ status: 500, headers: {}, body: "" }),
      now,
      readVercelLogs: async () => { throw new AuthVerifyInputError("tool_timeout"); },
    });
    expect(result.receipt.checks[0]).toMatchObject({ status: "blocked", reason: "tool_timeout" });
  });

  it("forwards the support ID and accepts a fixed-project production explanation", async () => {
    const supportId = "c2b0768f-4b71-48a3-8e6f-246ec3a5e082";
    const productionDescriptor: GitHubVerificationDescriptorForRunner = {
      ...descriptor,
      vercel: { ...descriptor.vercel!, target: "production" },
    };
    let queriedSupportId = "";
    const result = await runExplain({
      provider: "github", mode: "explain", base: "https://cambridgetcg.com", json: true,
      probeRedirect: false, vercelMetadata: false, allowProduction: true,
      allowTestAccountEffects: false, attempt: supportId, operatorDeclaredGitHubApp: false,
    }, productionDescriptor, {
      request: async () => ({ status: 500, headers: {}, body: "" }),
      now,
      readVercelLogs: async (_descriptor, _origin, requestedSupportId) => {
        queriedSupportId = requestedSupportId;
        return [{
          project: "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD", target: "production",
          path_class: "github_auth", origin: "https://cambridgetcg.com",
          deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          event: {
            kind: "github-oauth-attempt/v1", schema_version: "1", verification_version: "github-oauth/1",
            provider: "github", phase: "callback", support_id: supportId,
            started_at: "2026-09-07T11:59:00.000Z", completed_at: "2026-09-07T11:59:01.000Z",
            deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
            events: [{ code: "invalid_proof" }],
          },
        }];
      },
    });
    expect(queriedSupportId).toBe(supportId);
    expect(result.receipt.checks[0]).toMatchObject({ status: "passed" });
    expect(result.remediations).toHaveLength(1);
  });

  it("parses only matching structured safe attempt events", () => {
    const supportId = "c2b0768f-4b71-48a3-8e6f-246ec3a5e082";
    const summary = matchingAttemptFromStructuredLogs([
      { support_id: supportId, raw: "secret-canary" },
      {
        project: "other-project", target: "preview", path_class: "github_auth", origin: "https://verify.example.test",
        deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        event: {
          kind: "github-oauth-attempt/v1", schema_version: "1", verification_version: "github-oauth/1",
          provider: "github", phase: "callback", support_id: supportId,
          started_at: "2026-09-07T12:00:00.000Z", completed_at: "2026-09-07T12:00:01.000Z",
          deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd", events: [{ code: "invalid_proof" }],
        },
      },
      {
        project: "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD", target: "preview", path_class: "github_auth", origin: "https://verify.example.test",
        deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        event: {
          kind: "github-oauth-attempt/v1", schema_version: "1", verification_version: "github-oauth/1",
          provider: "github", phase: "callback", support_id: supportId,
          started_at: "2026-09-07T12:00:00.000Z", completed_at: "2026-09-07T12:00:01.000Z",
          deployment_id: "dpl_123", commit_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          events: [{ code: "first_link_session_target_mismatch" }],
        },
      },
    ], supportId, { project: "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD", target: "preview", origin: "https://verify.example.test" });
    expect(summary?.events).toEqual([{ code: "first_link_session_target_mismatch" }]);
    expect(JSON.stringify(summary)).not.toContain("secret-canary");
  });
});

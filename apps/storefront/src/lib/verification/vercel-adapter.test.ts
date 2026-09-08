import { describe, expect, it } from "vitest";

import { AuthVerifyInputError, type GitHubVerificationDescriptorForRunner } from "./runner";
import {
  VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME,
  VERCEL_TEAM_ID,
  createVercelAdapter,
  type VercelExecFile,
  type VercelExecFileOptions,
} from "./vercel-adapter";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const CREATED = Date.parse("2026-09-07T11:50:00.000Z");
const SHA = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const SUPPORT_ID = "c2b0768f-4b71-48a3-8e6f-246ec3a5e082";

function descriptor(target: "preview" | "production" = "production"): GitHubVerificationDescriptorForRunner {
  return {
    providerId: "github",
    callbackPath: "/api/auth/callback/github",
    minimumScopes: ["read:user", "user:email"],
    expectedAuthorizationEndpoint: "https://github.com/login/oauth/authorize",
    productionOrigins: ["https://cambridgetcg.com"],
    approvedStagingOrigins: ["https://credential-preview.vercel.app"],
    vercel: {
      projectId: VERCEL_PROJECT_ID,
      projectName: VERCEL_PROJECT_NAME,
      teamId: VERCEL_TEAM_ID,
      target,
    },
  };
}

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: "dpl_abc123",
    projectId: VERCEL_PROJECT_ID,
    name: VERCEL_PROJECT_NAME,
    readyState: "READY",
    target: "production",
    createdAt: CREATED,
    meta: { githubCommitSha: SHA, githubCommitRef: "main" },
    alias: ["cambridgetcg.com"],
    ...overrides,
  };
}

function envRow(key: "AUTH_GITHUB_ID" | "AUTH_GITHUB_SECRET", overrides: Record<string, unknown> = {}) {
  return {
    key,
    target: ["production"],
    type: key === "AUTH_GITHUB_SECRET" ? "sensitive" : "encrypted",
    createdAt: CREATED - 2_000,
    updatedAt: CREATED - 1_000,
    gitBranch: null,
    value: "SECRET_CANARY_MUST_NOT_ESCAPE",
    ...overrides,
  };
}

function commandQueue(outputs: readonly (string | Error)[]) {
  const calls: Array<{ file: string; args: readonly string[]; options: VercelExecFileOptions }> = [];
  let index = 0;
  const execFile: VercelExecFile = async (file, args, options) => {
    calls.push({ file, args, options });
    const output = outputs[index++];
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("unexpected exec");
    return { stdout: output };
  };
  return { execFile, calls };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    kind: "github-oauth-attempt/v1",
    schema_version: "1",
    verification_version: "github-oauth/1",
    provider: "github",
    phase: "callback",
    support_id: SUPPORT_ID,
    started_at: "2026-09-07T11:58:00.000Z",
    completed_at: "2026-09-07T11:58:01.000Z",
    deployment_id: "dpl_abc123",
    commit_sha: SHA,
    events: [{ code: "first_link_session_target_mismatch" }],
    ...overrides,
  };
}

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    projectId: VERCEL_PROJECT_ID,
    deploymentId: "dpl_abc123",
    domain: "cambridgetcg.com",
    environment: "production",
    requestPath: "/api/auth/callback/github",
    requestMethod: "GET",
    responseStatusCode: 302,
    timestamp: Date.parse("2026-09-07T11:58:01.000Z"),
    message: JSON.stringify(summary()),
    rawProviderError: "PROVIDER_CANARY_MUST_NOT_ESCAPE",
    ...overrides,
  };
}

function adapter(outputs: readonly (string | Error)[]) {
  const queue = commandQueue(outputs);
  return {
    adapter: createVercelAdapter({
      execFile: queue.execFile,
      env: { PATH: "/safe/bin", HOME: "/safe/home", NODE_ENV: "test" },
      now: () => new Date(NOW),
    }),
    calls: queue.calls,
  };
}

function expectCode(promise: Promise<unknown>, code: AuthVerifyInputError["code"]) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("Vercel metadata adapter", () => {
  it("uses fixed API IDs and accepts only selected credential metadata", async () => {
    const { adapter: subject, calls } = adapter([
      JSON.stringify({ ...deployment(), responseCanary: "DEPLOYMENT_CANARY" }),
      JSON.stringify({ envs: [
        envRow("AUTH_GITHUB_ID"),
        envRow("AUTH_GITHUB_SECRET"),
        envRow("AUTH_GITHUB_ID", { target: ["preview"], gitBranch: "other" }),
      ], responseCanary: "ENV_CANARY" }),
    ]);

    const result = await subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com");

    expect(result).toEqual({
      id: "dpl_abc123",
      sha: SHA,
      observedAt: "2026-09-07T12:00:00.000Z",
      target: "production",
      configurationFreshness: "current",
    });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(calls.map((call) => call.args)).toEqual([
      ["api", "/v13/deployments/cambridgetcg.com", "--scope", VERCEL_TEAM_ID, "--raw"],
      ["api", `/v10/projects/${VERCEL_PROJECT_ID}/env`, "--scope", VERCEL_TEAM_ID, "--raw"],
    ]);
    expect(calls.every((call) => call.file === "vercel"
      && call.options.shell === false
      && call.options.timeout === 15_000
      && call.options.maxBuffer === 64 * 1024)).toBe(true);
  });

  it("accepts Vercel's omitted global gitBranch and standard multi-environment metadata", async () => {
    const rows = [envRow("AUTH_GITHUB_ID"), envRow("AUTH_GITHUB_SECRET")].map(row => {
      const globalRow: Record<string, unknown> = { ...row, target: ["production", "preview", "development"] };
      delete globalRow.gitBranch;
      return globalRow;
    });
    const { adapter: subject } = adapter([
      JSON.stringify(deployment()),
      JSON.stringify({ envs: rows }),
    ]);
    await expect(subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"))
      .resolves.toMatchObject({ target: "production", configurationFreshness: "current" });
  });

  it("does not treat development-only variables as production credentials", async () => {
    const { adapter: subject } = adapter([
      JSON.stringify(deployment()),
      JSON.stringify({ envs: [
        envRow("AUTH_GITHUB_ID", { target: ["development"] }),
        envRow("AUTH_GITHUB_SECRET", { target: ["development"] }),
      ] }),
    ]);
    await expectCode(subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"), "tool_output_invalid");
  });

  it("normalizes a known null target to preview and prefers matching branch overrides", async () => {
    const globalNewerThanDeployment = CREATED + 5_000;
    const { adapter: subject } = adapter([
      JSON.stringify(deployment({
        target: null,
        meta: { githubCommitSha: SHA, githubCommitRef: "verify-branch" },
        alias: ["credential-preview.vercel.app"],
      })),
      JSON.stringify({ envs: [
        envRow("AUTH_GITHUB_ID", { target: ["preview"], updatedAt: globalNewerThanDeployment }),
        envRow("AUTH_GITHUB_SECRET", { target: ["preview"], updatedAt: globalNewerThanDeployment }),
        envRow("AUTH_GITHUB_ID", { target: ["preview"], gitBranch: "verify-branch" }),
        envRow("AUTH_GITHUB_SECRET", { target: ["preview"], gitBranch: "verify-branch" }),
        envRow("AUTH_GITHUB_ID", { target: ["preview"], gitBranch: "other-branch" }),
        envRow("AUTH_GITHUB_SECRET", { target: ["preview"], gitBranch: "other-branch" }),
      ] }),
    ]);

    await expect(subject.readVercelMetadata(
      descriptor("preview"), "https://credential-preview.vercel.app",
    )).resolves.toMatchObject({ target: "preview", configurationFreshness: "current" });
  });

  it("reports configuration newer than the deployment without claiming it current", async () => {
    const { adapter: subject } = adapter([
      JSON.stringify(deployment()),
      JSON.stringify({ envs: [
        envRow("AUTH_GITHUB_ID", { updatedAt: CREATED + 1 }),
        envRow("AUTH_GITHUB_SECRET"),
      ] }),
    ]);
    await expect(subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"))
      .resolves.toMatchObject({ configurationFreshness: "newer_than_deployment" });
  });

  it.each([
    ["missing key", [envRow("AUTH_GITHUB_ID")]],
    ["wrong target", [envRow("AUTH_GITHUB_ID", { target: ["preview"] }), envRow("AUTH_GITHUB_SECRET", { target: ["preview"] })]],
    ["ambiguous key", [envRow("AUTH_GITHUB_ID"), envRow("AUTH_GITHUB_ID"), envRow("AUTH_GITHUB_SECRET")]],
    ["malformed metadata", [envRow("AUTH_GITHUB_ID", { type: "plain" }), envRow("AUTH_GITHUB_SECRET")]],
  ])("blocks %s environment metadata", async (_name, envs) => {
    const { adapter: subject } = adapter([
      JSON.stringify(deployment()),
      JSON.stringify({ envs }),
    ]);
    await expectCode(
      subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"),
      "tool_output_invalid",
    );
  });

  it("reports a non-ready deployment without reading environment metadata", async () => {
    const { adapter: subject, calls } = adapter([
      JSON.stringify(deployment({ readyState: "BUILDING" })),
    ]);
    await expectCode(
      subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"),
      "deployment_not_ready",
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects wrong project, target, origin, team binding, and stale observation clocks", async () => {
    for (const badDeployment of [
      deployment({ projectId: "prj_other" }),
      deployment({ target: null }),
      deployment({ alias: ["other.example"] }),
      deployment({ createdAt: NOW + 1 }),
    ]) {
      const { adapter: subject } = adapter([JSON.stringify(badDeployment)]);
      await expectCode(
        subject.readVercelMetadata(descriptor(), "https://cambridgetcg.com"),
        "tool_output_invalid",
      );
    }
    const wrongTeam = descriptor();
    const changed = { ...wrongTeam, vercel: { ...wrongTeam.vercel!, teamId: "team_other" } };
    const { adapter: subject, calls } = adapter([]);
    await expectCode(subject.readVercelMetadata(changed, "https://cambridgetcg.com"), "tool_output_invalid");
    expect(calls).toHaveLength(0);
  });
});

describe("Vercel log adapter", () => {
  it("constructs a bounded non-following query and returns only a normalized production envelope", async () => {
    const { adapter: subject, calls } = adapter([
      `${JSON.stringify(logRow())}\n`,
      JSON.stringify(deployment({ alias: ["old.cambridgetcg.com"] })),
    ]);

    const rows = await subject.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID);

    expect(calls[0]!.args).toEqual([
      "logs",
      "--project", VERCEL_PROJECT_ID,
      "--environment", "production",
      "--no-follow",
      "--no-branch",
      "--query", SUPPORT_ID,
      "--since", "1h",
      "--limit", "50",
      "--json",
      "--scope", VERCEL_TEAM_ID,
    ]);
    expect(calls[0]!.args).not.toContain("https://cambridgetcg.com");
    expect(calls[1]!.args).toEqual([
      "api", "/v13/deployments/dpl_abc123", "--scope", VERCEL_TEAM_ID, "--raw",
    ]);
    expect(rows).toEqual([{
      project: VERCEL_PROJECT_ID,
      target: "production",
      path_class: "github_auth",
      origin: "https://cambridgetcg.com",
      deployment_id: "dpl_abc123",
      commit_sha: SHA,
      event: summary(),
    }]);
    expect(JSON.stringify(rows)).not.toContain("CANARY");
  });

  it("parses a signin POST summary from known nested log message/text fields and deduplicates it", async () => {
    const event = JSON.stringify(summary({ phase: "signin" }));
    const row = logRow({
      requestPath: "/api/auth/signin/github",
      requestMethod: "POST",
      message: "ordinary log line",
      logs: [{ message: event, token: "TOKEN_CANARY" }, { text: event }],
    });
    const { adapter: subject } = adapter([
      `${JSON.stringify(row)}\n`,
      JSON.stringify(deployment()),
    ]);
    const rows = await subject.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("TOKEN_CANARY");
  });

  it.each([
    ["project", { projectId: "prj_other" }],
    ["origin", { domain: "other.example" }],
    ["method", { requestMethod: "POST" }],
    ["version", { message: JSON.stringify(summary({ verification_version: "github-oauth/other" })) }],
    ["deployment id", { deploymentId: "unsafe-deployment", message: JSON.stringify(summary({ deployment_id: "unsafe-deployment" })) }],
  ])("rejects a log with the wrong %s binding", async (_name, override) => {
    const { adapter: subject, calls } = adapter([`${JSON.stringify(logRow(override))}\n`]);
    await expect(subject.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID))
      .resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("rejects a self-attested commit SHA that deployment metadata does not confirm", async () => {
    const selfAttested = "1".repeat(40);
    const row = logRow({ message: JSON.stringify(summary({ commit_sha: selfAttested })) });
    const { adapter: subject } = adapter([
      `${JSON.stringify(row)}\n`,
      JSON.stringify(deployment()),
    ]);
    await expect(subject.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID))
      .resolves.toEqual([]);
  });

  it("blocks conflicting summaries and clock-stale rows", async () => {
    const conflict = logRow({ message: JSON.stringify(summary({ events: [{ code: "invalid_proof" }] })) });
    const { adapter: conflicting } = adapter([
      `${JSON.stringify(logRow())}\n${JSON.stringify(conflict)}\n`,
    ]);
    await expectCode(
      conflicting.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID),
      "tool_output_invalid",
    );

    const future = logRow({ timestamp: NOW + 1 });
    const { adapter: stale } = adapter([`${JSON.stringify(future)}\n`]);
    await expect(stale.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID))
      .resolves.toEqual([]);
  });

  it("classifies unavailable, timeout, malformed JSON, and internal subprocess failures honestly", async () => {
    const unavailable = Object.assign(new Error("raw unavailable canary"), { code: "ENOENT" });
    const timeout = Object.assign(new Error("raw timeout canary"), { killed: true });
    const internal = Object.assign(new Error("raw internal canary"), { code: "EUNKNOWN" });
    for (const [error, code] of [
      [unavailable, "tool_unavailable"],
      [timeout, "tool_timeout"],
      [internal, "verification_internal_error"],
    ] as const) {
      const { adapter: subject } = adapter([error]);
      await expectCode(subject.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID), code);
    }
    const { adapter: malformed } = adapter(["not-jsonl"]);
    await expectCode(
      malformed.readVercelLogs(descriptor(), "https://cambridgetcg.com", SUPPORT_ID),
      "tool_output_invalid",
    );
  });
});

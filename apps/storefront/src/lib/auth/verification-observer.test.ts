import { describe, expect, it, vi } from "vitest";
import {
  addGitHubVerificationHeaders,
  addSupportIdToGitHubFailureRedirect,
  recordAuthJsErrorType,
  recordGitHubVerificationEvent,
  withGitHubVerificationAttempt,
  type VerificationAttemptSummary,
  type VerificationObserver,
} from "./verification-observer";
import {
  AUTH_COMPLETION_HEADER,
  AUTH_COMPLETION_OBSERVED,
  CHECK_VERSION,
  parseVerificationAttemptSummary,
} from "@/lib/verification/events";

function observer(summaries: VerificationAttemptSummary[]): VerificationObserver {
  return {
    record: vi.fn(),
    currentSupportId: () => null,
    emit: (summary) => summaries.push(summary),
  };
}

describe("GitHub verification observer", () => {
  it("keeps concurrent attempts isolated by AsyncLocalStorage", async () => {
    const first: VerificationAttemptSummary[] = [];
    const second: VerificationAttemptSummary[] = [];
    let releaseFirst!: () => void;
    const firstWaiting = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const one = withGitHubVerificationAttempt("callback", async () => {
      recordGitHubVerificationEvent("invalid_proof");
      await firstWaiting;
      recordAuthJsErrorType("AccessDenied");
    }, observer(first));
    const two = withGitHubVerificationAttempt("signin", async () => {
      recordGitHubVerificationEvent("established_link");
    }, observer(second));

    await two;
    releaseFirst();
    await one;

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({
      phase: "callback",
      events: [
        { code: "github_callback_started" },
        { code: "invalid_proof" },
        { code: "authjs_denial", category: "access_denied" },
      ],
    });
    expect(second[0]).toMatchObject({
      phase: "signin",
      events: [
        { code: "github_signin_started" },
        { code: "established_link" },
      ],
    });
    expect(first[0].support_id).not.toBe(second[0].support_id);
  });

  it("caps events and turns unsupported Auth.js labels into unspecified", async () => {
    const summaries: VerificationAttemptSummary[] = [];
    await withGitHubVerificationAttempt("callback", async () => {
      for (let index = 0; index < 20; index += 1) recordGitHubVerificationEvent("provider_request_failed");
      recordAuthJsErrorType("private-upstream-message@example.com");
    }, observer(summaries));

    expect(summaries[0].events).toHaveLength(12);
    expect(summaries[0].events).not.toContainEqual({
      code: "authjs_denial", category: "unspecified",
    });
  });

  it("does not change an operation when observer record or sink fails", async () => {
    const broken: VerificationObserver = {
      record: () => { throw new Error("secret@example.com"); },
      currentSupportId: () => null,
      emit: () => { throw new Error("token=private"); },
    };

    await expect(withGitHubVerificationAttempt("signin", async () => {
      recordGitHubVerificationEvent("provider_request_failed");
      return "preserved";
    }, broken)).resolves.toBe("preserved");
  });

  it("adds only validated metadata and support headers inside a callback scope", async () => {
    const summaries: VerificationAttemptSummary[] = [];
    const response = await withGitHubVerificationAttempt("callback", async () => {
      const current = new Response(null, { status: 302, headers: {
        Location: "https://cambridgetcg.com/login?error=AccessDenied",
      } });
      const withHeaders = addGitHubVerificationHeaders(current, {
        includeSupportId: true,
        environment: {
          VERCEL_DEPLOYMENT_ID: "dpl_123",
          VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
        },
      });
      return addSupportIdToGitHubFailureRedirect(
        new Request("https://cambridgetcg.com/api/auth/callback/github"),
        withHeaders,
      );
    }, observer(summaries));

    expect(response.headers.get("x-ctcg-verification-version")).toBe(CHECK_VERSION);
    expect(response.headers.get("x-ctcg-deployment-id")).toBe("dpl_123");
    expect(response.headers.get("x-ctcg-commit-sha")).toBe("0123456789abcdef0123456789abcdef01234567");
    const supportId = response.headers.get("x-ctcg-auth-attempt");
    expect(supportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new URL(response.headers.get("location")!).searchParams.get("support")).toBe(supportId);

    const unsafe = addGitHubVerificationHeaders(new Response(null, { headers: {
      "x-ctcg-deployment-id": "sk_live_canary",
      "x-ctcg-commit-sha": "secret-canary",
      [AUTH_COMPLETION_HEADER]: AUTH_COMPLETION_OBSERVED,
    } }), {
      environment: {
        VERCEL_DEPLOYMENT_ID: "sk_live_canary",
        VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef0123456",
      },
    });
    expect(unsafe.headers.get(AUTH_COMPLETION_HEADER)).toBeNull();
    expect(unsafe.headers.get("x-ctcg-deployment-id")).toBeNull();
    expect(unsafe.headers.get("x-ctcg-commit-sha")).toBeNull();
  });

  it.each([
    { phase: "signin" as const, completed: true, expected: null },
    { phase: "callback" as const, completed: false, expected: null },
    { phase: "callback" as const, completed: true, expected: AUTH_COMPLETION_OBSERVED },
  ])("exposes only the observed callback milestone ($phase, $completed)", async ({ phase, completed, expected }) => {
    const summaries: VerificationAttemptSummary[] = [];
    const result = await withGitHubVerificationAttempt(phase, async () => {
      if (completed) recordGitHubVerificationEvent("authjs_signin_completed");
      return addGitHubVerificationHeaders(Response.redirect("https://cambridgetcg.com/account"), { includeSupportId: true });
    }, observer(summaries));
    expect(result.headers.get(AUTH_COMPLETION_HEADER)).toBe(expected);
    expect(JSON.stringify(summaries)).not.toContain("journey_verified");
  });

  it("preserves Auth.js response status, body and separate cookies on decoration", async () => {
    const original = new Response("Auth.js body", { status: 302, statusText: "Found" });
    original.headers.append("set-cookie", "one=1; Path=/; HttpOnly");
    original.headers.append("set-cookie", "two=2; Path=/; HttpOnly");

    const response = addGitHubVerificationHeaders(original);

    expect(response.status).toBe(302);
    expect(response.statusText).toBe("Found");
    await expect(response.text()).resolves.toBe("Auth.js body");
    expect(response.headers.getSetCookie()).toEqual([
      "one=1; Path=/; HttpOnly",
      "two=2; Path=/; HttpOnly",
    ]);
  });

  it("decorates immutable redirect responses without losing the support reference", async () => {
    const summaries: VerificationAttemptSummary[] = [];
    const original = Response.redirect("https://cambridgetcg.com/login/error?error=AccessDenied", 302);
    expect(() => original.headers.set("x-test", "blocked")).toThrow();

    const response = await withGitHubVerificationAttempt("callback", async () => {
      recordAuthJsErrorType("AccessDenied");
      const withHeaders = addGitHubVerificationHeaders(original, { includeSupportId: true });
      return addSupportIdToGitHubFailureRedirect(
        new Request("https://cambridgetcg.com/api/auth/callback/github"),
        withHeaders,
      );
    }, observer(summaries));

    const supportId = response.headers.get("x-ctcg-auth-attempt");
    expect(supportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new URL(response.headers.get("location")!).searchParams.get("support")).toBe(supportId);
    expect(summaries[0].support_id).toBe(supportId);
    expect(summaries[0].events).toContainEqual({
      code: "authjs_denial", category: "access_denied",
    });
  });

  it("maps inherited-looking Auth.js labels to unspecified", async () => {
    const summaries: VerificationAttemptSummary[] = [];
    await withGitHubVerificationAttempt("callback", async () => {
      recordAuthJsErrorType("constructor");
      recordAuthJsErrorType("__proto__");
    }, observer(summaries));

    expect(summaries[0].events.filter((event) => (
      event.code === "authjs_denial" && event.category === "unspecified"
    ))).toHaveLength(2);
  });

  it("strictly parses safe summaries and rejects secret-bearing metadata", () => {
    const safe = {
      kind: "github-oauth-attempt/v1",
      schema_version: "1",
      verification_version: CHECK_VERSION,
      provider: "github",
      phase: "callback",
      support_id: "6f98d2de-a9d9-4c66-a8e5-7cae6fc7cda1",
      started_at: "2026-09-07T10:00:00.000Z",
      completed_at: "2026-09-07T10:00:01.000Z",
      deployment_id: "dpl_123",
      commit_sha: "0123456789abcdef0123456789abcdef01234567",
      events: [{ code: "authjs_denial", category: "access_denied" }],
    };
    expect(parseVerificationAttemptSummary(safe)).toEqual(safe);
    expect(parseVerificationAttemptSummary({
      ...safe,
      commit_sha: "f".repeat(64),
    })?.commit_sha).toBe("f".repeat(64));
    expect(parseVerificationAttemptSummary({
      ...safe,
      commit_sha: "f".repeat(39),
    })).toBeNull();
    expect(parseVerificationAttemptSummary({
      ...safe,
      deployment_id: "sk_live_canary",
    })).toBeNull();
    expect(parseVerificationAttemptSummary({
      ...safe,
      deployment_id: "token=private@example.com",
    })).toBeNull();
    expect(parseVerificationAttemptSummary({
      ...safe,
      events: [{ code: "provider_request_failed", detail: "token=private" }],
    })).toBeNull();
  });
});

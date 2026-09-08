import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
  browserProcessEnvironment,
  runBrowserJourney,
  type BrowserJourneyDependencies,
  type BrowserPage,
  type BrowserResponse,
} from "./browser-journey";

const SUPPORT_ID = "4c0f705c-2fa7-4e4e-9f51-0e2725d4b1bb";
const SESSION_EXPIRY = "2099-09-07T12:00:00.000Z";
const COMPLETION_HEADER = "x-ctcg-auth-completion";
const COMPLETION_OBSERVED = "authjs-signin-observed";

type LocalMode =
  | "positive"
  | "denial"
  | "baseline_500"
  | "baseline_malformed"
  | "baseline_oversize"
  | "logout_500"
  | "logout_malformed"
  | "callback_error_existing_session"
  | "callback_200_location"
  | "wrong_identity"
  | "stuck_baseline";

async function localBrowserFixture(mode: LocalMode, callbackLocation = "/account"): Promise<{
  readonly origin: string;
  readonly signoutRequests: () => number;
  readonly sessionRequests: () => number;
  readonly close: () => Promise<void>;
}> {
  let signoutRequests = 0;
  let sessionRequests = 0;
  let signedOut = false;
  const hangingResponses = new Set<ServerResponse>();
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const signedIn = request.headers.cookie?.includes("fixture_session=1") === true;
    if (path === "/api/auth/session") {
      sessionRequests += 1;
      if (mode === "baseline_500" || (mode === "logout_500" && signedOut)) {
        response.statusCode = 500;
        response.end("session-error-canary");
        return;
      }
      if (mode === "baseline_malformed" || (mode === "logout_malformed" && signedOut)) {
        response.setHeader("content-type", "application/json");
        response.end("{malformed-session-canary");
        return;
      }
      if (mode === "baseline_oversize") {
        response.setHeader("content-type", "application/json");
        response.end(`{"padding":"${"x".repeat(17 * 1024)}"}`);
        return;
      }
      if (mode === "stuck_baseline" && sessionRequests > 1) {
        // The initial navigation completes; the same-context fetch body then stalls.
        response.setHeader("content-type", "application/json");
        response.write("{");
        hangingResponses.add(response);
        return;
      }
      response.setHeader("content-type", "application/json");
      if (signedIn) {
        const id = mode === "wrong_identity" ? "unexpected-customer-canary" : "fixture-user";
        response.end(JSON.stringify({ user: { id }, expires: SESSION_EXPIRY }));
      } else {
        response.end(signedOut ? "null" : "{}");
      }
      return;
    }
    if (path === "/login") {
      response.setHeader("content-type", "text/html");
      if (request.url?.includes("error=AccessDenied")) response.end("denied");
      else response.end("<script>setTimeout(() => { window.location.href = '/api/auth/callback/github' }, 25)</script>");
      return;
    }
    if (path === "/api/auth/callback/github") {
      const denial = mode === "denial" || mode === "callback_error_existing_session";
      response.statusCode = mode === "callback_200_location" ? 200 : 302;
      response.setHeader("x-ctcg-auth-attempt", SUPPORT_ID);
      response.setHeader("location", denial ? "/login?error=AccessDenied" : callbackLocation);
      if (!denial) response.setHeader(COMPLETION_HEADER, COMPLETION_OBSERVED);
      if (mode !== "denial") {
        response.setHeader("set-cookie", "fixture_session=1; Path=/; HttpOnly; SameSite=Lax");
      }
      response.end("callback-body-canary");
      return;
    }
    if (path === "/account" || path.startsWith("/account/")) {
      response.setHeader("content-type", "text/html");
      response.end("account");
      return;
    }
    if (path === "/api/auth/csrf") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ csrfToken: "fixture-csrf" }));
      return;
    }
    if (path === "/api/auth/signout" && request.method === "POST") {
      signoutRequests += 1;
      signedOut = true;
      response.statusCode = 200;
      response.setHeader("set-cookie", "fixture_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      response.end("{}");
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    signoutRequests: () => signoutRequests,
    sessionRequests: () => sessionRequests,
    close: async () => {
      for (const response of hangingResponses) response.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  });
}

interface FakeSessionObservation {
  readonly state: "anonymous" | "authenticated" | "unknown";
  readonly userId: string | null;
}

function fakeDependencies(input: {
  readonly sessionStates: readonly FakeSessionObservation[];
  readonly callback?: boolean;
  readonly callbackStatus?: number;
  readonly callbackLocation?: string;
  readonly completionHeader?: string | null;
  readonly landingStatus?: number;
  readonly landingPending?: boolean;
  readonly abort?: AbortController;
  readonly closeThrows?: boolean;
  readonly closePending?: boolean;
}): {
  readonly dependencies: BrowserJourneyDependencies;
  readonly closed: { context: number; browser: number };
  readonly logoutCalls: () => number;
} {
  const closed = { context: 0, browser: 0 };
  let sessionIndex = 0;
  let logoutCalls = 0;
  const callbackLocation = input.callbackLocation ?? "/account";
  const callbackHeaders: Record<string, string | undefined> = {
    "x-ctcg-auth-attempt": SUPPORT_ID,
    location: callbackLocation,
  };
  if (input.completionHeader !== null) {
    callbackHeaders[COMPLETION_HEADER] = input.completionHeader ?? COMPLETION_OBSERVED;
  }
  const callbackResponse: BrowserResponse = {
    url: () => "https://verify.example.test/api/auth/callback/github",
    status: () => input.callbackStatus ?? 302,
    headers: () => callbackHeaders,
  };
  const landingUrl = new URL(callbackLocation, "https://verify.example.test").href;
  const landingResponse: BrowserResponse = {
    url: () => landingUrl,
    status: () => input.landingStatus ?? 200,
    headers: () => ({}),
    finished: async () => null,
  };
  let responseWait = 0;
  const page: BrowserPage = {
    goto: async () => undefined,
    waitForResponse: async (predicate) => {
      responseWait += 1;
      if (responseWait === 1) {
        if (!input.callback && input.abort) {
          input.abort.abort();
          return new Promise(() => undefined);
        }
        if (!input.callback) return new Promise(() => undefined);
        if (!predicate(callbackResponse)) throw new Error("callback predicate mismatch");
        return callbackResponse;
      }
      if (input.landingPending) return new Promise(() => undefined);
      if (!predicate(landingResponse)) throw new Error("landing predicate mismatch");
      return landingResponse;
    },
    waitForURL: async (url) => {
      if (url !== landingUrl) throw new Error("landing URL mismatch");
    },
    waitForLoadState: async () => undefined,
    evaluate: async (_fn, arg) => {
      if (typeof arg === "object" && arg !== null && "url" in arg) {
        return input.sessionStates[sessionIndex++] as never;
      }
      logoutCalls += 1;
      return true as never;
    },
  };
  return {
    dependencies: {
      timeoutMs: 100,
      launcher: {
        launch: async (options) => {
          expect(options.headless).toBe(false);
          expect(options.env.AUTH_GITHUB_SECRET).toBeUndefined();
          return {
            newContext: async () => ({
              newPage: async () => page,
              close: async () => {
                closed.context += 1;
                if (input.closeThrows) throw new Error("close");
                if (input.closePending) await new Promise(() => undefined);
              },
            }),
            close: async () => {
              closed.browser += 1;
              if (input.closeThrows) throw new Error("close");
              if (input.closePending) await new Promise(() => undefined);
            },
          };
        },
      },
      environment: { PATH: "/bin", AUTH_GITHUB_SECRET: "secret-canary" },
    },
    closed,
    logoutCalls: () => logoutCalls,
  };
}

const headlessLauncher = {
  // Test-only launch override: production CLI always launches headed.
  launch: (options: { headless: false; env: Record<string, string | undefined> }) =>
    chromium.launch({ ...options, headless: true }),
};

describe("browser verification journey", () => {
  it("runs real local Chromium positive and denial redirects with fresh landing/session proof", async () => {
    const positive = await localBrowserFixture("positive");
    try {
      const positiveResult = await runBrowserJourney({
        origin: positive.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
        protectedSurfacePath: "/account",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(positiveResult).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: true,
        supportId: SUPPORT_ID,
        anonymousBaseline: true,
        identityMatchesExpected: true,
        sessionEstablished: true,
        logoutConfirmed: true,
        outcome: "completed",
      });
      expect(JSON.stringify(positiveResult)).not.toContain("fixture-user");
      expect(positive.signoutRequests()).toBe(1);
    } finally {
      await positive.close();
    }

    const denial = await localBrowserFixture("denial");
    try {
      const denialResult = await runBrowserJourney({
        origin: denial.origin,
        scenario: "expected_denial",
        expectedPublicErrorCode: "access_denied",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(denialResult).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: false,
        supportId: SUPPORT_ID,
        anonymousBaseline: true,
        expectedDenialObserved: true,
        identityMatchesExpected: false,
        sessionEstablished: false,
        logoutConfirmed: true,
        outcome: "completed",
      });
      expect(denial.signoutRequests()).toBe(0);
    } finally {
      await denial.close();
    }
  }, 30_000);

  it.each(["baseline_500", "baseline_malformed", "baseline_oversize"] as const)(
    "never promotes an unreadable %s baseline to anonymous",
    async (mode) => {
      const fixture = await localBrowserFixture(mode);
      try {
        const result = await runBrowserJourney({
          origin: fixture.origin,
          scenario: "positive_login",
          expectedCtcgUserId: "fixture-user",
        }, { launcher: headlessLauncher, timeoutMs: 5_000 });
        expect(result).toMatchObject({
          anonymousBaseline: false,
          callbackObserved: false,
          callbackSucceeded: false,
          logoutConfirmed: false,
          outcome: "failed",
        });
        expect(JSON.stringify(result)).not.toContain("session-error-canary");
        expect(JSON.stringify(result)).not.toContain("malformed-session-canary");
      } finally {
        await fixture.close();
      }
    },
    15_000,
  );

  it.each(["logout_500", "logout_malformed"] as const)(
    "never promotes an unreadable %s post-logout session to confirmed absence",
    async (mode) => {
      const fixture = await localBrowserFixture(mode);
      try {
        const result = await runBrowserJourney({
          origin: fixture.origin,
          scenario: "positive_login",
          expectedCtcgUserId: "fixture-user",
        }, { launcher: headlessLauncher, timeoutMs: 5_000 });
        expect(result).toMatchObject({
          callbackObserved: true,
          callbackSucceeded: true,
          identityMatchesExpected: true,
          sessionEstablished: true,
          logoutConfirmed: false,
          outcome: "completed",
        });
        expect(fixture.signoutRequests()).toBe(1);
      } finally {
        await fixture.close();
      }
    },
    15_000,
  );

  it("does not treat an error callback followed by an existing matching session as positive", async () => {
    const fixture = await localBrowserFixture("callback_error_existing_session");
    try {
      const result = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(result).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: false,
        identityMatchesExpected: true,
        sessionEstablished: true,
        logoutConfirmed: true,
      });
    } finally {
      await fixture.close();
    }
  }, 15_000);

  it("observes but does not accept callback HTTP 200 even when Location and marker are present", async () => {
    const fixture = await localBrowserFixture("callback_200_location");
    try {
      const result = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(result).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: false,
        identityMatchesExpected: false,
        logoutConfirmed: false,
        outcome: "completed",
      });
    } finally {
      await fixture.close();
    }
  }, 15_000);

  it("does not sign out an unexpected customer identity", async () => {
    const fixture = await localBrowserFixture("wrong_identity");
    try {
      const result = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(result).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: true,
        sessionEstablished: true,
        identityMatchesExpected: false,
        logoutConfirmed: false,
      });
      expect(fixture.signoutRequests()).toBe(0);
      expect(JSON.stringify(result)).not.toContain("unexpected-customer-canary");
    } finally {
      await fixture.close();
    }
  }, 15_000);

  it("uses the optional protected account path and rejects non-account surfaces", async () => {
    const fixture = await localBrowserFixture("positive", "/account/orders");
    try {
      const accepted = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
        protectedSurfacePath: "/account/orders",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(accepted.callbackSucceeded).toBe(true);
      expect(accepted.logoutConfirmed).toBe(true);

      const rejected = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
        protectedSurfacePath: "/api/private",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(rejected).toMatchObject({ outcome: "failed", callbackObserved: false });
    } finally {
      await fixture.close();
    }
  }, 15_000);

  it("bounds a stuck response body and cleans up the browser context", async () => {
    const fixture = await localBrowserFixture("stuck_baseline");
    const started = Date.now();
    try {
      const result = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 500 });
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(result.anonymousBaseline).toBe(false);
      expect(result.logoutConfirmed).toBe(false);
    } finally {
      await fixture.close();
    }
  }, 10_000);

  it("stays safe when callback navigation leaves the approved origin", async () => {
    const foreign = await localBrowserFixture("positive");
    const fixture = await localBrowserFixture("positive", `${foreign.origin}/account`);
    try {
      const result = await runBrowserJourney({
        origin: fixture.origin,
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, { launcher: headlessLauncher, timeoutMs: 5_000 });
      expect(result).toMatchObject({
        callbackObserved: true,
        callbackSucceeded: false,
        identityMatchesExpected: false,
        logoutConfirmed: false,
        outcome: "completed",
      });
      expect(fixture.sessionRequests()).toBe(2);
    } finally {
      await fixture.close();
      await foreign.close();
    }
  }, 15_000);

  it("requires the completion marker and a fresh successful landing for mocked positive proof", async () => {
    const fake = fakeDependencies({
      callback: true,
      sessionStates: [
        { state: "anonymous", userId: null },
        { state: "authenticated", userId: "fixture-user" },
        { state: "anonymous", userId: null },
      ],
    });
    const result = await runBrowserJourney({
      origin: "https://verify.example.test",
      scenario: "positive_login",
      expectedCtcgUserId: "fixture-user",
    }, fake.dependencies);

    expect(result).toEqual({
      callbackObserved: true,
      callbackSucceeded: true,
      supportId: SUPPORT_ID,
      baselineSessionState: "anonymous",
      resultingSessionState: "authenticated",
      finalSessionState: "anonymous",
      anonymousBaseline: true,
      expectedDenialObserved: false,
      identityMatchesExpected: true,
      sessionEstablished: true,
      logoutConfirmed: true,
      outcome: "completed",
    });
    expect(JSON.stringify(result)).not.toContain("fixture-user");
    expect(fake.closed).toEqual({ context: 1, browser: 1 });
  });

  it("does not accept a missing completion marker or failed landing response", async () => {
    for (const failure of ["marker", "landing"] as const) {
      const fake = fakeDependencies({
        callback: true,
        completionHeader: failure === "marker" ? null : COMPLETION_OBSERVED,
        landingStatus: failure === "landing" ? 500 : 200,
        sessionStates: [
          { state: "anonymous", userId: null },
          { state: "authenticated", userId: "fixture-user" },
          { state: "anonymous", userId: null },
        ],
      });
      const result = await runBrowserJourney({
        origin: "https://verify.example.test",
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, fake.dependencies);
      expect(result.callbackObserved).toBe(true);
      expect(result.callbackSucceeded).toBe(false);
      if (failure === "marker") {
        expect(result.identityMatchesExpected).toBe(true);
        expect(result.logoutConfirmed).toBe(true);
      } else {
        expect(result.identityMatchesExpected).toBe(false);
        expect(result.logoutConfirmed).toBe(false);
      }
    }
  });

  it("requires an observed anonymous session for an expected denial", async () => {
    const anonymous = fakeDependencies({
      callback: true,
      callbackStatus: 302,
      callbackLocation: "/login?error=AccessDenied",
      completionHeader: null,
      sessionStates: [
        { state: "anonymous", userId: null },
        { state: "anonymous", userId: null },
        { state: "anonymous", userId: null },
      ],
    });
    const passed = await runBrowserJourney({
      origin: "https://verify.example.test",
      scenario: "expected_denial",
      expectedPublicErrorCode: "access_denied",
      expectedCtcgUserId: "fixture-user",
    }, anonymous.dependencies);
    expect(passed.expectedDenialObserved).toBe(true);
    expect(passed.logoutConfirmed).toBe(true);

    const unknown = fakeDependencies({
      callback: true,
      callbackStatus: 302,
      callbackLocation: "/login?error=AccessDenied",
      completionHeader: null,
      sessionStates: [
        { state: "anonymous", userId: null },
        { state: "unknown", userId: null },
      ],
    });
    const failed = await runBrowserJourney({
      origin: "https://verify.example.test",
      scenario: "expected_denial",
      expectedPublicErrorCode: "access_denied",
      expectedCtcgUserId: "fixture-user",
    }, unknown.dependencies);
    expect(failed.expectedDenialObserved).toBe(false);
    expect(failed.logoutConfirmed).toBe(false);
  });

  it("bounds callback and landing waits and still closes the temporary browser", async () => {
    for (const landingPending of [false, true]) {
      const fake = fakeDependencies({
        callback: landingPending,
        landingPending,
        closeThrows: true,
        sessionStates: [{ state: "anonymous", userId: null }],
      });
      const result = await runBrowserJourney({
        origin: "https://verify.example.test",
        scenario: "positive_login",
        expectedCtcgUserId: "fixture-user",
      }, fake.dependencies);
      expect(result.outcome).toBe("timed_out");
      expect(result.anonymousBaseline).toBe(true);
      expect(result.callbackObserved).toBe(landingPending);
      expect(fake.closed).toEqual({ context: 1, browser: 1 });
    }
  });

  it("does not wait forever for context or browser cleanup", async () => {
    const fake = fakeDependencies({
      callback: true,
      closePending: true,
      sessionStates: [
        { state: "anonymous", userId: null },
        { state: "authenticated", userId: "fixture-user" },
        { state: "anonymous", userId: null },
      ],
    });
    const started = Date.now();
    const result = await runBrowserJourney({
      origin: "https://verify.example.test",
      scenario: "positive_login",
      expectedCtcgUserId: "fixture-user",
    }, fake.dependencies);
    expect(result.outcome).toBe("completed");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(fake.closed).toEqual({ context: 1, browser: 1 });
  });

  it("cancels the bounded human wait and closes the temporary context", async () => {
    const controller = new AbortController();
    const fake = fakeDependencies({
      callback: false,
      abort: controller,
      sessionStates: [{ state: "anonymous", userId: null }],
    });
    const result = await runBrowserJourney({
      origin: "https://verify.example.test",
      scenario: "positive_login",
      expectedCtcgUserId: "fixture-user",
    }, { ...fake.dependencies, signal: controller.signal });

    expect(result.outcome).toBe("cancelled");
    expect(fake.closed).toEqual({ context: 1, browser: 1 });
  });

  it("uses a credential-free browser process environment", () => {
    expect(browserProcessEnvironment({ PATH: "/bin", AUTH_GITHUB_SECRET: "secret-canary" }))
      .toEqual(expect.objectContaining({ PATH: "/bin" }));
    expect(browserProcessEnvironment({ AUTH_GITHUB_SECRET: "secret-canary" }))
      .not.toHaveProperty("AUTH_GITHUB_SECRET");
  });
});

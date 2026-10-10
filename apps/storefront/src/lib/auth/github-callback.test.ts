import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { NextAuthConfig } from "next-auth";

// Resolve the exact core bundled with NextAuth without relying on a transitive
// package being hoisted. NextAuth's Next.js wrapper needs the Next runtime;
// these Web Request/Response tests exercise its underlying real Auth handler.
const require = createRequire(import.meta.url);
const corePath = createRequire(require.resolve("next-auth")).resolve("@auth/core");
const { Auth } = await import(/* @vite-ignore */ pathToFileURL(corePath).href) as {
  Auth: (request: Request, config: NextAuthConfig) => Promise<Response>;
};
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";

const db = vi.hoisted(() => ({
  getUserByAccount: vi.fn(),
  getUserByEmail: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  linkAccount: vi.fn(),
  createSession: vi.fn(),
  getSessionAndUser: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock("./adapter", () => ({
  PgAdapter: () => db,
  accountExistsForSignIn: async (email: string) => Boolean(await db.getUserByEmail(email)),
  magicLinkRequestCapacity: vi.fn(),
}));

import { createGitHubProvider } from "./github";
import { createAdmissionSignInCallback, getGitHubSessionUserId } from "./admission";
import {
  addGitHubVerificationHeaders,
  addSupportIdToGitHubFailureRedirect,
  recordAuthJsErrorType,
  recordGitHubVerificationEvent,
  withGitHubVerificationAttempt,
  type VerificationAttemptSummary,
  type VerificationObserver,
} from "./verification-observer";
import { AUTH_COMPLETION_HEADER, AUTH_COMPLETION_OBSERVED } from "@/lib/verification/events";

const ORIGIN = "http://localhost:3001";
const DESTINATION = `${ORIGIN}/account/collection?view=grid`;
const users = new Map<string, AdapterUser>();
const accounts: AdapterAccount[] = [];
const sessions = new Map<string, AdapterSession>();
let emailRows: unknown;
let emailStatus: number;
let profile: Record<string, unknown>;
let externalFetch: ReturnType<typeof vi.fn>;

function addUser(id: string, email: string) {
  const user: AdapterUser = { id, email, emailVerified: new Date(), name: id, image: null };
  users.set(id, user);
  return user;
}

function summaryObserver(summaries: VerificationAttemptSummary[]): VerificationObserver {
  return {
    record: () => undefined,
    currentSupportId: () => null,
    emit: (summary) => summaries.push(summary),
  };
}

async function observeCoreCallback(
  request: Request,
  handle: (request: Request) => Promise<Response>,
  observer: VerificationObserver,
): Promise<Response> {
  return withGitHubVerificationAttempt("callback", async () => {
    const response = await handle(request);
    const location = response.headers.get("location");
    try {
      const redirect = location ? new URL(location, request.url) : null;
      const errorType = redirect && (redirect.pathname === "/login" || redirect.pathname === "/login/error")
        ? redirect.searchParams.get("error")
        : null;
      if (errorType) recordAuthJsErrorType(errorType);
      else if (redirect) recordGitHubVerificationEvent("response_observed");
      else recordAuthJsErrorType(undefined);
    } catch {
      recordAuthJsErrorType(undefined);
    }
    return addSupportIdToGitHubFailureRedirect(
      request,
      addGitHubVerificationHeaders(response, { includeSupportId: true }),
    );
  }, observer);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ACCOUNT_ADMISSION_MODE", "");
  users.clear();
  accounts.length = 0;
  sessions.clear();
  profile = { id: 12345, login: "collector", name: "Collector", email: "unchecked@example.com", avatar_url: null };
  emailRows = [{ email: " Existing@Example.com ", verified: true, primary: true }];
  emailStatus = 200;
  db.getUserByEmail.mockImplementation(async (email) => [...users.values()].find((u) => u.email === email) ?? null);
  db.getUser.mockImplementation(async (id) => users.get(id) ?? null);
  db.getUserByAccount.mockImplementation(async ({ provider, providerAccountId }) => {
    const account = accounts.find((a) => a.provider === provider && a.providerAccountId === providerAccountId);
    return account ? users.get(account.userId) ?? null : null;
  });
  db.createUser.mockImplementation(async (data) => {
    const user = { ...data, id: `new-${users.size}` };
    users.set(user.id, user);
    return user;
  });
  db.linkAccount.mockImplementation(async (account) => { accounts.push(account); return account; });
  db.createSession.mockImplementation(async (session) => { sessions.set(session.sessionToken, session); return session; });
  db.getSessionAndUser.mockImplementation(async (token) => {
    const session = sessions.get(token);
    return session ? { session, user: users.get(session.userId) } : null;
  });
  externalFetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: "test-access-token", refresh_token: "test-refresh-token", token_type: "bearer", scope: "read:user user:email" });
    }
    if (url === "https://api.github.com/user") return Response.json(profile);
    if (url.startsWith("https://api.github.com/user/emails")) return Response.json(emailRows, { status: emailStatus });
    throw new Error("Unexpected external request in OAuth test");
  });
  vi.stubGlobal("fetch", externalFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Exercise the public Auth.js handlers: CSRF -> sign-in -> state/PKCE cookies ->
// OAuth callback -> provider mapping -> admission -> adapter. Only HTTP to GitHub
// and database storage are mocked; callback ordering and account linking are real.
async function roundTrip(options: {
  sessionToken?: string;
  state?: string;
  error?: string;
  omitPkceCookie?: boolean;
  observer?: VerificationObserver;
} = {}) {
  const provider = createGitHubProvider({ AUTH_GITHUB_ID: "test-client", AUTH_GITHUB_SECRET: "test-secret" });
  if (!provider) throw new Error("Test GitHub provider was not configured");
  const config: NextAuthConfig = {
    basePath: "/api/auth",
    providers: [provider],
    adapter: db as Adapter,
    secret: "github-callback-test-secret-not-a-real-credential",
    trustHost: true,
    useSecureCookies: false,
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/login", error: "/login/error" },
    events: { signIn: () => recordGitHubVerificationEvent("authjs_signin_completed") },
    logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
  const handle = (request: Request) => Auth(request, {
    ...config,
    callbacks: {
      signIn: createAdmissionSignInCallback(() => getGitHubSessionUserId(request, {
        useSecureCookies: config.useSecureCookies,
        cookieName: config.cookies?.sessionToken?.name,
      })),
    },
  });
  const handlers = { GET: handle, POST: handle };
  const cookies = new Map<string, string>();
  if (options.sessionToken) cookies.set("authjs.session-token", options.sessionToken);
  const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  const absorb = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0];
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const csrfResponse = await handlers.GET(new Request(`${ORIGIN}/api/auth/csrf`, { headers: { cookie: cookieHeader() } }));
  absorb(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const signIn = await handlers.POST(new Request(`${ORIGIN}/api/auth/signin/github`, {
    method: "POST",
    headers: { cookie: cookieHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: DESTINATION }),
  }));
  absorb(signIn);
  expect(signIn.status).toBe(302);
  const authorization = new URL(signIn.headers.get("location")!);
  expect(authorization.origin).toBe("https://github.com");
  const params = new URLSearchParams({ code: "test-code", state: options.state ?? authorization.searchParams.get("state")! });
  if (options.error) params.set("error", options.error);
  if (options.omitPkceCookie) cookies.delete("authjs.pkce.code_verifier");
  const callbackRequest = new Request(`${ORIGIN}/api/auth/callback/github?${params}`, {
    headers: { cookie: cookieHeader() },
  });
  return options.observer
    ? observeCoreCallback(callbackRequest, handlers.GET, options.observer)
    : handlers.GET(callbackRequest);
}

function expectNoWrites() {
  for (const method of [db.createUser, db.updateUser, db.linkAccount, db.createSession, db.updateSession, db.deleteSession]) {
    expect(method).not.toHaveBeenCalled();
  }
}

describe("GitHub through the installed Auth.js callback", () => {
  it("links a verified matching email while registration is paused, without persisting tokens", async () => {
    addUser("existing", "existing@example.com");
    const response = await roundTrip();
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(db.createUser).not.toHaveBeenCalled();
    expect(db.linkAccount).toHaveBeenCalledExactlyOnceWith({ provider: "github", providerAccountId: "12345", type: "oauth", userId: "existing" });
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "existing" }));
    expect(response.headers.getSetCookie().some((c) => c.startsWith("authjs.session-token="))).toBe(true);
    expect(externalFetch).toHaveBeenCalledTimes(3);
  });

  it("blocks a new identity before writes with the branded registration pause", async () => {
    const response = await roundTrip();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login/error?error=RegistrationPaused`);
    expectNoWrites();
  });

  it("creates a new account only when the existing reviewed admission mode is enabled", async () => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "reviewed-adult-terms-v1");
    const response = await roundTrip();
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(db.createUser).toHaveBeenCalledOnce();
    expect(db.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "existing@example.com" }));
    expect(accounts[0]).not.toHaveProperty("access_token");
    expect(accounts[0]).not.toHaveProperty("refresh_token");
    expect(db.createSession).toHaveBeenCalledOnce();
  });

  it("keeps a linked GitHub ID on its original user even when its email now matches someone else", async () => {
    addUser("original", "old@example.com");
    addUser("other", "existing@example.com");
    accounts.push({ provider: "github", providerAccountId: "12345", type: "oauth", userId: "original" });
    const response = await roundTrip();
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "original" }));
    expect(db.createUser).not.toHaveBeenCalled();
    expect(db.linkAccount).not.toHaveBeenCalled();
  });

  it("does not attach a first GitHub link to a session whose email belongs to a different user", async () => {
    addUser("session-user", "a@example.com");
    addUser("email-user", "existing@example.com");
    sessions.set("current-session", { sessionToken: "current-session", userId: "session-user", expires: new Date(Date.now() + 60_000) });
    const response = await roundTrip({ sessionToken: "current-session" });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login/error");
    expectNoWrites();
  });

  it("does not let an expired stored session bypass the first-link account boundary", async () => {
    addUser("session-user", "a@example.com");
    addUser("email-user", "existing@example.com");
    sessions.set("expired-session", { sessionToken: "expired-session", userId: "session-user", expires: new Date(Date.now() - 60_000) });
    const response = await roundTrip({ sessionToken: "expired-session" });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login/error");
    expectNoWrites();
  });

  it("does not implicitly link a different new email to a current session when registration is open", async () => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "reviewed-adult-terms-v1");
    addUser("session-user", "a@example.com");
    sessions.set("current-session", { sessionToken: "current-session", userId: "session-user", expires: new Date(Date.now() + 60_000) });
    const response = await roundTrip({ sessionToken: "current-session" });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login/error");
    expectNoWrites();
  });

  it("can first-link GitHub when the current session is the verified-email target", async () => {
    addUser("existing", "existing@example.com");
    sessions.set("current-session", { sessionToken: "current-session", userId: "existing", expires: new Date(Date.now() + 60_000) });
    const response = await roundTrip({ sessionToken: "current-session" });
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(db.linkAccount).toHaveBeenCalledExactlyOnceWith({ provider: "github", providerAccountId: "12345", type: "oauth", userId: "existing" });
    expect(db.createUser).not.toHaveBeenCalled();
    expect(db.createSession).not.toHaveBeenCalled();
  });

  it("does not attach someone else's linked GitHub identity to the current session", async () => {
    addUser("original", "old@example.com");
    addUser("other", "existing@example.com");
    accounts.push({ provider: "github", providerAccountId: "12345", type: "oauth", userId: "original" });
    sessions.set("other-session", { sessionToken: "other-session", userId: "other", expires: new Date(Date.now() + 60_000) });
    const response = await roundTrip({ sessionToken: "other-session" });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=OAuthAccountNotLinked`);
    expectNoWrites();
  });

  it("marks the actual Auth.js sign-in milestone without claiming a browser journey", async () => {
    addUser("existing", "existing@example.com");
    const summaries: VerificationAttemptSummary[] = [];
    const response = await roundTrip({ observer: summaryObserver(summaries) });
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(response.headers.get(AUTH_COMPLETION_HEADER)).toBe(AUTH_COMPLETION_OBSERVED);
    expect(summaries[0].events).toContainEqual({ code: "authjs_signin_completed" });
    expect(JSON.stringify(summaries)).not.toContain("journey_verified");
  });

  it.each([
    {
      errorType: "AccessDenied",
      category: "access_denied",
      stageCode: "first_link_session_target_mismatch",
      arrange: () => {
        addUser("session-user", "a@example.com");
        addUser("email-user", "existing@example.com");
        sessions.set("current-session", {
          sessionToken: "current-session",
          userId: "session-user",
          expires: new Date(Date.now() + 60_000),
        });
        return "current-session";
      },
    },
    {
      errorType: "OAuthAccountNotLinked",
      category: "oauth_account_not_linked",
      stageCode: "established_link",
      arrange: () => {
        addUser("original", "old@example.com");
        addUser("other", "existing@example.com");
        accounts.push({ provider: "github", providerAccountId: "12345", type: "oauth", userId: "original" });
        sessions.set("other-session", {
          sessionToken: "other-session",
          userId: "other",
          expires: new Date(Date.now() + 60_000),
        });
        return "other-session";
      },
    },
  ])("keeps immutable Auth.js $errorType redirects diagnosable", async ({ errorType, category, stageCode, arrange }) => {
    const summaries: VerificationAttemptSummary[] = [];
    const response = await roundTrip({
      sessionToken: arrange(),
      observer: summaryObserver(summaries),
    });

    const supportId = response.headers.get("x-ctcg-auth-attempt");
    const destination = new URL(response.headers.get("location")!);
    expect(destination.searchParams.get("error")).toBe(errorType);
    expect(response.headers.get(AUTH_COMPLETION_HEADER)).toBeNull();
    expect(destination.searchParams.get("support")).toBe(supportId);
    expect(supportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].support_id).toBe(supportId);
    expect(summaries[0].events).toContainEqual({ code: "authjs_denial", category });
    expect(summaries[0].events).toContainEqual({ code: stageCode });
    const diagnostic = JSON.stringify(summaries[0]);
    for (const privateValue of ["a@example.com", "existing@example.com", "old@example.com", "session-user", "email-user", "current-session", "other-session", "test-access-token", "test-refresh-token"]) {
      expect(diagnostic).not.toContain(privateValue);
    }
    expectNoWrites();
  });

  it.each(["unverified", "http-error", "malformed"])("fails closed on %s email evidence even with registration open", async (failure) => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "reviewed-adult-terms-v1");
    addUser("existing", "existing@example.com");
    profile.email = "existing@example.com";
    emailRows = failure === "malformed" ? { message: "not an email list" } : [{ email: "existing@example.com", primary: true, verified: false }];
    if (failure === "http-error") emailStatus = 503;
    const response = await roundTrip();
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/login/error");
    expect(destination.searchParams.get("error")).toBe("Configuration");
    expectNoWrites();
  });

  it("retains Auth.js state validation before contacting the token endpoint", async () => {
    const response = await roundTrip({ state: "wrong-state" });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login/error");
    expect(externalFetch).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("retains PKCE cookie validation before contacting the token endpoint", async () => {
    const response = await roundTrip({ omitPkceCookie: true });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login/error");
    expect(externalFetch).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("handles provider cancellation without any database writes", async () => {
    const response = await roundTrip({ error: "access_denied" });
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("OAuthCallbackError");
    expect(externalFetch).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

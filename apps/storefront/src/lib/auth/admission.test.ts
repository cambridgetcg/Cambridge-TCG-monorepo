import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountExists: vi.fn(),
  capacity: vi.fn(),
  getUserByAccount: vi.fn(),
  getUserByEmail: vi.fn(),
  getSessionAndUser: vi.fn(),
}));

vi.mock("./adapter", () => ({
  accountExistsForSignIn: mocks.accountExists,
  magicLinkRequestCapacity: mocks.capacity,
  PgAdapter: () => ({
    getUserByAccount: mocks.getUserByAccount,
    getUserByEmail: mocks.getUserByEmail,
    getSessionAndUser: mocks.getSessionAndUser,
  }),
}));

import {
  MAGIC_LINK_RESPONSE_FLOOR_MS,
  MAGIC_LINK_SUCCESS_REDIRECT,
  REGISTRATION_PAUSED_REDIRECT,
  admissionSignInCallback as contextlessAdmissionSignInCallback,
  createAdmissionSignInCallback,
  getGitHubSessionUserId,
  googleSignInDecision,
  magicLinkSignInDecision,
  waitForMagicLinkResponseFloor,
} from "./admission";
import { ACCOUNT_ADMISSION_REVIEWED_MODE } from "@/lib/release/production-gates";
import { fetchVerifiedGitHubProfile } from "./github";

const admissionSignInCallback = createAdmissionSignInCallback(async () => null);

const AVAILABLE_CAPACITY = {
  allowed: true,
  reason: null,
  emailActiveCount: 0,
  globalActiveCount: 0,
  retryAfterSeconds: 0,
};

type SignInParams = Parameters<
  NonNullable<NonNullable<NextAuthConfig["callbacks"]>["signIn"]>
>[0];

beforeEach(() => {
  mocks.accountExists.mockReset();
  mocks.capacity.mockReset();
  mocks.getUserByAccount.mockReset();
  mocks.getUserByAccount.mockResolvedValue(null);
  mocks.getUserByEmail.mockReset();
  mocks.getUserByEmail.mockResolvedValue(null);
  mocks.getSessionAndUser.mockReset();
  mocks.getSessionAndUser.mockResolvedValue(null);
  mocks.capacity.mockResolvedValue(AVAILABLE_CAPACITY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("magic-link admission decision", () => {
  it("uses ordinary Auth.js success for an unknown account while admission is paused", async () => {
    mocks.accountExists.mockResolvedValue(false);

    await expect(magicLinkSignInDecision("unknown@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: "paused",
    })).resolves.toBe(MAGIC_LINK_SUCCESS_REDIRECT);

    expect(mocks.capacity).toHaveBeenCalledWith("unknown@example.com");
    expect(mocks.accountExists).toHaveBeenCalledWith("unknown@example.com");
  });

  it("preserves existing-user sign-in while admission is paused", async () => {
    mocks.accountExists.mockResolvedValue(true);

    await expect(magicLinkSignInDecision("existing@example.com", {
      NODE_ENV: "production",
    })).resolves.toBe(true);
  });

  it("allows new-account email issuance only under the exact reviewed mode", async () => {
    await expect(magicLinkSignInDecision("new@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).resolves.toBe(true);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("hides address-specific token capacity behind ordinary Auth.js success", async () => {
    mocks.capacity.mockResolvedValue({
      allowed: false,
      reason: "email",
      emailActiveCount: 5,
      globalActiveCount: 25,
      retryAfterSeconds: 3600,
    });

    await expect(magicLinkSignInDecision("existing@example.com", {
      NODE_ENV: "production",
    })).resolves.toBe(MAGIC_LINK_SUCCESS_REDIRECT);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });
});

describe("Google admission callback", () => {
  function callbackParams(email: string | null): SignInParams {
    return {
      user: {
        id: "google-profile",
        name: "Collector",
        email,
        emailVerified: null,
        image: null,
      },
      account: {
        provider: "google",
        type: "oidc",
        providerAccountId: "google-profile",
      },
      profile: {},
    } as SignInParams;
  }

  it("allows Google sign-in for an existing email while admission is paused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockResolvedValue(true);

    await expect(admissionSignInCallback(
      callbackParams("existing@example.com"),
    )).resolves.toBe(true);

    expect(mocks.accountExists).toHaveBeenCalledWith("existing@example.com");
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("redirects a first-time Google email before Auth.js may write", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockResolvedValue(false);

    await expect(admissionSignInCallback(
      callbackParams("new@example.com"),
    )).resolves.toBe(REGISTRATION_PAUSED_REDIRECT);

    expect(mocks.accountExists).toHaveBeenCalledWith("new@example.com");
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("fails a missing Google email closed and opens only after exact review", async () => {
    await expect(googleSignInDecision(null, {
      NODE_ENV: "production",
    })).resolves.toBe(REGISTRATION_PAUSED_REDIRECT);

    await expect(googleSignInDecision("new@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).resolves.toBe(true);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("is the signIn callback wired into the deployed Auth.js config", () => {
    const authConfig = readFileSync(
      resolve(process.cwd(), "src/lib/auth/index.ts"),
      "utf8",
    );

    expect(authConfig).toContain("signIn: admissionSignInCallback");
    expect(authConfig).toContain("NextAuth((request) => ({");
    expect(authConfig).toContain("signIn: createAdmissionSignInCallback(() => getGitHubSessionUserId(request");
  });
});

describe("GitHub admission callback", () => {
  async function callbackParams(email = "current@example.com"): Promise<SignInParams> {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 12345, login: "collector", email: null }))
      .mockResolvedValueOnce(Response.json([{ email, primary: true, verified: true }])));
    const profile = await fetchVerifiedGitHubProfile("test-bearer");
    return {
      user: { id: "stored-user", email: "stored@example.com", name: "Collector", image: null, emailVerified: null },
      account: { provider: "github", type: "oauth", providerAccountId: "12345" },
      profile,
    } as SignInParams;
  }

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
  });

  it("allows linked identity after email changes without matching or moving by today's email", async () => {
    mocks.getUserByAccount.mockResolvedValue({ id: "stored-user", email: "stored@example.com" });
    mocks.accountExists.mockResolvedValue(true); // today's email could belong to somebody else
    await expect(admissionSignInCallback(await callbackParams())).resolves.toBe(true);
    expect(mocks.getUserByAccount).toHaveBeenCalledWith({ provider: "github", providerAccountId: "12345" });
    expect(mocks.accountExists).not.toHaveBeenCalled();
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("allows verified same-email linking only after finding no existing provider link", async () => {
    mocks.accountExists.mockResolvedValue(true);
    await expect(admissionSignInCallback(await callbackParams(" Match@Example.com "))).resolves.toBe(true);
    expect(mocks.accountExists).toHaveBeenCalledWith("match@example.com");
    expect(mocks.getUserByAccount.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.accountExists.mock.invocationCallOrder[0]);
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("returns branded pause for a genuinely new verified identity before Auth.js writes", async () => {
    mocks.accountExists.mockResolvedValue(false);
    await expect(admissionSignInCallback(await callbackParams())).resolves.toBe(REGISTRATION_PAUSED_REDIRECT);
    expect(mocks.getUserByAccount).toHaveBeenCalledOnce();
    expect(mocks.accountExists).toHaveBeenCalledWith("current@example.com");
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("allows new verified identities under the exact reviewed mode", async () => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", ACCOUNT_ADMISSION_REVIEWED_MODE);
    await expect(admissionSignInCallback(await callbackParams())).resolves.toBe(true);
    expect(mocks.getUserByAccount).toHaveBeenCalledOnce();
    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it.each(["paused", ACCOUNT_ADMISSION_REVIEWED_MODE])("rejects a first link to a different browser account in mode %s", async (mode) => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", mode);
    mocks.getUserByEmail.mockResolvedValue({ id: "email-owner" });
    const callback = createAdmissionSignInCallback(async () => "session-owner");
    await expect(callback(await callbackParams())).resolves.toBe(false);
    expect(mocks.getUserByEmail).toHaveBeenCalledWith("current@example.com");
    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("does not attach an unknown email to the current session even when admission is open", async () => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", ACCOUNT_ADMISSION_REVIEWED_MODE);
    const callback = createAdmissionSignInCallback(async () => "session-owner");
    await expect(callback(await callbackParams())).resolves.toBe(false);
  });

  it("allows a first link when verified-email target is the current session's user", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: "session-owner" });
    const callback = createAdmissionSignInCallback(async () => "session-owner");
    await expect(callback(await callbackParams())).resolves.toBe(true);
  });

  it("does not impose today's email target on an established provider link", async () => {
    mocks.getUserByAccount.mockResolvedValue({ id: "session-owner", email: "old@example.com" });
    mocks.getUserByEmail.mockResolvedValue({ id: "other-user" });
    const callback = createAdmissionSignInCallback(async () => "session-owner");
    await expect(callback(await callbackParams())).resolves.toBe(true);
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects GitHub without request-scoped session lookup", async () => {
    await expect(contextlessAdmissionSignInCallback(await callbackParams())).resolves.toBe(false);
    expect(mocks.getUserByAccount).not.toHaveBeenCalled();
  });

  it("propagates session lookup failure without permitting the link", async () => {
    const callback = createAdmissionSignInCallback(async () => { throw new Error("session read failed"); });
    await expect(callback(await callbackParams())).rejects.toThrow("session read failed");
    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it.each(["paused", ACCOUNT_ADMISSION_REVIEWED_MODE])("rejects missing and forged evidence even in mode %s", async (mode) => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", mode);
    const params = await callbackParams();
    for (const profile of [undefined, {}, {
      id: 12345, email: "current@example.com", email_verified: true,
      ctcgVerifiedGitHubEmail: {
        source: "authenticated-github-email-list", providerAccountId: "12345", email: "current@example.com",
      },
    }]) {
      await expect(admissionSignInCallback({
        ...params, profile: profile as unknown as SignInParams["profile"],
      })).resolves.toBe(false);
    }
    expect(mocks.getUserByAccount).not.toHaveBeenCalled();
    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("rejects inconsistent raw email or provider ID before lookup, even during reviewed admission", async () => {
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", ACCOUNT_ADMISSION_REVIEWED_MODE);
    const params = await callbackParams();
    await expect(admissionSignInCallback({
      ...params, profile: { ...params.profile, email: "other@example.com" },
    })).resolves.toBe(false);
    await expect(admissionSignInCallback({
      ...params, account: { ...params.account!, providerAccountId: "67890" },
    })).resolves.toBe(false);
    expect(mocks.getUserByAccount).not.toHaveBeenCalled();
    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("rejects a non-OAuth GitHub account instead of falling through", async () => {
    const params = await callbackParams();
    await expect(admissionSignInCallback({
      ...params, account: { ...params.account!, type: "oidc" },
    })).resolves.toBe(false);
  });

  it("fails closed on provider-link lookup failure rather than guessing from email", async () => {
    mocks.getUserByAccount.mockRejectedValue(new Error("lookup failed"));
    await expect(admissionSignInCallback(await callbackParams())).rejects.toThrow("lookup failed");
    expect(mocks.accountExists).not.toHaveBeenCalled();
  });
});

describe("GitHub request-scoped browser session", () => {
  const active = () => ({
    user: { id: "session-owner" },
    session: { expires: new Date(Date.now() + 60_000) },
  });

  beforeEach(() => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    mocks.getSessionAndUser.mockResolvedValue(active());
  });

  it.each([
    ["https://example.com/api/auth/callback/github", "secure-token"],
    ["http://localhost:3001/api/auth/callback/github", "http-token"],
  ])("uses only the cookie selected by request scheme %s", async (url, token) => {
    const request = new Request(url, { headers: {
      cookie: "__Secure-authjs.session-token=secure-token; authjs.session-token=http-token",
    } });
    await expect(getGitHubSessionUserId(request)).resolves.toBe("session-owner");
    expect(mocks.getSessionAndUser).toHaveBeenCalledExactlyOnceWith(token);
  });

  it.each(["AUTH_URL", "NEXTAUTH_URL"])("honors %s scheme rewriting of the original request", async (name) => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv(name, "https://public.example.com");
    const request = new Request("http://internal:3001/api/auth/callback/github", { headers: {
      cookie: "__Secure-authjs.session-token=secure-token; authjs.session-token=http-token",
    } });
    await expect(getGitHubSessionUserId(request)).resolves.toBe("session-owner");
    expect(mocks.getSessionAndUser).toHaveBeenCalledExactlyOnceWith("secure-token");
  });

  it("prefers AUTH_URL over NEXTAUTH_URL and honors explicit useSecureCookies", async () => {
    vi.stubEnv("AUTH_URL", "http://example.com");
    vi.stubEnv("NEXTAUTH_URL", "https://example.com");
    const request = new Request("https://internal.example.com", { headers: {
      cookie: "__Secure-authjs.session-token=secure-token; authjs.session-token=http-token",
    } });
    await getGitHubSessionUserId(request);
    expect(mocks.getSessionAndUser).toHaveBeenLastCalledWith("http-token");
    await getGitHubSessionUserId(request, { useSecureCookies: true });
    expect(mocks.getSessionAndUser).toHaveBeenLastCalledWith("secure-token");
  });

  it("honors explicit cookie override and reconstructs Auth.js cookie chunks", async () => {
    const request = new Request("https://example.com", { headers: {
      cookie: "custom-session.1=two; custom-session.0=one; __Secure-authjs.session-token=wrong",
    } });
    await expect(getGitHubSessionUserId(request, { cookieName: "custom-session" })).resolves.toBe("session-owner");
    expect(mocks.getSessionAndUser).toHaveBeenCalledExactlyOnceWith("onetwo");
  });

  it("does not treat Authorization as a browser session or query when the cookie is absent", async () => {
    const request = new Request("https://example.com", { headers: { authorization: "Bearer bearer-token" } });
    await expect(getGitHubSessionUserId(request)).resolves.toBeNull();
    expect(mocks.getSessionAndUser).not.toHaveBeenCalled();
  });

  it("treats absent database session as signed out, but rejects a returned expired session", async () => {
    const request = new Request("https://example.com", { headers: { cookie: "__Secure-authjs.session-token=token" } });
    mocks.getSessionAndUser.mockResolvedValueOnce(null);
    await expect(getGitHubSessionUserId(request)).resolves.toBeNull();
    mocks.getSessionAndUser.mockResolvedValueOnce({ ...active(), session: { expires: new Date(0) } });
    await expect(getGitHubSessionUserId(request)).rejects.toThrow("Invalid GitHub browser session");
  });

  it("fails closed when there is no request rather than guessing signed out", async () => {
    await expect(getGitHubSessionUserId(undefined)).rejects.toThrow("Missing GitHub callback request");
  });
});

describe("Auth.js external response equivalence", () => {
  it("gives unknown and eligible existing addresses identical status, body and headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockImplementation(
      async (email: string) => email === "existing@example.com",
    );
    const sendVerificationRequest = vi.fn().mockResolvedValue(undefined);
    const createVerificationToken = vi.fn(async (token) => token);
    const createUser = vi.fn();
    const existingUser: AdapterUser = {
      id: "existing-user",
      name: null,
      email: "existing@example.com",
      emailVerified: null,
      image: null,
    };
    const adapter = {
      getUserByEmail: vi.fn(async (email: string) => (
        email === existingUser.email ? existingUser : null
      )),
      createVerificationToken,
      useVerificationToken: vi.fn(async () => null),
      createUser,
    } as unknown as Adapter;
    // Resolve Auth.js from next-auth's declared dependency. It is deliberately
    // not a direct application dependency, so resolving from the owning
    // package keeps this integration check honest under pnpm isolation.
    const nextAuthPackage = createRequire(import.meta.url).resolve(
      "next-auth/package.json",
    );
    const coreEntry = createRequire(nextAuthPackage).resolve("@auth/core");
    const core = await import(/* @vite-ignore */ pathToFileURL(coreEntry).href) as {
      Auth: (request: Request, config: unknown) => Promise<Response>;
      skipCSRFCheck: symbol;
    };
    const config = {
      basePath: "/api/auth",
      providers: [
        {
          id: "email",
          name: "Email",
          type: "email",
          from: "noreply@cambridgetcg.com",
          maxAge: 86_400,
          sendVerificationRequest,
        },
      ],
      adapter,
      secret: "test-secret-test-secret-test-secret",
      trustHost: true,
      skipCSRFCheck: core.skipCSRFCheck,
      callbacks: {
        signIn: admissionSignInCallback,
      },
    };

    async function requestShape(email: string) {
      const response = await core.Auth(
        new Request("https://cambridgetcg.com/api/auth/signin/email", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            email,
            callbackUrl: "/account",
          }),
        }),
        config,
      );
      return {
        status: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
      };
    }

    const unknown = await requestShape("unknown@example.com");
    const existing = await requestShape("existing@example.com");

    expect(unknown).toEqual(existing);
    expect(unknown).toEqual({
      status: 302,
      body: "",
      headers: {
        location:
          "https://cambridgetcg.com/api/auth/verify-request?provider=email&type=email",
        "set-cookie":
          "__Secure-authjs.callback-url=https%3A%2F%2Fcambridgetcg.com%2Faccount; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    });
    expect(sendVerificationRequest).toHaveBeenCalledOnce();
    expect(sendVerificationRequest.mock.calls[0]?.[0]).toMatchObject({
      identifier: "existing@example.com",
    });
    expect(createVerificationToken).toHaveBeenCalledOnce();
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("magic-link response timing class", () => {
  it("pads production, unset and unrecognised runtimes to the response floor", async () => {
    for (const env of [
      { NODE_ENV: "production" },
      {},
      { NODE_ENV: "staging" },
    ]) {
      const wait = vi.fn().mockResolvedValue(undefined);

      await waitForMagicLinkResponseFloor(100, env, () => 300, wait);

      expect(wait).toHaveBeenCalledWith(MAGIC_LINK_RESPONSE_FLOOR_MS - 200);
    }
  });

  it("does not delay tests or development, or add time after the floor", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);

    await waitForMagicLinkResponseFloor(100, { NODE_ENV: "test" }, () => 200, wait);
    await waitForMagicLinkResponseFloor(100, { NODE_ENV: "development" }, () => 200, wait);
    await waitForMagicLinkResponseFloor(
      100,
      { NODE_ENV: "production" },
      () => 100 + MAGIC_LINK_RESPONSE_FLOOR_MS,
      wait,
    );

    expect(wait).not.toHaveBeenCalled();
  });
});

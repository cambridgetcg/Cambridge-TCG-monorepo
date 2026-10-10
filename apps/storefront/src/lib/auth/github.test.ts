import type { GitHubProfile } from "next-auth/providers/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubProvider,
  fetchVerifiedGitHubProfile,
  getVerifiedGitHubIdentity,
} from "./github";

const fetchMock = vi.fn<typeof fetch>();
const USER = {
  id: 12345,
  login: "collector",
  name: "Collector",
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  email: "public-unverified@example.com",
};
const EMAILS = [{ email: "verified@example.com", primary: true, verified: true }];

function responses(user: unknown = USER, emails: unknown = EMAILS) {
  fetchMock.mockResolvedValueOnce(Response.json(user));
  fetchMock.mockResolvedValueOnce(Response.json(emails));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("optional GitHub credentials", () => {
  it.each([
    {},
    { AUTH_GITHUB_ID: "id" },
    { AUTH_GITHUB_SECRET: "secret" },
    { AUTH_GITHUB_ID: "  ", AUTH_GITHUB_SECRET: "secret" },
    { AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "\n\t" },
  ])("omits GitHub when either trimmed credential is absent (%j)", (env) => {
    expect(createGitHubProvider(env)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trims credentials and limits scopes to profile and email", () => {
    const provider = createGitHubProvider({
      AUTH_GITHUB_ID: " id\n",
      AUTH_GITHUB_SECRET: "\tsecret ",
    });
    expect(provider).toMatchObject({ id: "github", type: "oauth" });
    expect(provider?.options).toMatchObject({
      clientId: "id",
      clientSecret: "secret",
      authorization: { params: { scope: "read:user user:email" } },
      checks: ["pkce", "state"],
      allowDangerousEmailAccountLinking: true,
    });
  });
});

describe("authenticated GitHub identity", () => {
  it("always fetches both endpoints, ignoring public email and upstream verification claims", async () => {
    responses({
      ...USER,
      email_verified: true,
      ctcgVerifiedGitHubEmail: {
        source: "authenticated-github-email-list",
        providerAccountId: "12345",
        email: USER.email,
      },
    });
    const profile = await fetchVerifiedGitHubProfile("test-bearer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/user", "https://api.github.com/user/emails",
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        headers: {
          Authorization: "Bearer test-bearer",
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      });
    }
    expect(profile.email).toBe("verified@example.com");
    expect(profile.email_verified).toBeUndefined();
    expect(getVerifiedGitHubIdentity(profile, "12345")).toEqual({
      providerAccountId: "12345", email: "verified@example.com",
    });
  });

  it("prefers the verified primary and normalizes whitespace/case", async () => {
    responses(USER, [
      { email: "fallback@example.com", primary: false, verified: true },
      { email: " Primary@Example.COM \n", primary: true, verified: true },
    ]);
    const profile = await fetchVerifiedGitHubProfile("test-bearer");
    expect(profile.email).toBe("primary@example.com");
  });

  it("uses the first verified fallback, never the unverified primary", async () => {
    responses({ ...USER, email: null }, [
      { email: "unverified@example.com", primary: true, verified: false },
      { email: " FALLBACK@example.com ", primary: false, verified: true },
      { email: "later@example.com", primary: false, verified: true },
    ]);
    const profile = await fetchVerifiedGitHubProfile("test-bearer");
    expect(profile.email).toBe("fallback@example.com");
  });

  it.each([
    null, {}, [], "emails", [null],
    [{ email: "unverified@example.com", primary: true, verified: false }],
    [{ email: "email@example.com", primary: true }],
    [{ email: "email@example.com", primary: true, verified: "true" }],
    [{ email: "email@example.com", primary: "true", verified: true }],
    [{ primary: true, verified: true }],
    [{ email: 123, primary: true, verified: true }],
  ])("rejects missing, unverified, or malformed email-list data (%j)", async (emails) => {
    responses(USER, emails);
    await expect(fetchVerifiedGitHubProfile("test-bearer"))
      .rejects.toThrow("GitHub identity verification failed");
  });

  it.each([
    "", " ", "not-email", "two@@example.com", "local@localhost",
    "Display <email@example.com>", "white space@example.com",
    ".leading@example.com", "trailing.@example.com", "two..dots@example.com",
    "email@-example.com", "email@example-.com", "email@example.com,other@example.com",
    "a".repeat(65) + "@example.com",
  ])("rejects invalid verified email %j", async (email) => {
    responses(USER, [{ email, primary: true, verified: true }]);
    await expect(fetchVerifiedGitHubProfile("test-bearer")).rejects.toThrow();
  });

  it("fails malformed entries closed even beside an eligible address", async () => {
    responses(USER, [...EMAILS, { email: "bad", primary: false, verified: false }]);
    await expect(fetchVerifiedGitHubProfile("test-bearer")).rejects.toThrow();
  });

  it.each([null, [], {}, { ...USER, id: "12345" }, { ...USER, id: 0 },
    { ...USER, id: -1 }, { ...USER, id: 1.5 }, { ...USER, id: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed profiles and nonnumeric/unsafe IDs (%j)", async (user) => {
    responses(user);
    await expect(fetchVerifiedGitHubProfile("test-bearer")).rejects.toThrow();
  });

  it.each([undefined, "", " \n"])('rejects missing access token %j without requests', async (token) => {
    await expect(fetchVerifiedGitHubProfile(token)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, 1])("rejects endpoint %i HTTP failures without using the public email", async (failureIndex) => {
    const results = [Response.json(USER), Response.json(EMAILS)];
    results[failureIndex] = Response.json({ message: "private upstream details" }, { status: 403 });
    fetchMock.mockResolvedValueOnce(results[0]).mockResolvedValueOnce(results[1]);
    await expect(fetchVerifiedGitHubProfile("test-bearer"))
      .rejects.toThrow("GitHub identity verification failed");
  });

  it.each([0, 1])("rejects endpoint %i invalid JSON", async (failureIndex) => {
    const results = [Response.json(USER), Response.json(EMAILS)];
    results[failureIndex] = new Response("invalid-json");
    fetchMock.mockResolvedValueOnce(results[0]).mockResolvedValueOnce(results[1]);
    await expect(fetchVerifiedGitHubProfile("test-bearer")).rejects.toThrow();
  });

  it("does not carry network/abort error details into auth errors", async () => {
    fetchMock.mockRejectedValue(new Error("private bearer or email in upstream error"));
    let error: unknown;
    try { await fetchVerifiedGitHubProfile("test-bearer"); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("GitHub identity verification failed");
    expect((error as Error).cause).toBeUndefined();
  });
});

describe("GitHub verification evidence and provider mapping", () => {
  it("maps immutable numeric ID, not login or email; carries no tokens into account persistence", async () => {
    responses({ ...USER, login: "renamed", email: "changed@example.com" });
    const rawProfile = await fetchVerifiedGitHubProfile("test-bearer");
    const options = createGitHubProvider({ AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret" })!.options!;
    const mapped = await options.profile!(rawProfile as GitHubProfile, { access_token: "test-bearer", token_type: "bearer" });
    expect(mapped).toMatchObject({ id: "12345", email: "verified@example.com", name: "Collector" });
    expect(await options.account!({
      access_token: "test-bearer", refresh_token: "test-refresh",
      id_token: "test-id-token", token_type: "bearer", expires_at: 123,
      scope: "read:user user:email", session_state: "test-state",
    })).toEqual({});
  });

  it("provider userinfo uses the authenticated verification path", async () => {
    responses();
    const options = createGitHubProvider({ AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret" })!.options!;
    const userinfo = options.userinfo;
    if (!userinfo || typeof userinfo !== "object" || !userinfo.request) throw new Error("Missing userinfo override");
    const context = { tokens: { access_token: "test-bearer" } } as Parameters<typeof userinfo.request>[0];
    const raw = await userinfo.request(context);
    expect(getVerifiedGitHubIdentity(raw, "12345")?.email).toBe("verified@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects absent or forged JSON evidence and refuses it at profile mapping", async () => {
    const forged = {
      ...USER, email: "verified@example.com",
      ctcgVerifiedGitHubEmail: { source: "authenticated-github-email-list", providerAccountId: "12345", email: "verified@example.com" },
    };
    expect(getVerifiedGitHubIdentity(USER, "12345")).toBeNull();
    expect(getVerifiedGitHubIdentity(forged, "12345")).toBeNull();
    const options = createGitHubProvider({ AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret" })!.options!;
    expect(() => options.profile!(forged as unknown as GitHubProfile, {})).toThrow("GitHub identity verification failed");
  });

  it("rejects inconsistent email, profile ID, marker ID, or callback provider ID", async () => {
    responses();
    const raw = await fetchVerifiedGitHubProfile("test-bearer");
    expect(getVerifiedGitHubIdentity({ ...raw, email: "other@example.com" }, "12345")).toBeNull();
    expect(getVerifiedGitHubIdentity({ ...raw, id: 67890 }, "12345")).toBeNull();
    expect(getVerifiedGitHubIdentity(raw, "67890")).toBeNull();
    expect(getVerifiedGitHubIdentity({ ...raw, ctcgVerifiedGitHubEmail: {
      ...(raw.ctcgVerifiedGitHubEmail as object), providerAccountId: "67890",
    } }, "12345")).toBeNull();
  });
});

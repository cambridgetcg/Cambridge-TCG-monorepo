import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  authPost: vi.fn(),
  responseFloor: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  handlers: {
    GET: mocks.authGet,
    POST: mocks.authPost,
  },
}));
vi.mock("@/lib/auth/admission", () => ({
  waitForMagicLinkResponseFloor: mocks.responseFloor,
}));

import { GET, POST } from "./route";

beforeEach(() => {
  mocks.authGet.mockReset();
  mocks.authPost.mockReset();
  mocks.responseFloor.mockReset();
  mocks.responseFloor.mockResolvedValue(undefined);
});

describe("magic-link response boundary", () => {
  it("returns Auth.js's exact response and applies the shared response floor", async () => {
    const authResponse = new Response(null, {
      status: 302,
      headers: {
        Location:
          "https://cambridgetcg.com/api/auth/verify-request?provider=email&type=email",
        "Set-Cookie":
          "__Secure-authjs.callback-url=%2Faccount; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    });
    mocks.authPost.mockResolvedValue(authResponse);
    const request = new NextRequest(
      "https://cambridgetcg.com/api/auth/signin/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: "unknown@example.com",
          csrfToken: "csrf",
          callbackUrl: "/account",
        }),
      },
    );

    const response = await POST(request);

    expect(response).toBe(authResponse);
    expect(mocks.authPost).toHaveBeenCalledWith(request);
    expect(mocks.responseFloor).toHaveBeenCalledOnce();
    expect(mocks.responseFloor).toHaveBeenCalledWith(expect.any(Number));
  });

  it("passes Google sign-in unchanged to Auth.js without the email response floor", async () => {
    const provider = "google";
    const authResponse = new Response(null, { status: 302 });
    mocks.authPost.mockResolvedValue(authResponse);
    const request = new NextRequest(
      `http://localhost:3001/api/auth/signin/${provider}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken: "csrf", callbackUrl: "/account/trades" }),
      },
    );

    await expect(POST(request)).resolves.toBe(authResponse);

    expect(mocks.authPost).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.responseFloor).not.toHaveBeenCalled();
  });

  it("still applies the response floor when Auth.js rejects", async () => {
    mocks.authPost.mockRejectedValue(new Error("auth failure"));
    const request = new NextRequest(
      "https://cambridgetcg.com/api/auth/signin/email",
      { method: "POST" },
    );

    await expect(POST(request)).rejects.toThrow("auth failure");

    expect(mocks.responseFloor).toHaveBeenCalledOnce();
  });
});

describe("GitHub verification response boundary", () => {
  it("adds only safe probe metadata to GitHub sign-in without changing other providers", async () => {
    mocks.authPost.mockResolvedValue(new Response(null, { status: 302 }));
    const github = await POST(new NextRequest("https://cambridgetcg.com/api/auth/signin/github", {
      method: "POST",
    }));

    expect(github.headers.get("x-ctcg-verification-version")).toBe("github-oauth/1");
    expect(github.headers.get("x-ctcg-auth-attempt")).toBeNull();

    mocks.authPost.mockResolvedValue(new Response(null, { status: 302 }));
    const google = await POST(new NextRequest("https://cambridgetcg.com/api/auth/signin/google", {
      method: "POST",
    }));
    expect(google.headers.get("x-ctcg-verification-version")).toBeNull();
  });

  it("adds safe metadata to provider discovery without creating an attempt", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.authGet.mockResolvedValue(Response.json({ github: { id: "github" } }));

    const response = await GET(new NextRequest("https://cambridgetcg.com/api/auth/providers"));

    expect(response.headers.get("x-ctcg-verification-version")).toBe("github-oauth/1");
    expect(response.headers.get("x-ctcg-auth-attempt")).toBeNull();
    expect(mocks.authGet).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("adds a UUID header and same-origin support query to GitHub callback failures", async () => {
    mocks.authGet.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "https://cambridgetcg.com/login/error?error=AccessDenied" },
    }));

    const response = await GET(new NextRequest(
      "https://cambridgetcg.com/api/auth/callback/github?code=private&state=private",
    ));

    const supportId = response.headers.get("x-ctcg-auth-attempt");
    expect(supportId).toMatch(/^[0-9a-f-]{36}$/i);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("support")).toBe(supportId);
    expect(location.searchParams.get("error")).toBe("AccessDenied");
    expect(response.headers.get("x-ctcg-verification-version")).toBe("github-oauth/1");
  });

  it("does not add support to external or non-error callback destinations", async () => {
    mocks.authGet.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "https://example.com/login/error?error=AccessDenied" },
    }));
    const external = await GET(new NextRequest("https://cambridgetcg.com/api/auth/callback/github"));
    expect(external.headers.get("x-ctcg-auth-attempt")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(external.headers.get("location")).toBe("https://example.com/login/error?error=AccessDenied");

    mocks.authGet.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "https://cambridgetcg.com/account" },
    }));
    const complete = await GET(new NextRequest("https://cambridgetcg.com/api/auth/callback/github"));
    expect(complete.headers.get("location")).toBe("https://cambridgetcg.com/account");
  });
});

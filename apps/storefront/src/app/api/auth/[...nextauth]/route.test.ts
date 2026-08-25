import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(),
  responseFloor: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  handlers: {
    GET: vi.fn(),
    POST: mocks.authPost,
  },
}));
vi.mock("@/lib/auth/admission", () => ({
  waitForMagicLinkResponseFloor: mocks.responseFloor,
}));

import { POST } from "./route";

beforeEach(() => {
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

  it("does not add a response floor to other Auth.js actions", async () => {
    const authResponse = new Response(null, { status: 302 });
    mocks.authPost.mockResolvedValue(authResponse);
    const request = new NextRequest(
      "https://cambridgetcg.com/api/auth/signin/google",
      { method: "POST" },
    );

    await expect(POST(request)).resolves.toBe(authResponse);

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

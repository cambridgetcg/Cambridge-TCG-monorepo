import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(),
  capacity: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  handlers: {
    GET: vi.fn(),
    POST: mocks.authPost,
  },
}));
vi.mock("@/lib/auth/adapter", () => ({
  magicLinkRequestCapacity: mocks.capacity,
}));

import { POST } from "./route";

beforeEach(() => {
  mocks.authPost.mockReset();
  mocks.capacity.mockReset();
});

describe("magic-link request boundary", () => {
  it("returns a no-store 429 before Auth.js when five tokens remain active", async () => {
    mocks.capacity.mockResolvedValue({
      allowed: false,
      reason: "email",
      emailActiveCount: 5,
      globalActiveCount: 25,
      retryAfterSeconds: 7200,
    });
    const request = new NextRequest("https://cambridgetcg.com/api/auth/signin/email", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: " Collector@Example.com " }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBe("7200");
    expect(mocks.capacity).toHaveBeenCalledWith("collector@example.com");
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("returns a distinct service-wide limit reason", async () => {
    mocks.capacity.mockResolvedValue({
      allowed: false,
      reason: "global",
      emailActiveCount: 0,
      globalActiveCount: 500,
      retryAfterSeconds: 30,
    });
    const request = new NextRequest("https://cambridgetcg.com/api/auth/signin/email", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "new@example.com" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "magic_link_global_limit",
      scope: "global",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("passes an allowed request to Auth.js with its original body intact", async () => {
    mocks.capacity.mockResolvedValue({
      allowed: true,
      reason: null,
      emailActiveCount: 0,
      globalActiveCount: 0,
      retryAfterSeconds: 0,
    });
    mocks.authPost.mockResolvedValue(new Response(null, { status: 302 }));
    const request = new NextRequest("https://cambridgetcg.com/api/auth/signin/email", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "collector@example.com", csrfToken: "csrf" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(302);
    expect(mocks.authPost).toHaveBeenCalledTimes(1);
    const forwarded = mocks.authPost.mock.calls[0]?.[0] as NextRequest;
    expect(forwarded).toBe(request);
    expect(await forwarded.text()).toContain("email=collector%40example.com");
  });
});

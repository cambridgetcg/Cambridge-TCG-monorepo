import { describe, expect, it, vi } from "vitest";
import {
  describeRequestUrl,
  logError,
  logRequest,
  logResponse,
  logShopifyContext,
} from "~/utils/request-logger";

describe("privacy-safe request logger", () => {
  it("describes query shape without retaining values", () => {
    const token = "header.payload.signature";
    const result = describeRequestUrl(
      `https://app.example/app?id_token=${token}&shop=test.myshopify.com`,
    );

    expect(result).toBe("/app?keys=id_token,shop");
    expect(result).not.toContain(token);
    expect(result).not.toContain("test.myshopify.com");
  });

  it("never logs request or response header values and never reads bodies", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = "super-secret-token";
    const request = new Request(
      `https://app.example/app?session_token=${token}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          cookie: `session=${token}`,
        },
        body: JSON.stringify({ accessToken: token }),
      },
    );

    const context = await logRequest(request, "test");
    logResponse(
      new Response("secret response", {
        headers: { "set-cookie": `session=${token}` },
      }),
      "test",
      context.startTime,
      context.requestId,
    );
    const calls = [...log.mock.calls];
    log.mockRestore();

    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain(token);
    expect(serialized).toContain("authorization");
    expect(serialized).toContain("set-cookie");
  });

  it("never logs the client IP or the embedded-admin id_token", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const idToken = "example.id-token.signature";
    const ip = "203.0.113.42";
    const request = new Request(
      `https://app.example/app?embedded=1&hmac=abc123&host=YWRtaW4&id_token=${idToken}&session=0a1b2c&shop=test.myshopify.com`,
      {
        headers: {
          "x-forwarded-for": ip,
          "x-real-ip": ip,
          "x-vercel-forwarded-for": ip,
          "x-vercel-ip-city": "London",
          "user-agent": "Mozilla/5.0 (test)",
        },
      },
    );

    await logRequest(request, "App Route Loader");
    const serialized = JSON.stringify(log.mock.calls);
    log.mockRestore();

    expect(serialized).not.toContain(ip);
    expect(serialized).not.toContain(idToken);
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("0a1b2c");
    expect(serialized).not.toContain("London");
    expect(serialized).not.toContain("test.myshopify.com");
    expect(serialized).toContain("/app?keys=embedded,hmac,host,id_token,session,shop");
  });

  it("logs only error class and Shopify context presence", () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = "super-secret-token";

    logError(new Error(`Bearer ${token}`), "test", "request");
    logShopifyContext({
      shop: "private.myshopify.com",
      session: {
        id: token,
        shop: "private.myshopify.com",
        accessToken: token,
      },
      apiKey: token,
      host: token,
    });

    const serialized = JSON.stringify([
      ...errorLog.mock.calls,
      ...log.mock.calls,
    ]);
    errorLog.mockRestore();
    log.mockRestore();

    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("private.myshopify.com");
    expect(serialized).toContain("hasAccessToken");
  });
});

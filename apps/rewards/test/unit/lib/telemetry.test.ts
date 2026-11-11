import type { ErrorEvent } from "@sentry/react-router";
import { describe, expect, it } from "vitest";
import { redactSensitiveTelemetryValue, redactSensitiveUrlText, scrubEvent, sentryOptions } from "~/lib/telemetry.server";

/**
 * What reaches Sentry: carried from apps/rewardspro's telemetry-redaction
 * tests, plus the event scrub beforeSend runs (no query strings, cookies or
 * request bodies leave the app).
 */

describe("telemetry redaction", () => {
  it("redacts Shopify token-bounce and OAuth query values", () => {
    const redacted = redactSensitiveUrlText(
      "Current URL: https://app.example/app?shop=test.myshopify.com&id_token=header.payload.signature&code=oauth-code&hmac=proof",
    );

    expect(redacted).toContain("shop=test.myshopify.com");
    expect(redacted).toContain("id_token=[REDACTED]");
    expect(redacted).not.toContain("header.payload.signature");
    expect(redacted).not.toContain("oauth-code");
    expect(redacted).not.toContain("proof");
  });

  it("redacts bearer and labelled credentials, and buyer email addresses", () => {
    const token = "header.payload.signature";
    const redacted = redactSensitiveUrlText(`Authorization: Bearer ${token}; refresh_token=${token}; sent to jane%40example.com and jane@example.co.uk`);

    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain("jane");
    expect(redacted).toContain("refresh_token=[REDACTED]");
  });

  it("redacts secret- and contact-shaped fields recursively, and keeps the SDK's own metadata", () => {
    const metadata = { capturedSpanScope: {} };
    expect(
      redactSensitiveTelemetryValue({
        data: { customerEmail: "Jane <jane at example>", accessToken: "x", count: 2 },
        error: new TypeError("Could not pay shopper@example.com"),
        sdkProcessingMetadata: metadata,
      }),
    ).toEqual({
      data: { customerEmail: "[REDACTED]", accessToken: "[REDACTED]", count: 2 },
      error: "TypeError: Could not pay [REDACTED_EMAIL]",
      sdkProcessingMetadata: metadata,
    });
  });
});

// Headers that locate or identify the person making the request (Vercel's
// geolocation, client addresses) or carry their credentials.
const ADDRESS_HEADER_NAMES = [
  "x-vercel-ip-city",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-postal-code",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-timezone",
  "x-vercel-ip-continent",
  "x-vercel-ip-as-number",
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "authorization",
  "cookie",
  "x-shopify-hmac-sha256",
  "x-shopify-access-token",
];
const titleCase = (name: string) => name.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => dash + letter.toUpperCase());
// Each name in lower, UPPER and Title case, each value marked so a leak shows.
function withEveryAddressHeader(): Record<string, string> {
  return Object.fromEntries(
    ADDRESS_HEADER_NAMES.flatMap((name, index) =>
      [name, name.toUpperCase(), titleCase(name)].map((variant, letterCase) => [variant, `leak-${index}-${letterCase} 203.0.113.7`]),
    ),
  );
}
const ADDRESS_VALUES = /leak-|203\.0\.113\.7/;

describe("scrubEvent (Sentry's beforeSend)", () => {
  it("removes the request's query string, cookies and body, and the query from its URL", () => {
    const event = {
      type: undefined,
      message: "Proxy request failed for buyer@example.com",
      request: {
        url: "https://rewards.example/api/proxy/widget?logged_in_customer_id=7001&signature=abc&shop=s.myshopify.com",
        method: "GET",
        query_string: "logged_in_customer_id=7001&signature=abc",
        cookies: { session: "secret" },
        data: '{"customer":{"email":"buyer@example.com"}}',
        headers: { cookie: "session=secret", "user-agent": "Shopify", Authorization: "Bearer secret" },
      },
      breadcrumbs: [{ category: "fetch", data: { url: "https://shop.myshopify.com/admin/api?code=abc", method: "POST" } }],
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event)!;

    expect(scrubbed.request).toEqual({
      url: "https://rewards.example/api/proxy/widget",
      method: "GET",
      headers: { "user-agent": "Shopify" },
    });
    expect(scrubbed.message).toBe("Proxy request failed for [REDACTED_EMAIL]");
    expect(JSON.stringify(scrubbed)).not.toMatch(/7001|code=abc|secret/);
  });

  it("keeps only the request headers that identify no one (#237)", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://rewards.example/app",
        headers: {
          ...withEveryAddressHeader(),
          "User-Agent": "Mozilla/5.0 (test)",
          "X-Shopify-Webhook-Id": "webhook-test-1",
          "x-vercel-id": "lhr1::test-1",
          "Sec-Fetch-Mode": "navigate",
          "x-new-provider-header": "unknown-test-value",
          referer: "https://admin.shopify.com/store/example/apps/rewards?shop=example.myshopify.com",
        },
      },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event)!;

    expect(scrubbed.request?.headers).toEqual({
      "User-Agent": "Mozilla/5.0 (test)",
      "X-Shopify-Webhook-Id": "webhook-test-1",
      "x-vercel-id": "lhr1::test-1",
      "Sec-Fetch-Mode": "navigate",
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(ADDRESS_VALUES);
  });

  it("passes an event without a request through, redacted", () => {
    const scrubbed = scrubEvent({ type: undefined, message: "token=abc failed" } as ErrorEvent);
    expect(scrubbed).toEqual({ type: undefined, message: "token=[REDACTED] failed" });
  });
});

describe("sentryOptions (how entry.server.tsx starts Sentry)", () => {
  const options = sentryOptions("https://public@example.invalid/0", "test");

  it("runs error events through the header allow-list (beforeSend)", () => {
    const event = { type: undefined, request: { headers: { ...withEveryAddressHeader(), "user-agent": "Mozilla/5.0 (test)" } } } as unknown as ErrorEvent;

    expect(options.beforeSend(event)?.request?.headers).toEqual({ "user-agent": "Mozilla/5.0 (test)" });
  });

  it("sends transactions through beforeSendTransaction, which gives them the same allow-list on the request and on span header attributes", () => {
    // The SDK's default "stream" lifecycle skips beforeSendTransaction.
    expect(options.traceLifecycle).toBe("static");

    const headerAttributes = (headers: Record<string, string>) =>
      Object.fromEntries(Object.entries(headers).map(([name, value]) => [`http.request.header.${name.toLowerCase()}`, [value]]));
    const headers = { ...withEveryAddressHeader(), "user-agent": "Mozilla/5.0 (test)", "x-shopify-topic": "orders/paid" };
    const event = {
      type: "transaction",
      transaction: "GET /app",
      request: { url: "https://rewards.example/app", headers },
      contexts: { trace: { trace_id: "t", span_id: "s", data: { "http.request.method": "GET", ...headerAttributes(headers) } } },
      spans: [{ span_id: "c", trace_id: "t", start_timestamp: 0, data: { "url.full": "https://rewards.example/app", ...headerAttributes(headers) } }],
    } as unknown as Parameters<typeof options.beforeSendTransaction>[0];

    const scrubbed = options.beforeSendTransaction(event)!;

    expect(scrubbed.request?.headers).toEqual({ "user-agent": "Mozilla/5.0 (test)", "x-shopify-topic": "orders/paid" });
    expect(scrubbed.contexts?.trace?.data).toEqual({
      "http.request.method": "GET",
      "http.request.header.user-agent": ["Mozilla/5.0 (test)"],
      "http.request.header.x-shopify-topic": ["orders/paid"],
    });
    expect(scrubbed.spans?.[0].data).toEqual({
      "url.full": "https://rewards.example/app",
      "http.request.header.user-agent": ["Mozilla/5.0 (test)"],
      "http.request.header.x-shopify-topic": ["orders/paid"],
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(ADDRESS_VALUES);
  });
});

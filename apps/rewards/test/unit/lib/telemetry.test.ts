import type { ErrorEvent } from "@sentry/react-router";
import { describe, expect, it } from "vitest";
import { redactSensitiveTelemetryValue, redactSensitiveUrlText, scrubEvent } from "~/lib/telemetry.server";

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
      headers: { "user-agent": "Shopify", Authorization: "[REDACTED]" },
    });
    expect(scrubbed.message).toBe("Proxy request failed for [REDACTED_EMAIL]");
    expect(JSON.stringify(scrubbed)).not.toMatch(/7001|code=abc|secret/);
  });

  it("passes an event without a request through, redacted", () => {
    const scrubbed = scrubEvent({ type: undefined, message: "token=abc failed" } as ErrorEvent);
    expect(scrubbed).toEqual({ type: undefined, message: "token=[REDACTED] failed" });
  });
});

import * as Sentry from "@sentry/remix";
import { describe, expect, it } from "vitest";
import {
  redactSensitiveTelemetryValue,
  redactSensitiveUrlText,
} from "~/utils/telemetry-redaction";

describe("telemetry redaction", () => {
  it("redacts Shopify token-bounce and OAuth query values", () => {
    const input =
      "Current URL: https://app.example/app/smoke?shop=test.myshopify.com&id_token=header.payload.signature&code=oauth-code&hmac=proof";

    const redacted = redactSensitiveUrlText(input);

    expect(redacted).toContain("shop=test.myshopify.com");
    expect(redacted).toContain("id_token=[REDACTED]");
    expect(redacted).toContain("code=[REDACTED]");
    expect(redacted).toContain("hmac=[REDACTED]");
    expect(redacted).not.toContain("header.payload.signature");
    expect(redacted).not.toContain("oauth-code");
    expect(redacted).not.toContain("proof");
  });

  it("redacts the session value Shopify admin adds to the app URL", () => {
    const redacted = redactSensitiveUrlText(
      "/app?embedded=1&session=0a1b2c3d4e5f&shop=test.myshopify.com",
    );

    expect(redacted).toBe("/app?embedded=1&session=[REDACTED]&shop=test.myshopify.com");
  });

  it("redacts bearer and labelled credentials outside URLs", () => {
    const token = "header.payload.signature";
    const redacted = redactSensitiveUrlText(
      `Authorization: Bearer ${token}; refresh_token=${token}; cookie: session=${token}`,
    );

    expect(redacted).not.toContain(token);
    expect(redacted).toContain("Authorization: [REDACTED]");
    expect(redacted).toContain("refresh_token=[REDACTED]");
    expect(redacted).toContain("cookie: [REDACTED]");
  });

  it("redacts shopper email addresses, including URL-encoded ones", () => {
    const redacted = redactSensitiveUrlText(
      'Points earned email sent to jane.doe+vip@example.co.uk; GET /api/profiles?filter=equals(email,"jane%40example.com")',
    );

    expect(redacted).not.toContain("jane.doe+vip@example.co.uk");
    expect(redacted).not.toContain("jane%40example.com");
    expect(redacted).toContain("sent to [REDACTED_EMAIL]");
  });

  it("redacts secret-shaped and email-shaped fields recursively", () => {
    expect(
      redactSensitiveTelemetryValue({
        request: {
          url: "/app/smoke?id_token=session-jwt",
          headers: {
            Authorization: "Bearer session-jwt",
          },
        },
        data: { customerEmail: "Jane <jane at example>", count: 2 },
      }),
    ).toEqual({
      request: {
        url: "/app/smoke?id_token=[REDACTED]",
        headers: {
          Authorization: "[REDACTED]",
        },
      },
      data: { customerEmail: "[REDACTED]", count: 2 },
    });
  });

  it("leaves the SDK's own processing metadata untouched", () => {
    class Scope {
      getSpan() {
        return null;
      }
    }
    const scope = new Scope();
    const metadata = { capturedSpanScope: scope, token: "internal" };

    const redacted = redactSensitiveTelemetryValue({
      message: "token=secret-value",
      sdkProcessingMetadata: metadata,
    }) as { message: string; sdkProcessingMetadata: typeof metadata };

    expect(redacted.message).toBe("token=[REDACTED]");
    expect(redacted.sdkProcessingMetadata).toBe(metadata);
    expect(redacted.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
  });

  it("does not walk into class instances, and keeps only a redacted message from errors", () => {
    class FakeElement {
      reactFiber = { child: { memoizedProps: { email: "shopper@example.com" } } };
    }

    expect(
      redactSensitiveTelemetryValue({
        arguments: [
          new FakeElement(),
          new TypeError("Could not sync shopper@example.com"),
          { email: "shopper@example.com" },
        ],
      }),
    ).toEqual({
      arguments: [
        "[FakeElement]",
        "TypeError: Could not sync [REDACTED_EMAIL]",
        { email: "[REDACTED]" },
      ],
    });
  });

  it("removes raw tokens and emails from serialized error and transaction-shaped events", () => {
    const token = "header.payload.signature";
    const event = {
      transaction: `/app?id_token=${token}`,
      exception: {
        values: [{ type: "Error", value: "Failed to sync shopper@example.com" }],
      },
      request: {
        url: `https://app.example/app?id_token=${token}`,
        query_string: `id_token=${token}`,
        headers: {
          authorization: `Bearer ${token}`,
          cookie: `session=${token}`,
        },
      },
      spans: [
        {
          description: `GET /app?session_token=${token}`,
          data: { sessionToken: token },
        },
      ],
      breadcrumbs: [
        {
          message: `Navigated to /app?code=${token}`,
          data: { apiKey: token },
        },
        {
          category: "console",
          message: "[Orders Page Client] First order sample:",
          data: { arguments: [{ email: "shopper@example.com" }] },
        },
      ],
    };

    const serialized = JSON.stringify(redactSensitiveTelemetryValue(event));

    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("shopper@example.com");
    expect(serialized).toContain("[REDACTED]");
  });

  it("keeps the spans of a real Sentry transaction, with their URLs scrubbed", async () => {
    const token = "header.payload.signature";
    const sent: Array<{ spans?: unknown[] }> = [];

    // Sentry v7 hands beforeSendTransaction its spans as live Span objects.
    Sentry.init({
      dsn: "https://public@example.invalid/1",
      tracesSampleRate: 1,
      defaultIntegrations: false,
      transport: () => ({
        send: async (envelope) => {
          sent.push(envelope[1][0][1] as { spans?: unknown[] });
          return {};
        },
        flush: async () => true,
      }),
      beforeSendTransaction(event) {
        return redactSensitiveTelemetryValue(event) as typeof event;
      },
    });
    const transaction = Sentry.startTransaction({ name: "GET /app", op: "http.server" });
    transaction
      .startChild({
        op: "http.client",
        description: `GET https://example.com/x?id_token=${token} shopper@example.com`,
      })
      .end();
    transaction.end();
    await Sentry.close(2000);

    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("shopper@example.com");
    expect(sent[0]?.spans).toEqual([
      expect.objectContaining({
        op: "http.client",
        description: "GET https://example.com/x?id_token=[REDACTED] [REDACTED_EMAIL]",
      }),
    ]);
  });
});

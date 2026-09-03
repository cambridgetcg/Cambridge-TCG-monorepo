import { describe, expect, it } from "vitest";
import {
  PRISM_STRIPE_MUTATION_BODY_MAX_BYTES,
  PRISM_STRIPE_WEBHOOK_BODY_MAX_BYTES,
  PrismStripeHttpError,
  prismStripeError,
  readPrismStripeEmptyJson,
  readPrismStripeRawWebhookBody,
  requirePrismStripeSameOrigin,
} from "./http";

function mutation(
  body: string,
  options: {
    origin?: string | null;
    fetchSite?: string | null;
    contentType?: string | null;
    contentLength?: string;
  } = {},
): Request {
  const headers = new Headers();
  const origin = options.origin === undefined
    ? "https://cambridgetcg.com"
    : options.origin;
  const fetchSite = options.fetchSite === undefined
    ? "same-origin"
    : options.fetchSite;
  const contentType = options.contentType === undefined
    ? "application/json"
    : options.contentType;
  if (origin !== null) headers.set("origin", origin);
  if (fetchSite !== null) headers.set("sec-fetch-site", fetchSite);
  if (contentType !== null) headers.set("content-type", contentType);
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request(
    "https://cambridgetcg.com/api/prism-signals/stripe/checkout",
    { method: "POST", headers, body },
  );
}

describe("PRISM Stripe HTTP boundary", () => {
  it("requires the exact request origin and same-origin Fetch Metadata", () => {
    expect(() => requirePrismStripeSameOrigin(mutation("{}"))).not.toThrow();
    for (const request of [
      mutation("{}", { origin: null }),
      mutation("{}", { origin: "https://evil.example" }),
      mutation("{}", { origin: "https://cambridgetcg.com/path" }),
      mutation("{}", { fetchSite: "same-site" }),
    ]) {
      expect(() => requirePrismStripeSameOrigin(request)).toThrowError(
        expect.objectContaining({ code: "invalid_origin", status: 403 }),
      );
    }
  });

  it("accepts only an empty JSON object", async () => {
    await expect(readPrismStripeEmptyJson(mutation("{}"))).resolves.toBeUndefined();
    await expect(readPrismStripeEmptyJson(mutation(" \n { } \t"))).resolves.toBeUndefined();
    for (const body of ["", "{", "[]", "null", '{"plan":"all"}']) {
      await expect(readPrismStripeEmptyJson(mutation(body))).rejects.toBeInstanceOf(
        PrismStripeHttpError,
      );
    }
  });

  it("rejects wrong media types and declared or streamed oversize bodies", async () => {
    await expect(
      readPrismStripeEmptyJson(mutation("{}", { contentType: "text/plain" })),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    await expect(
      readPrismStripeEmptyJson(
        mutation("{}", {
          contentLength: String(PRISM_STRIPE_MUTATION_BODY_MAX_BYTES + 1),
        }),
      ),
    ).rejects.toMatchObject({ code: "request_too_large", status: 413 });
    await expect(
      readPrismStripeEmptyJson(
        mutation("x".repeat(PRISM_STRIPE_MUTATION_BODY_MAX_BYTES + 1)),
      ),
    ).rejects.toMatchObject({ code: "request_too_large", status: 413 });
    await expect(
      readPrismStripeEmptyJson(
        mutation("{}", { contentLength: "2e0" }),
      ),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
  });

  it("keeps structured errors private and unindexable", async () => {
    const response = prismStripeError("checkout_unavailable", "Unavailable.", 503);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.json()).toEqual({
      error: { code: "checkout_unavailable", message: "Unavailable." },
    });
  });

  it("preserves an exact bounded raw webhook body", async () => {
    const raw = '{\n  "id": "evt_exact", "data": { "emoji": "◇" }\n}';
    const request = new Request(
      "https://cambridgetcg.com/api/webhooks/stripe/prism-signals",
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: raw,
      },
    );
    await expect(readPrismStripeRawWebhookBody(request)).resolves.toBe(raw);
  });

  it("rejects declared, streamed, and invalid-UTF-8 webhook bodies", async () => {
    const declared = new Request(
      "https://cambridgetcg.com/api/webhooks/stripe/prism-signals",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(PRISM_STRIPE_WEBHOOK_BODY_MAX_BYTES + 1),
        },
        body: "{}",
      },
    );
    await expect(readPrismStripeRawWebhookBody(declared)).rejects.toMatchObject({
      code: "request_too_large",
      status: 413,
    });

    const streamed = new Request(
      "https://cambridgetcg.com/api/webhooks/stripe/prism-signals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(PRISM_STRIPE_WEBHOOK_BODY_MAX_BYTES + 1),
      },
    );
    await expect(readPrismStripeRawWebhookBody(streamed)).rejects.toMatchObject({
      code: "request_too_large",
      status: 413,
    });

    const invalidUtf8 = new Request(
      "https://cambridgetcg.com/api/webhooks/stripe/prism-signals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([0xc3, 0x28]));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    await expect(readPrismStripeRawWebhookBody(invalidUtf8)).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
    });
  });
});

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { IngestEvent } from "../types";
import {
  CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES,
  CardmarketPublicFileError,
  assertCardmarketPublicFileUrl,
  fetchCardmarketPublicFile,
} from "./index";

const PRODUCT_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json";
const NONSINGLES_PRODUCT_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_1.json";
const PRICE_URL =
  "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json";

function responseAt(
  url: string,
  body: BodyInit | null,
  init: ResponseInit,
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

async function expectCode(
  promise: Promise<unknown>,
  code: CardmarketPublicFileError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "CardmarketPublicFileError",
    code,
  });
}

describe("cardmarket/public-files URL policy", () => {
  it("accepts only the exact reviewed product-list and price-guide shapes", () => {
    expect(assertCardmarketPublicFileUrl(PRODUCT_URL, "product-list").toString()).toBe(
      PRODUCT_URL,
    );
    expect(
      assertCardmarketPublicFileUrl(
        NONSINGLES_PRODUCT_URL,
        "product-list",
      ).toString(),
    ).toBe(NONSINGLES_PRODUCT_URL);
    expect(assertCardmarketPublicFileUrl(PRICE_URL, "price-guide").toString()).toBe(
      PRICE_URL,
    );

    const invalid: Array<[string, "product-list" | "price-guide"]> = [
      [PRODUCT_URL.replace("https:", "http:"), "product-list"],
      [PRODUCT_URL.replace("downloads.s3.cardmarket.com", "cardmarket.com"), "product-list"],
      [PRODUCT_URL.replace("downloads.s3.cardmarket.com", "downloads.s3.cardmarket.com.evil.test"), "product-list"],
      [PRODUCT_URL.replace("https://", "https://user:secret@"), "product-list"],
      [PRODUCT_URL.replace(".com/", ".com:444/"), "product-list"],
      [`${PRODUCT_URL}?version=latest`, "product-list"],
      [`${PRODUCT_URL}#fragment`, "product-list"],
      [PRODUCT_URL.replace("products_singles_1.json", "products_singles_0.json"), "product-list"],
      [PRODUCT_URL.replace("products_singles_1.json", "products_sealed_1.json"), "product-list"],
      [PRODUCT_URL.replace("products_singles_1.json", "../priceGuide/price_guide_1.json"), "product-list"],
      [PRICE_URL, "product-list"],
      [PRODUCT_URL, "price-guide"],
    ];

    for (const [url, kind] of invalid) {
      expect(() => assertCardmarketPublicFileUrl(url, kind)).toThrow(
        CardmarketPublicFileError,
      );
    }
  });
});

describe("cardmarket/public-files fetch", () => {
  it("returns exact bytes, digest, headers, and private provenance", async () => {
    const json = '{"createdAt":"2026-08-29T06:00:00Z","priceGuides":[]}';
    const events: IngestEvent[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("user-agent")).toContain("cambridgetcg.com/1.0");
      return responseAt(PRICE_URL, json, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(json)),
          ETag: '"artifact-etag"',
          "Last-Modified": "Sat, 29 Aug 2026 06:00:00 GMT",
          "Cache-Control": "public, max-age=60",
        },
      });
    });

    const artifact = await fetchCardmarketPublicFile(
      { fetch: fetch as typeof globalThis.fetch, on_event: (event) => events.push(event) },
      { kind: "price-guide", url: PRICE_URL },
    );

    const expectedBytes = new TextEncoder().encode(json);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(artifact.kind).toBe("price-guide");
    expect(artifact.source_url).toBe(PRICE_URL);
    expect(artifact.final_url).toBe(PRICE_URL);
    expect(artifact.bytes).toEqual(expectedBytes);
    expect(artifact.byte_length).toBe(expectedBytes.byteLength);
    expect(artifact.sha256).toBe(
      createHash("sha256").update(expectedBytes).digest("hex"),
    );
    expect(artifact.headers).toEqual({
      content_type: "application/json; charset=utf-8",
      content_length: expectedBytes.byteLength,
      content_encoding: null,
      etag: '"artifact-etag"',
      last_modified: "Sat, 29 Aug 2026 06:00:00 GMT",
      cache_control: "public, max-age=60",
    });
    expect(artifact.provenance).toEqual({
      as_of: artifact.retrieved_at,
      retrieved_at: artifact.retrieved_at,
      source: "cardmarket",
      via_proxy: null,
    });
    expect(events.map((event) => event.kind)).toEqual(["start", "done"]);
    expect(events[0]?.detail.publication).toBe("withheld");
    expect(events[1]?.detail.sha256).toBe(artifact.sha256);
  });

  it("follows only allowlisted redirects and records the final URL", async () => {
    const finalUrl = PRICE_URL;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        responseAt(PRICE_URL, null, {
          status: 302,
          headers: { Location: finalUrl },
        }),
      )
      .mockResolvedValueOnce(
        responseAt(finalUrl, '{"priceGuides":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const artifact = await fetchCardmarketPublicFile(
      { fetch },
      { kind: "price-guide", url: PRICE_URL },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([PRICE_URL, finalUrl]);
    expect(artifact.source_url).toBe(PRICE_URL);
    expect(artifact.final_url).toBe(finalUrl);
  });

  it("refuses redirects that substitute another game's artifact", async () => {
    const substitutedUrl =
      "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, null, {
        status: 302,
        headers: { Location: substitutedUrl },
      }),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL },
      ),
      "redirect-not-allowed",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin redirects before requesting the target", async () => {
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, null, {
        status: 302,
        headers: {
          Location:
            "https://attacker.example/productCatalog/priceGuide/price_guide_1.json",
        },
      }),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL },
      ),
      "origin-not-allowed",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a fetch implementation reporting an unapproved final origin", async () => {
    const fetch = vi.fn(async () =>
      responseAt(
        "https://attacker.example/productCatalog/priceGuide/price_guide_1.json",
        '{"priceGuides":[]}',
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL },
      ),
      "origin-not-allowed",
    );
  });

  it("rejects an unapproved source URL before touching the network", async () => {
    const fetch = vi.fn();
    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        {
          kind: "price-guide",
          url: "https://www.cardmarket.com/en/Magic/Data/Price-Guide",
        },
      ),
      "origin-not-allowed",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["text/html", "<html><title>Just a moment</title></html>", "invalid-content-type"],
    ["application/json", "<html><title>login</title></html>", "invalid-json-envelope"],
    ["application/json", "{\"truncated\":true", "invalid-json-envelope"],
  ] as const)("rejects %s responses that are not complete JSON artifacts", async (contentType, body, code) => {
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, body, {
        status: 200,
        headers: { "Content-Type": contentType },
      }),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL },
      ),
      code,
    );
  });

  it("rejects an oversized declared body before accepting it", async () => {
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, "{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "1024",
        },
      }),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL, max_bytes: 16 },
      ),
      "too-large",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("enforces the byte ceiling while streaming when Content-Length is absent", async () => {
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, new TextEncoder().encode('{"priceGuides":[]}'), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL, max_bytes: 5 },
      ),
      "too-large",
    );
  });

  it("rejects invalid byte limits before touching the network", async () => {
    const fetch = vi.fn();
    for (const max_bytes of [0, -1, 1.5, CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES + 1]) {
      await expectCode(
        fetchCardmarketPublicFile(
          { fetch: fetch as typeof globalThis.fetch },
          { kind: "product-list", url: PRODUCT_URL, max_bytes },
        ),
        "invalid-size-limit",
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors an already-aborted signal without touching the network", async () => {
    const controller = new AbortController();
    controller.abort("operator cancelled");
    const fetch = vi.fn();

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch, signal: controller.signal },
        { kind: "product-list", url: PRODUCT_URL },
      ),
      "aborted",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors cancellation before reading a returned body", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort("operator cancelled");
      return responseAt(PRODUCT_URL, '{"products":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expectCode(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch, signal: controller.signal },
        { kind: "product-list", url: PRODUCT_URL },
      ),
      "aborted",
    );
  });

  it("surfaces non-success HTTP status without archiving the body", async () => {
    const fetch = vi.fn(async () =>
      responseAt(PRICE_URL, '{"message":"no"}', {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchCardmarketPublicFile(
        { fetch: fetch as typeof globalThis.fetch },
        { kind: "price-guide", url: PRICE_URL },
      ),
    ).rejects.toMatchObject({ code: "http-error", status: 404 });
  });
});

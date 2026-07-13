import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { CARD_BATCH_MAX_REQUEST_BYTES, GET, OPTIONS, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function request(body: unknown): Request {
  return new Request("https://example.test/api/v1/cards/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("POST /api/v1/cards/batch", () => {
  it("returns an ordered, rights-labelled batch without market or identity leakage", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          sku: "OP-OP01-001-JP",
          card_number: "001",
          card_name: "Monkey D. Luffy",
          name_en: "Monkey D. Luffy",
          name_translations: null,
          rarity: "L",
          image_url: null,
          variant: "",
          set_code: "OP01",
          set_name: "Romance Dawn",
          game: "op",
          spot_gbp: "12.34",
          captured_on: "2026-07-12",
        },
      ],
    } as Awaited<ReturnType<typeof query>>);

    const response = await POST(
      request({ skus: ["op-op01-001-ja", "op-op01-999-ja", "bad"] }),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(body.data.results.map((result: { status: string }) => result.status)).toEqual([
      "found",
      "not_in_storefront_mirror",
      "invalid_sku",
    ]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.source_license).toEqual([
      "cc0",
      "proprietary",
      "proprietary",
    ]);
    expect(serialized).not.toMatch(
      /"stock":|"cardrush_jpy":|"source_url":|"image_url":|"reference_price":|"buyer_id":|"seller_id":|"receipt_sha256":/,
    );
  });

  it("stops an oversized body stream before JSON parsing or a database read", async () => {
    const oversizedRequest = new Request(
      "https://example.test/api/v1/cards/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(CARD_BATCH_MAX_REQUEST_BYTES + 1),
      },
    );
    expect(oversizedRequest.headers.get("content-length")).toBeNull();

    const response = await POST(oversizedRequest);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.details.max_request_bytes).toBe(
      CARD_BATCH_MAX_REQUEST_BYTES,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and oversized batches before reading", async () => {
    const malformed = await POST(
      new Request("https://example.test/api/v1/cards/batch", {
        method: "POST",
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);

    const oversized = await POST(
      request({ skus: Array.from({ length: 101 }, () => "op-op01-001-ja") }),
    );
    expect(oversized.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns individual invalid results without claiming the mirror was read", async () => {
    const response = await POST(request({ skus: ["nope", "also-nope"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.invalid_count).toBe(2);
    expect(body.data.mirror_queried).toBe(false);
    expect(body._meta.sources).toEqual(["@cambridge-tcg/sku"]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("reports a mirror outage as 503 rather than returning a false empty batch", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const response = await POST(request({ skus: ["op-op01-001-ja"] }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error.message).toMatch(/No supplied SKU is being reported as missing/);
  });

  it("advertises the read-only POST preflight", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });

  it("teaches GET callers how to recover", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(body.error.message).toMatch(/read-only/);
  });
});

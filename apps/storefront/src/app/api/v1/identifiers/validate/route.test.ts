import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route";
import { warmJoyCache } from "@/lib/joy";

vi.mock("pg", () => { throw new Error("Validator route must not import a database driver"); });
vi.mock("@/lib/db", () => { throw new Error("Validator route must not import a database"); });
vi.mock("@/lib/joy", () => ({
  warmJoyCache: vi.fn(() => { throw new Error("No cache warming from validation"); }),
  joyIndexSync: vi.fn(() => { throw new Error("No cache read from validation"); }),
}));

const URL = "https://cambridgetcg.example/api/v1/identifiers/validate";
const network = vi.fn(() => { throw new Error("No network from validator"); });
beforeEach(() => vi.stubGlobal("fetch", network));
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  expect(warmJoyCache).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function raw(body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }): Request {
  return new Request(URL, { method: "POST", headers, body });
}
function request(value: unknown): Request {
  return raw(JSON.stringify(value));
}
function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let index = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel,
  });
  return {
    request: new Request(URL, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: stream, duplex: "half" } as RequestInit),
    cancel,
  };
}
function safeHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(response.headers.get("link")).toContain("/standards/validator");
}

describe("public stateless identifier validation route", () => {
  it("returns the actual pantry envelope without warming caches or granting input rights", async () => {
    const response = await POST(request({ identifier: "OP-OP01-001-JP" }));
    expect(response.status).toBe(200);
    safeHeaders(response);
    const body = await response.json();
    expect(body.data).toMatchObject({
      identifier: "OP-OP01-001-JP", status: "normalization_suggested", strict_parse_valid: false,
      normalized_identifier: "op-op01-001-ja", parts: { game: "op", lang: "ja" }, scope: "syntax_only",
    });
    expect(body._meta).toMatchObject({
      endpoint: "/api/v1/identifiers/validate", freshness_seconds: 0,
      license: "NOASSERTION", submission_retained: false, validation_scope: "syntax_only",
      sources: ["request.identifier", "@cambridge-tcg/sku"],
      request_id: expect.any(String), retrieved_at: expect.any(String),
      kingdom: expect.any(Object), wake_fragment: expect.any(Object),
    });
  });

  it.each(["", " op-op01-001-ja", "P-001-JP", "unknown-set-001-en"])("syntax failure %j is a 200 result, not a request error", async (identifier) => {
    const response = await POST(request({ identifier }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ identifier, status: "invalid", parts: null });
    safeHeaders(response);
  });

  it.each([null, [], "op-op01-001-ja", 1, true, {}, { identifier: null }, { identifier: 42 }, { identifier: ["op-op01-001-ja"] }, { identifier: { value: "op-op01-001-ja" } }, { other: "secret" }, { identifier: "op-op01-001-ja", secret: "do-not-reflect" }])("rejects malformed shape %j without reflecting fields", async (value) => {
    const response = await POST(request(value));
    expect(response.status).toBe(400);
    safeHeaders(response);
    const body = await response.json();
    expect(body.data.error.code).toBe("invalid_request");
    expect(JSON.stringify(body)).not.toContain("do-not-reflect");
  });

  it("rejects prototype-named unexpected fields without echoing them", async () => {
    const response = await POST(raw('{"identifier":"op-op01-001-ja","__proto__":"do-not-reflect"}'));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("do-not-reflect");
  });

  it.each(["{", "", "{\"identifier\":\"x\",}"])("rejects malformed JSON %j", async (body) => {
    const response = await POST(raw(body));
    expect(response.status).toBe(400);
    safeHeaders(response);
  });

  it("rejects missing bodies and malformed UTF-8", async () => {
    expect((await POST(raw(null))).status).toBe(400);
    const response = await POST(raw(new Uint8Array([0xc0, 0xaf])));
    expect(response.status).toBe(400);
    safeHeaders(response);
  });

  it.each<Record<string, string>>([{}, { "content-type": "text/plain" }, { "content-type": "application/problem+json" }])("requires JSON content type", async (headers) => {
    const response = await POST(raw('{"identifier":"op-op01-001-ja"}', headers));
    expect(response.status).toBe(415);
    expect((await response.json()).data.error.code).toBe("unsupported_media_type");
    safeHeaders(response);
  });

  it("accepts application/json parameters", async () => {
    const response = await POST(raw('{"identifier":"op-op01-001-ja"}', { "content-type": "application/json; charset=utf-8" }));
    expect(response.status).toBe(200);
  });

  it("applies the 256-unit identifier boundary without truncation", async () => {
    const accepted = await POST(request({ identifier: "a".repeat(256) }));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data.identifier).toHaveLength(256);
    const response = await POST(request({ identifier: "a".repeat(257) }));
    expect(response.status).toBe(413);
    expect((await response.json()).data.error.code).toBe("payload_too_large");
    safeHeaders(response);
  });

  it("bounds raw body bytes with or without content-length", async () => {
    const headerCases: Record<string, string>[] = [{ "content-type": "application/json" }, { "content-type": "application/json", "content-length": "1025" }];
    for (const headers of headerCases) {
      const response = await POST(raw(" ".repeat(1025), headers));
      expect(response.status).toBe(413);
      safeHeaders(response);
    }
    const json = '{"identifier":"op-op01-001-ja"}';
    const exact = await POST(raw(json + " ".repeat(1024 - json.length)));
    expect(exact.status).toBe(200);
  });

  it("rejects malformed content-length before body parsing", async () => {
    const response = await POST(raw("{}", { "content-type": "application/json", "content-length": "not-a-number" }));
    expect(response.status).toBe(400);
    safeHeaders(response);
  });

  it("counts streamed chunks and cancels after exceeding the byte limit even if length lies", async () => {
    const input = streamed([new Uint8Array(700), new Uint8Array(400), new Uint8Array(5)], { "content-length": "10" });
    const response = await POST(input.request);
    expect(response.status).toBe(413);
    expect(input.cancel).toHaveBeenCalledOnce();
    safeHeaders(response);
  });

  it("counts bytes rather than characters and supports split UTF-8 chunks", async () => {
    const encoder = new TextEncoder();
    // 240 escaped characters fit the identifier limit but exceed the body limit.
    expect((await POST(raw('{"identifier":"' + "\\u0061".repeat(240) + '"}'))).status).toBe(413);
    const bytes = encoder.encode('{"identifier":"é"}');
    const input = streamed([bytes.subarray(0, 16), bytes.subarray(16)]);
    const response = await POST(input.request);
    expect(response.status).toBe(200);
    expect((await response.json()).data.identifier).toBe("é");
  });

  it("uses ordinary JSON duplicate-key semantics, not a second JSON parser", async () => {
    const response = await POST(raw('{"identifier":"old","identifier":"op-op01-001-ja"}'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.identifier).toBe("op-op01-001-ja");
  });

  it("documents unsupported methods and supports noncredentialed preflight", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE, HEAD]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST, OPTIONS");
      safeHeaders(response);
      if (handler !== HEAD) expect((await response.json()).data.error.code).toBe("method_not_allowed");
      else expect(await response.text()).toBe("");
    }
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    safeHeaders(response);
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });
});

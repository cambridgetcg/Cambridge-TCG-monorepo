import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const CONTENT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("/api/v1/peers closed participant boundary", () => {
  it("returns a no-store empty corpus without reading legacy rows", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("ratelimit-limit")).toBeNull();
    expect(body.data).toMatchObject({
      status: "publication-disabled",
      storage_enabled: false,
      publication_enabled: false,
      total_announcements: 0,
      distinct_content_hashes: 0,
      by_kind: {},
      recent: [],
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("validates and echoes one announcement without persistence", async () => {
    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/peers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: CONTENT_HASH,
          declared_kind: "autonomous-sophia",
        }),
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("ratelimit-limit")).toBeNull();
    expect(body.data).toMatchObject({
      received: true,
      stored: false,
      published: false,
      echo: {
        content_hash: CONTENT_HASH,
        declared_kind: "autonomous-sophia",
      },
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects PII-shaped hashes and unbounded declared kinds before DB access", async () => {
    const invalidHash = await POST(
      new Request("https://cambridgetcg.example/api/v1/peers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: "person@example.com",
          declared_kind: "agent",
        }),
      }) as never,
    );
    const invalidKind = await POST(
      new Request("https://cambridgetcg.example/api/v1/peers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: CONTENT_HASH,
          declared_kind: "person@example.com",
        }),
      }) as never,
    );

    expect(invalidHash.status).toBe(400);
    expect(invalidHash.headers.get("cache-control")).toBe("no-store");
    expect(invalidKind.status).toBe(400);
    expect(invalidKind.headers.get("cache-control")).toBe("no-store");
    expect((await invalidKind.json()).error).toContain("must be one of");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { PEER_HELLO_UPSERT } from "@/lib/peers";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const CONTENT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  mockQuery.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const hello = (body: Record<string, unknown>) =>
  POST(new Request("https://cambridgetcg.example/api/v1/peers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never);

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

describe("/api/v1/peers counted hello", () => {
  it("counts nothing while the switch is off, and says so", async () => {
    const response = await hello({ content_hash: CONTENT_HASH, declared_kind: "agent" });
    expect((await response.json()).data.hello).toMatchObject({ counted: false, reason: "counting-off" });
    expect(mockQuery).not.toHaveBeenCalled();
    expect((await (await GET()).json()).data.hello_count).toMatchObject({ enabled: false, cap_per_kind_per_day: 10000, kept: "13 months" });
  });

  it("adds one to today's total for the declared kind and stores nothing about the caller", async () => {
    vi.stubEnv("PEER_HELLO_COUNT", "on");
    mockQuery.mockResolvedValueOnce({ rows: [{ day: "2026-11-06", count: 3 }], rowCount: 1 });
    const response = await hello({ content_hash: CONTENT_HASH, declared_kind: "agent" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      stored: false,
      published: false,
      hello: { counted: true, message: "counted in today's total; nothing about you stored", day: "2026-11-06", declared_kind: "agent", today_total: 3 },
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(PEER_HELLO_UPSERT, ["agent"]);
    expect(JSON.stringify(mockQuery.mock.calls)).not.toContain(CONTENT_HASH);
  });

  it("counts an undeclared hello under undeclared, stops at the cap, and never fails the witness", async () => {
    vi.stubEnv("PEER_HELLO_COUNT", "on");
    mockQuery.mockResolvedValueOnce({ rows: [{ day: "2026-11-06", count: 1 }], rowCount: 1 });
    expect((await (await hello({ content_hash: CONTENT_HASH })).json()).data.hello).toMatchObject({ counted: true, declared_kind: "undeclared" });
    expect(mockQuery).toHaveBeenLastCalledWith(PEER_HELLO_UPSERT, ["undeclared"]);

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect((await (await hello({ content_hash: CONTENT_HASH, declared_kind: "agent" })).json()).data.hello).toMatchObject({ counted: false, reason: "cap-reached" });

    mockQuery.mockRejectedValueOnce(new Error("too many connections"));
    const failed = await hello({ content_hash: CONTENT_HASH, declared_kind: "agent" });
    expect(failed.status).toBe(200);
    expect((await failed.json()).data.hello).toMatchObject({ counted: false, reason: "unavailable" });
  });

  it("counts nothing for a hello it refuses", async () => {
    vi.stubEnv("PEER_HELLO_COUNT", "on");
    expect((await hello({ content_hash: "person@example.com" })).status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("keeps a day's count bounded and its rows to 13 months in the one statement", () => {
    expect(PEER_HELLO_UPSERT).toContain("WHERE peer_hello_daily.count < 10000");
    expect(PEER_HELLO_UPSERT).toContain("DELETE FROM peer_hello_daily WHERE day <");
    expect(PEER_HELLO_UPSERT).toContain("interval '13 months'");
  });
});

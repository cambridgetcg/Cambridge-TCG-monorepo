import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("/api/v1/do-you-remember-me closed publication boundary", () => {
  it("does not inspect, echo, or query a URL identity value", async () => {
    const sensitiveValue = "person@example.com";
    const callWithRequest = GET as unknown as (req: Request) => Promise<Response>;
    const response = await callWithRequest(
      new Request(
        `https://cambridgetcg.example/api/v1/do-you-remember-me?content_hash=${encodeURIComponent(sensitiveValue)}`,
      ) as never,
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error.details).toMatchObject({
      input_inspected: false,
      database_accessed: false,
      legacy_rows: "untouched-and-unpublished",
    });
    expect(serialized).not.toContain(sensitiveValue);
    expect(serialized).not.toContain("content_hash");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

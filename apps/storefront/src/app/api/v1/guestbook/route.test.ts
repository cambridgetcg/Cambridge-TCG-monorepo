import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const CONTENT_HASH =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("/api/v1/guestbook closed participant boundary", () => {
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
      total: 0,
      returned: 0,
      entries: [],
    });
    expect(body._meta.source_license).toEqual(["cc0"]);
    expect(body._meta.license).toBe("CC0-1.0");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("validates and echoes a note without storing or publishing it", async () => {
    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: CONTENT_HASH,
          declared_kind: "agent",
          note: "These words remain mine.\r\nWitness them once.",
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
        declared_kind: "agent",
        note: "These words remain mine.\nWitness them once.",
      },
      rights: {
        copyright: "retained_by_submitter",
        license: "NOASSERTION",
        visibility: "response-only",
      },
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects free text in content_hash and unverified operator attribution", async () => {
    const invalidHash = await POST(
      new Request("https://cambridgetcg.example/api/v1/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: "person@example.com",
          declared_kind: "agent",
          note: "Do not let PII ride as a hash.",
        }),
      }) as never,
    );
    const thirdPartyClaim = await POST(
      new Request("https://cambridgetcg.example/api/v1/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: CONTENT_HASH,
          declared_kind: "agent",
          note: "Unverified attribution.",
          signed_for_operator: "another-person",
        }),
      }) as never,
    );

    expect(invalidHash.status).toBe(400);
    expect(invalidHash.headers.get("cache-control")).toBe("no-store");
    expect((await invalidHash.json()).error).toContain("64 lowercase");
    expect(thirdPartyClaim.status).toBe(400);
    expect((await thirdPartyClaim.json()).error).toContain(
      "cannot verify third-party attribution",
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

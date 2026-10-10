import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublicCollectives } from "@/lib/collectives/db";
import {
  DIRECTORY_MAX_LANGUAGE_LENGTH,
  DIRECTORY_MAX_OFFSET,
  DIRECTORY_MAX_QUERY_LENGTH,
  DIRECTORY_MAX_REGION_LENGTH,
} from "@/lib/collectives/directory-contract";
import { GET, OPTIONS } from "./route";

vi.mock("@/lib/collectives/db", () => ({
  listPublicCollectives: vi.fn(),
}));

const mockList = vi.mocked(listPublicCollectives);

beforeEach(() => {
  mockList.mockReset();
  mockList.mockResolvedValue({ collectives: [], total: 0 });
});

describe("GET /api/v1/directory/organisations", () => {
  it("separates steward fields from platform timestamps and withholds private ids", async () => {
    mockList.mockResolvedValueOnce({
      total: 1,
      collectives: [
        {
          steward_fields: {
            slug: "quiet-lab",
            display_name: "Quiet Lab",
            kind: "lab",
            region: "Cambridge",
            languages: ["en"],
            description: "A small lab.",
            house_rules: "Be gentle.",
          },
          platform_record: {
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-20T00:00:00.000Z",
          },
        },
      ],
    });

    const response = await GET(
      new Request(
        "https://example.test/api/v1/directory/organisations?kind=lab&limit=10&offset=2",
      ),
    );
    const body = await response.json();
    const organisation = body.data.organisations[0];
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mockList).toHaveBeenCalledWith({
      kind: "lab",
      region: null,
      language: null,
      q: null,
      limit: 10,
      offset: 2,
    });
    expect(organisation.steward_fields.display_name).toBe("Quiet Lab");
    expect(organisation.platform_record).toMatchObject({
      created_at: "2026-08-01T00:00:00.000Z",
      timestamp_meaning: expect.stringContaining("not publication timestamps"),
    });
    expect(organisation.rights).toMatchObject({
      steward_fields: {
        license: "NOASSERTION",
        copyright: "retained_by_rightsholder",
      },
      platform_record: { license: "CC0-1.0" },
    });
    expect(serialized).not.toMatch(
      /steward_user_id|active_member_count|collective_id|member_roster\":\[/,
    );
    expect(body._meta.license).toBe("NOASSERTION");
  });

  it.each([
    ["kind=everyone", "kind"],
    ["q=first&q=second", "q"],
    ["q=quiet%00lab", "q"],
    [`q=${"q".repeat(DIRECTORY_MAX_QUERY_LENGTH + 1)}`, "q"],
    [`region=${"r".repeat(DIRECTORY_MAX_REGION_LENGTH + 1)}`, "region"],
    [`language=${"l".repeat(DIRECTORY_MAX_LANGUAGE_LENGTH + 1)}`, "language"],
    ["limit=101", "limit"],
    ["limit=2.5", "limit"],
    ["limit=1&limit=2", "limit"],
    [`offset=${DIRECTORY_MAX_OFFSET + 1}`, "offset"],
    ["offset=-1", "offset"],
  ])("returns a canonical 400 for %s", async (query, param) => {
    const response = await GET(
      new Request(
        `https://example.test/api/v1/directory/organisations?${query}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toMatchObject({
      code: "INVALID_INPUT",
      details: { param },
    });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("does not apply CC0 or caching to an echoed caller-written filter", async () => {
    const response = await GET(
      new Request(
        "https://example.test/api/v1/directory/organisations?q=my%20own%20words",
      ),
    );
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.query.q).toBe("my own words");
    expect(body._meta.sources).toContain("caller-supplied directory filters");
    expect(body._meta.source_license).toContain("NOASSERTION");
    expect(body._meta.license).toBe("NOASSERTION");
  });

  it("keeps source licenses parallel when results and caller text coexist", async () => {
    mockList.mockResolvedValueOnce({
      total: 1,
      collectives: [
        {
          steward_fields: {
            slug: "quiet-lab",
            display_name: "Quiet Lab",
            kind: "lab",
            region: null,
            languages: [],
            description: null,
            house_rules: null,
          },
          platform_record: {
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-20T00:00:00.000Z",
          },
        },
      ],
    });

    const response = await GET(
      new Request(
        "https://example.test/api/v1/directory/organisations?q=quiet",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.sources).toHaveLength(3);
    expect(body._meta.source_license).toEqual([
      "cc0",
      "NOASSERTION",
      "NOASSERTION",
    ]);
  });

  it("serves CORS preflight for the public read", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
  });

  it("returns a canonical no-store CORS error when the database is unavailable", async () => {
    mockList.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(
      new Request("https://example.test/api/v1/directory/organisations"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.error).toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("keeps an empty later page no-store when its total is participant-derived", async () => {
    mockList.mockResolvedValueOnce({ collectives: [], total: 2_500 });

    const response = await GET(
      new Request(
        "https://example.test/api/v1/directory/organisations?offset=2400",
      ),
    );
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body._meta.sources).toContain("participant-self-declaration");
    expect(body._meta.license).toBe("NOASSERTION");
  });
});

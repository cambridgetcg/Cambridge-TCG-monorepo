import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  createCollective,
  listPublicCollectives,
  updateCollective,
} from "./db";
import {
  DIRECTORY_MAX_OFFSET,
  DIRECTORY_MAX_QUERY_LENGTH,
} from "./directory-contract";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("public collective directory query", () => {
  it("selects no private identifier or membership field", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total: "1",
          slug: "quiet-lab",
          display_name: "Quiet Lab",
          kind: "lab",
          region: null,
          languages: ["en"],
          description: "A small lab.",
          house_rules: null,
          platform_record_created_at: "2026-08-01T00:00:00.000Z",
          platform_record_updated_at: "2026-08-20T00:00:00.000Z",
        },
      ],
    } as never);

    const result = await listPublicCollectives({
      region: "100%_literal\\region",
      q: "name%_literal",
    });
    const listSql = String(mockQuery.mock.calls[0]?.[0]);
    const listParams = mockQuery.mock.calls[0]?.[1];

    expect(listSql).toContain("c.is_public = TRUE");
    expect(listSql).toContain("c.directory_publication_at IS NOT NULL");
    expect(listSql).toContain("c.directory_publication_version = $1");
    expect(listSql).toContain("WITH filtered AS MATERIALIZED");
    expect(listSql).toContain("LEFT JOIN LATERAL");
    expect(listSql).not.toMatch(
      /steward_user_id|collective_members|active_member_count|SELECT c\.id/,
    );
    expect(listParams).toEqual([
      "community-directory-v1",
      "%100\\%\\_literal\\\\region%",
      "%name\\%\\_literal%",
      24,
      0,
    ]);
    expect(result).toEqual({
      total: 1,
      collectives: [
        {
          steward_fields: {
            slug: "quiet-lab",
            display_name: "Quiet Lab",
            kind: "lab",
            region: null,
            languages: ["en"],
            description: "A small lab.",
            house_rules: null,
          },
          platform_record: {
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-20T00:00:00.000Z",
          },
        },
      ],
    });
  });

  it("returns a consistent total even when a bounded page has no rows", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          total: "2500",
          slug: null,
          display_name: null,
          kind: null,
          region: null,
          languages: null,
          description: null,
          house_rules: null,
          platform_record_created_at: null,
          platform_record_updated_at: null,
        },
      ],
    } as never);

    await expect(
      listPublicCollectives({ limit: 24, offset: 2_400 }),
    ).resolves.toEqual({ total: 2_500, collectives: [] });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ kind: "everyone" }, "kind must be one of"],
    [{ q: "q".repeat(DIRECTORY_MAX_QUERY_LENGTH + 1) }, "q exceeds"],
    [{ q: "quiet\0lab" }, "q must not contain control characters"],
    [{ limit: 101 }, "limit must be"],
    [{ offset: DIRECTORY_MAX_OFFSET + 1 }, "offset must be"],
  ])(
    "rejects an unsafe filter before any database read",
    async (filter, message) => {
      await expect(listPublicCollectives(filter as never)).rejects.toThrow(
        message,
      );
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  it("refuses to create a directory listing without a public profile", async () => {
    await expect(
      createCollective("user-1", {
        slug: "quiet-lab",
        display_name: "Quiet Lab",
        kind: "lab",
        is_public: false,
        directory_listed: true,
      }),
    ).rejects.toMatchObject({
      code: "directory_requires_public_profile",
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("records a current versioned receipt when a public profile opts in", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await updateCollective("collective-1", {
      is_public: true,
      directory_listed: true,
      directory_publication_version: "community-directory-v1",
    });

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toContain("is_public = $1");
    expect(sql).toContain("directory_publication_at = CASE WHEN $2");
    expect(sql).toContain(
      "directory_publication_version = CASE WHEN $2 THEN $3",
    );
    expect(sql).toContain("updated_at = NOW()");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      true,
      true,
      "community-directory-v1",
      "collective-1",
    ]);
  });

  it("clears the directory receipt atomically when the full form withdraws", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await updateCollective("collective-1", {
      is_public: false,
      directory_listed: false,
      directory_publication_version: "community-directory-v1",
    });

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toContain("is_public = $1");
    expect(sql).toContain("directory_publication_at = CASE WHEN $2");
    expect(sql).toContain("ELSE NULL END");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      false,
      false,
      "community-directory-v1",
      "collective-1",
    ]);
  });

  it("rejects a stale directory notice before any database write", async () => {
    await expect(
      updateCollective("collective-1", {
        is_public: true,
        directory_listed: true,
        directory_publication_version: "community-directory-v0",
      }),
    ).rejects.toMatchObject({ code: "stale_directory_publication_notice" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("bounds participant-authored fields at the server helper", async () => {
    await expect(
      updateCollective("collective-1", {
        languages: Array.from({ length: 13 }, (_, index) => `l${index}`),
      }),
    ).rejects.toMatchObject({ code: "too_many_languages" });
    await expect(
      updateCollective("collective-1", { description: "d".repeat(2_001) }),
    ).rejects.toMatchObject({ code: "description_too_long" });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

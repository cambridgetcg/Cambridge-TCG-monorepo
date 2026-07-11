import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));
vi.mock("@/lib/social/db", () => ({
  postActivity: vi.fn(),
  awardAchievement: vi.fn(),
}));
vi.mock("../email", () => ({
  sendWinnerEmail: vi.fn(),
  sendAuctionEndedAdminEmail: vi.fn(),
}));

import { listAuctions } from "../db";
import { PUBLIC_AUCTION_SQL_PREDICATE } from "../public";

describe("auction list publication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT COUNT(*) FROM auctions a")) {
        return { rows: [{ count: "0" }] };
      }
      return { rows: [] };
    });
  });

  it("gates public scheduled reads in both count and row queries", async () => {
    await listAuctions({ status: "scheduled", limit: 40 });

    const listQueries = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM auctions a"));
    expect(listQueries).toHaveLength(2);
    for (const sql of listQueries) {
      expect(sql).toContain(PUBLIC_AUCTION_SQL_PREDICATE);
      expect(sql).toContain("a.status = 'scheduled'");
    }
  });

  it.each([
    ["a missing status", {}],
    ["an unknown status", { status: "not-a-real-status" }],
  ])("still publication-gates %s", async (_label, filters) => {
    await listAuctions(filters);

    const listQueries = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM auctions a"));
    expect(listQueries).toHaveLength(2);
    for (const sql of listQueries) {
      expect(sql).toContain(PUBLIC_AUCTION_SQL_PREDICATE);
    }
  });

  it("allows only the explicit admin option to include unpublished rows", async () => {
    await listAuctions(
      { limit: 200 },
      { includeUnpublished: true },
    );

    const listQueries = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM auctions a"));
    expect(listQueries).toHaveLength(2);
    for (const sql of listQueries) {
      expect(sql).not.toContain(PUBLIC_AUCTION_SQL_PREDICATE);
    }
  });
});

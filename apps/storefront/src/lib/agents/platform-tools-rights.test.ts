import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: queryMock }));

import { catalogSearch, pricesRecent } from "./platform-tools";

describe("agent platform source-rights boundaries", () => {
  beforeEach(() => queryMock.mockReset());

  it("does not query or echo a catalog search", async () => {
    const result = await catalogSearch({}, { q: "personal-or-card-query", limit: 100 });

    expect(result).toMatchObject({
      error: { code: "CATALOG_SEARCH_PAUSED" },
      queried: false,
      catalog_membership_asserted: false,
      results: [],
    });
    expect(JSON.stringify(result)).not.toContain("personal-or-card-query");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("does not query or echo imported price-history parameters", async () => {
    const result = await pricesRecent({}, { sku: "private-caller-token", days: 90 });

    expect(result).toMatchObject({
      error: { code: "IMPORTED_PRICE_HISTORY_PAUSED" },
      queried: false,
      catalog_membership_asserted: false,
      observations: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-caller-token");
    expect(queryMock).not.toHaveBeenCalled();
  });
});

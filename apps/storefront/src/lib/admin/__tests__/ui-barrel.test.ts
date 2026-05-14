import { describe, it, expect } from "vitest";

describe("admin/ui — barrel exports", () => {
  it("exports all 21 expected primitives", async () => {
    const mod = await import("../ui");
    const expectedFunctions = [
      "PageHeader", "SectionHeading", "KpiCard", "KpiGrid",
      "StatusBadge", "DataTable", "EmptyState", "ErrorState",
      "ExternalLink", "Pagination", "SearchForm", "FilterPills",
      "ActionBanner", "Provenance", "Actor", "Audience",
      "audienceMetadata", "UserMention", "WhyLink", "Verifiability",
      "Discretion", "Withholding", "Consequences",
    ];
    for (const name of expectedFunctions) {
      expect(typeof (mod as Record<string, unknown>)[name], `${name} should be a function or object`).toMatch(/^(function|object)$/);
    }
  });

  it("exports DEFAULT_PALETTE as an object", async () => {
    const mod = await import("../ui");
    expect(typeof mod.DEFAULT_PALETTE).toBe("object");
  });
});

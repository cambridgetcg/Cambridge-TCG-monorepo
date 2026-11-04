import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The embedded admin quotes no results RewardsPro never measured: no
 * "increase lifetime value by 25%+", no "2-3x higher engagement", no
 * industry averages with no source.
 */

const appRoot = resolve(process.cwd(), "app");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** The pages and components a merchant sees in the embedded admin */
const adminSources = [
  ...readdirSync(join(appRoot, "routes"))
    .filter((name) => /^app[._].*\.tsx$/.test(name))
    .map((name) => join(appRoot, "routes", name)),
  ...files(join(appRoot, "components")),
];

const UNBACKED = [
  /\d+%\+/, // "25%+"
  /\bby \d+(\.\d+)?%/i, // "increase ... by 25%"
  /\b\d+(-\d+)?x (higher|faster|more|better)\b/i, // "2-3x higher engagement", "100x faster"
  /industry average/i,
];

describe("unbacked claims in the embedded admin", () => {
  it("scans the admin's pages and components", () => {
    expect(adminSources.length).toBeGreaterThan(50);
  });

  it.each(UNBACKED.map((pattern) => [String(pattern), pattern] as const))("quotes nothing matching %s", (_, pattern) => {
    const hits = adminSources.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line: line.trim(), where: `${relative(appRoot, path)}:${index + 1}` }))
        .filter(({ line }) => !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("{/*") && pattern.test(line))
        .map(({ where, line }) => `${where} ${line}`),
    );

    expect(hits).toEqual([]);
  });

  it("promises no boost the app never measured", () => {
    const claims = [
      ["routes/app.analytics.tsx", "boost engagement"],
      ["routes/app.analytics.tsx", "boost repeat purchases"],
      ["routes/app.analytics.tsx", "driving engagement"],
      ["routes/app.analytics.tsx", "keeps customers engaged"],
      // The two LTV averages cover different cohorts, so no conclusion is drawn from them
      ["routes/app.analytics.tsx", "at least half of what customers spend"],
    ];
    for (const [path, claim] of claims) {
      expect(readFileSync(join(appRoot, path), "utf8")).not.toContain(claim);
    }
  });

  it("words the cohort insights from the shop's own cohorts (utils/cohort-insights.ts)", () => {
    const source = readFileSync(join(appRoot, "routes/app.analytics.tsx"), "utf8");

    for (const insight of ["monthOneRetentionInsight(", "earlySpendInsight(", "tierProgressionInsight("]) {
      expect(source).toContain(insight);
    }
  });

  it("says how far back the order sync reaches", () => {
    // The sync page posts no start date, so it fetches the last 365 days (services/order-sync-job.server.ts)
    const source = readFileSync(join(appRoot, "routes/app.orders-sync.tsx"), "utf8");

    expect(source).not.toContain("Complete Order History");
    expect(source).toContain("Orders from the last 12 months");
  });
});

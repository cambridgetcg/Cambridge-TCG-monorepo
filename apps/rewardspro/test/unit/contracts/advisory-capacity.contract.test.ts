import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "app");

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf8");
}

describe("advisory-only plan capacities", () => {
  it("keeps ordinary numeric guards non-blocking", () => {
    const source = read("utils/require-feature.server.ts");
    const entitlementSource = read("services/entitlements.server.ts");
    const numericGuard = source.slice(
      source.indexOf("export async function requireWithinLimitAccess"),
      source.indexOf("export async function checkFeatureAccess"),
    );

    expect(numericGuard).toContain(
      "await checkLimitAccess(shop, limit, currentCount)",
    );
    expect(numericGuard).not.toContain("throw json");
    expect(source).toContain("hasAccess: true");
    expect(source).toContain("code: 'CAPACITY_ADVISORY'");
    const compatibilityGuard = entitlementSource.slice(
      entitlementSource.indexOf("export async function requireWithinLimit("),
    );
    expect(compatibilityGuard).not.toContain("throw new LimitExceededError");
  });

  it("continues atomic creates after a capacity advisory", () => {
    const source = read("utils/atomic-limit-control.server.ts");

    expect(source).not.toContain("throw new LimitExceededError");
    expect(source).not.toContain("status: 403");
    expect(source).toContain("creation remains available");
    expect(source).toContain("return createFn(tx)");
  });

  it("never locks or refuses email because of plan capacity", () => {
    const usageSource = read("services/email-usage-control.server.ts");
    const providerSource = read("services/email-provider.server.ts");

    expect(usageSource).not.toContain("allowed: false");
    expect(usageSource).not.toContain("isLocked: true");
    expect(usageSource).not.toContain("upgradeRequired: true");
    expect(providerSource).not.toContain("if (!usageCheck.allowed)");
    expect(providerSource).toContain("await reportEmailCapacity(shop, 1)");
    expect(providerSource).toContain(
      "await reportEmailCapacity(shop, recipientCount)",
    );
  });

  it("retains the Corporate gate for white-label controls", () => {
    const source = read("utils/require-feature.server.ts");

    expect(source).toContain(
      'feature === "whiteLabel" || feature === "prioritySupport"',
    );
    expect(source).toContain("return PRICING_PLANS.ultra.displayName");
  });

  it("never truncates a merchant data export at plan capacity", () => {
    const source = read("routes/api.members.export.tsx");

    expect(source).toContain("take: BATCH_SIZE");
    expect(source).toContain("'X-Export-Advisory-Limit'");
    expect(source).not.toContain("totalExported >= maxExportRows");
    expect(source).not.toContain("Math.min(BATCH_SIZE, remainingRows)");
  });

  it("never filters transaction history or analytics at plan capacity", () => {
    const exportSource = read("routes/app.analytics_.export.csv.tsx");
    const analyticsSource = read("routes/app.analytics.tsx");
    const analyticsDashboardSource = read("routes/app.analytics.tsx");

    expect(exportSource).toContain(
      "for await (const row of iterateTransactions(session.shop))",
    );
    expect(exportSource).toContain('"X-History-Advisory-Days"');
    expect(exportSource).not.toMatch(/"createdAt"\s*>=\s*\$\{minDate\}/);
    expect(exportSource).not.toContain("maxHistoricalDays <");
    expect(analyticsSource).not.toContain(
      "Math.min(requestedDays, maxHistoricalDays)",
    );
    expect(analyticsSource).toContain(
      "const days = parseInt(rangeDaysMatch[1], 10)",
    );
    expect(analyticsSource).toContain(
      "new Date(end.getTime() - days * 24 * 60 * 60 * 1000)",
    );
    expect(analyticsDashboardSource).toContain(
      "your existing history and exports remain available",
    );
    expect(analyticsDashboardSource).not.toContain("provides access to");
    expect(analyticsDashboardSource).not.toContain("Upgrade to Pro");
  });
});

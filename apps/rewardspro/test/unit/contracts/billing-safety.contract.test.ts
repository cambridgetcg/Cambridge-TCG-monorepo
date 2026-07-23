import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "app");
const projectRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf8");
}

function readProject(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("fixed-price billing safety", () => {
  it("contains no Shopify usage-charge mutation or usage line-item input", () => {
    const billingMutationSurfaces = [
      "shopify.server.ts",
      "services/billing/graphql-billing.service.ts",
      "services/billing/usage-record.service.ts",
      "routes/api.billing.usage.tsx",
      "routes/api.cron.usage-billing.tsx",
      "routes/api.review-claimed.tsx",
    ];

    for (const file of billingMutationSurfaces) {
      const source = read(file);
      expect(source, file).not.toContain("appUsageRecordCreate");
      expect(source, file).not.toContain("appUsagePricingDetails");
      expect(source, file).not.toContain("BillingInterval.Usage");
      expect(source, file).not.toContain("billing.createUsageRecord");
    }
  });

  it("does not let the review prompt create any subscription", () => {
    expect(read("routes/api.review-claimed.tsx")).not.toContain(
      "appSubscriptionCreate",
    );
  });

  it("rejects unknown purchase IDs instead of defaulting to a paid plan", () => {
    const billingRoute = read("routes/app.billing.tsx");
    expect(billingRoute).toContain('error: "Unknown paid plan"');
    expect(billingRoute).toContain("if (!planConstant || planId === \"free\")");
    expect(billingRoute).not.toContain("return planMap[planId] || PRO_PLAN");
  });

  it("never projects an unknown active Shopify plan to Free", () => {
    const projectionSurfaces = [
      "services/billing/subscription-persistence.server.ts",
      "routes/webhooks.app-subscriptions-update.tsx",
    ];

    for (const file of projectionSurfaces) {
      const source = read(file);
      expect(source, file).toContain("requireKnownPlanKey");
      expect(source, file).not.toContain("Default to free if unknown");
    }
  });

  it("records unknown cancelled SKUs without rewriting their plan identity", () => {
    const webhook = read("routes/webhooks.app-subscriptions-update.tsx");

    expect(webhook).toContain(
      "return tryGetPlanKey(planName) ?? previousPlanType",
    );
    expect(webhook).toContain(
      "existingBillingSubscription?.planType ?? null",
    );
    expect(webhook).not.toContain('tryGetPlanKey(planName) ?? "free"');
  });

  it("prefers the live legacy plan name over the default legacy key", () => {
    const entitlements = read("services/entitlements.server.ts");

    expect(entitlements).toContain(
      "shopSettings?.currentPlanName || shopSettings?.currentPlan",
    );
    expect(entitlements).toContain(
      "effectivePlan = normalizeKnownPlanName(legacyPlanName)",
    );
  });

  it("keeps the retired lock route non-blocking", () => {
    const lockedRoute = read("routes/app.locked.tsx");
    expect(lockedRoute).toContain("await unlockShop(session.shop)");
    expect(lockedRoute).not.toContain("App Access Temporarily Limited");
  });

  it("keeps obsolete entitlement migrations disconnected from the database", () => {
    for (const file of [
      "scripts/migrate-entitlements.ts",
      "scripts/migrate-add-shop-entitlements.ts",
    ]) {
      const source = readProject(file);
      expect(source, file).toContain("retired");
      expect(source, file).not.toContain("getAuroraClient");
      expect(source, file).not.toContain("createDataAPIPrismaClient");
    }
  });
});

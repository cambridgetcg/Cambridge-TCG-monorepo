import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("retired commercial doors", () => {
  it("removes direct subscription creation from both route handlers", () => {
    for (const path of ["app/routes/app.billing.tsx", "app/routes/app.settings._index.tsx"]) {
      const source = read(path);
      expect(source).not.toContain("await billing.request(");
      expect(source).toContain("paidSubscriptionsRetiredResult()");
      expect(source).toContain('"cancel-subscription"');
    }
  });

  it("does not advertise purchasable plans from either public landing page", () => {
    const pages = [read("landing/public/index.html"), read("app/routes/_index/route.tsx")];
    for (const source of pages) {
      expect(source).not.toContain("View Grow plan");
      expect(source).not.toContain("View Scale plan");
      expect(source).not.toContain("View Corporate plan");
      expect(source).not.toContain("Choose Your Plan");
      expect(source).not.toContain("pricingPlans.map");
    }
    expect(pages[0]).not.toContain('https://apps.shopify.com/rewards-pro');
    expect(pages[0]).toContain("Existing account support");
  });
});

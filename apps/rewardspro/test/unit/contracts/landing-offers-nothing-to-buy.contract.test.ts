import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * rewardspro.io's home page and the previous version's paid plans, carried from that app's
 * pricing-contract.test.ts and commercial-retirement.contract.test.ts when its code left (switch step B5).
 *
 * Two frozen stores still hold paid charges from it until the owner cancels them (apps/rewards/docs/switch.md, B4,
 * Decision 20). The app has no billing code and no records page, so the home page promises those shops only a way
 * to reach us, linked from its header. Merchant-facing copy doesn't talk about retirement
 * (docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md). The existing-agreements checks, the section and its
 * header link go once both charges are cancelled.
 */

const home = readFileSync(resolve(process.cwd(), "landing/public/index.html"), "utf8");

describe("rewardspro.io's home page and the old paid plans", () => {
  it("keeps the path for existing agreements and offers no plan to buy", () => {
    expect(home).toContain("If your store has an existing paid agreement for RewardsPro, write to us about its records or about cancelling it.");
    expect(home).toContain('href="/#existing-agreements"');
    expect(home).toContain('id="existing-agreements"');
    expect(home).toContain('Existing account support: <a href="mailto:contact@rewardspro.io">contact@rewardspro.io</a>');

    // The old public plans' monthly prices, as the old page showed them
    for (const price of [0, 29, 79, 499]) expect(home).not.toContain(`>$${price} <span>/ month</span>`);
    expect(home).not.toContain("$39 ");
    expect(home).not.toContain("$149 ");
    // Nor any amount by the month or the year, however it is marked up
    const words = home.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    expect(words).not.toMatch(/[$£€] ?\d[\d,.]* ?(?:\/|per|a) ?(?:month|mo\b|year|yr\b)/i);
    expect(home).not.toContain("Free Forever includes");
    expect(home).not.toContain("Trials are available");
    expect(home).not.toMatch(/href=["'][^"']*\/(?:signup|subscribe|checkout)(?:[/?#"'])/i);
  });

  it("advertises no plan to buy, and links to the App Store listing itself, never to a plan or a charge", () => {
    for (const words of ["View Grow plan", "View Scale plan", "View Corporate plan", "Choose Your Plan", "pricingPlans.map"]) {
      expect(home).not.toContain(words);
    }
    expect(home).toContain('href="https://apps.shopify.com/rewards-pro"');
    const listingUrls = new Set([...home.matchAll(/https:\/\/apps\.shopify\.com\/[^"'\s]*/g)].map(([url]) => url));
    expect([...listingUrls]).toEqual(["https://apps.shopify.com/rewards-pro"]);
  });
});

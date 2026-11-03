import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** Page text with line wrapping collapsed, so phrases match across lines. */
const readText = (path: string) => read(path).replace(/\s+/g, " ");

const LISTING = "https://apps.shopify.com/rewards-pro";
const PAGES = {
  landing: "landing/public/index.html",
  privacy: "landing/public/privacy-policy/index.html",
  terms: "landing/public/terms/index.html",
  subprocessors: "landing/public/subprocessors/index.html",
  notFound: "landing/public/404.html",
};

/** Providers the subprocessor page lists, by the data-provider attribute on each row. */
function listedProviders(html: string, scope: string): string[] {
  const rows = [...html.matchAll(/<tr data-provider="([^"]+)" data-scope="([^"]+)">/g)];
  return rows.filter(([, , rowScope]) => rowScope === scope).map(([, name]) => name).sort();
}

describe("rewardspro.io public texts", () => {
  it("has a terms page and a subprocessor page", () => {
    expect(existsSync(resolve(process.cwd(), PAGES.terms))).toBe(true);
    expect(existsSync(resolve(process.cwd(), PAGES.subprocessors))).toBe(true);
  });

  it("spells the name RewardsPro and sends every enquiry to contact@", () => {
    for (const path of Object.values(PAGES).filter((p) => existsSync(resolve(process.cwd(), p)))) {
      const html = readText(path);
      expect(html, path).not.toContain("Rewards Pro");
      expect(html, path).not.toContain("support@rewardspro.io");
    }
  });

  it("offers the App Store install and keeps one line for a paid agreement", () => {
    const landing = readText(PAGES.landing);
    expect(landing).toContain(`href="${LISTING}"`);
    expect(landing).toContain("Install on Shopify");
    expect(landing).not.toMatch(/retire/i);
    expect(landing.match(/Already on a paid agreement\?/g)).toHaveLength(1);
    expect(landing).toContain("It keeps its recorded terms.");
  });

  it("claims only what the app does today", () => {
    const landing = readText(PAGES.landing);
    // Nothing spends points yet, and store credit is the only reward shoppers receive
    expect(landing).not.toMatch(/spendable/i);
    // The customer-account extension and Shopify billing are gone
    expect(landing).not.toContain("<li>Customer accounts</li>");
    expect(landing).not.toContain("Shopify billing");
    // Real pause reasons: chance features await legal review; missions aren't in storefronts
    expect(landing).not.toContain("verified identity binding");
    expect(landing).toContain("until they have had a legal review");
    expect(landing).toContain("aren't open in storefronts yet");
  });

  it("says where data lives, without the deleted AWS account", () => {
    const privacy = readText(PAGES.privacy);
    expect(privacy).not.toMatch(/Amazon Web Services|\bAWS\b|Bedrock|\bSES\b|Sweden/);
    expect(privacy).not.toContain("23 July 2026");
    expect(privacy).toContain("Supabase");
    expect(privacy).toContain("London");
    expect(privacy).toContain("AI drafting is not offered");
  });

  it("describes uninstall and data requests as the code handles them", () => {
    const privacy = readText(PAGES.privacy);
    // webhooks.app.uninstalled.tsx erases everything at once (cleanupShopData)
    expect(privacy).toContain("we erase all of that shop’s RewardsPro records at once");
    expect(privacy).not.toContain("does not itself start");
    expect(privacy).not.toContain("manual intervention");
    // services/customer-data-request.server.ts REPORT_RETENTION_DAYS
    expect(privacy).toContain("45 days");
  });

  it("covers EU GDPR alongside UK GDPR", () => {
    const privacy = readText(PAGES.privacy);
    expect(privacy).toContain("EU GDPR");
    expect(privacy).toContain("Representative in the EU");
    expect(privacy).toContain("https://www.edpb.europa.eu/about-edpb/about-edpb/members_en");
    expect(privacy).toContain("https://ico.org.uk/make-a-complaint/");
  });

  it("carries an Article 28 data-processing section in the merchant terms", () => {
    const terms = readText(PAGES.terms);
    expect(terms).toContain("Cambridge TCG Limited");
    expect(terms).toContain("15680297");
    expect(terms).toContain('id="data-processing"');
    expect(terms).toContain("Article 28");
    expect(terms).toContain("adequacy decision");
    expect(terms).toContain("standard contractual clauses");
    expect(terms).toContain("England and Wales");
    expect(terms).toContain('href="/subprocessors/"');
    // No paid terms are drafted: paid plans are off
    expect(terms).not.toMatch(/\$\d|£\d+ ?\/ ?month|per month/i);
  });

  it("lists as subprocessors only the providers the app calls", () => {
    const page = readText(PAGES.subprocessors);
    expect(listedProviders(page, "shopper-data")).toEqual(["Sentry", "Supabase", "Twilio SendGrid", "Vercel"]);
    expect(listedProviders(page, "website")).toEqual(["Cloudflare", "GitBook"]);
    expect(page).not.toMatch(/Datadog|Amazon|\bAWS\b|Upstash|OpenAI|Anthropic|Google Analytics/);

    // Each shopper-data subprocessor is wired in the app
    expect(read("app/utils/database-connection.server.ts")).toContain("SUPABASE_ROOT_CA_2021");
    expect(read("vercel.json")).toContain('"lhr1"');
    expect(read("app/entry.client.tsx")).toContain("@sentry/remix");
    expect(read("app/services/sendgrid.server.ts")).toContain("https://api.sendgrid.com/v3");
  });

  it("links the new pages from the landing, the policy and the sitemap", () => {
    for (const path of [PAGES.landing, PAGES.privacy, PAGES.terms, PAGES.subprocessors]) {
      const html = readText(path);
      expect(html, path).toContain('href="/privacy-policy/"');
      expect(html, path).toContain('href="/terms/"');
      expect(html, path).toContain('href="/subprocessors/"');
    }
    const sitemap = read("landing/public/sitemap.xml");
    expect(sitemap).toContain("<loc>https://rewardspro.io/terms/</loc>");
    expect(sitemap).toContain("<loc>https://rewardspro.io/subprocessors/</loc>");
  });

  it("publishes a security.txt with a contact and an expiry (RFC 9116)", () => {
    const txt = read("landing/public/.well-known/security.txt");
    expect(txt).toMatch(/^Contact: mailto:contact@rewardspro\.io$/m);
    expect(txt).toMatch(/^Canonical: https:\/\/rewardspro\.io\/\.well-known\/security\.txt$/m);
    const expires = txt.match(/^Expires: (.+)$/m)?.[1];
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Number.isNaN(Date.parse(expires!))).toBe(false);
  });
});

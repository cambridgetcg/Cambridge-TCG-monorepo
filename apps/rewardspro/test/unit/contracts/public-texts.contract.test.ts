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
    expect(landing).toContain("It keeps the terms Shopify recorded when you approved it.");
    // Cancelling from the app looks the agreement up in tables that are empty since the move to Supabase
    expect(landing).not.toContain("Manage it from Subscription records");
    expect(landing).toContain("Shopify cancels an app's subscription when it is uninstalled");
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
    // Points, missions, raffle entries and box unlocks don't reach shoppers; no write_discounts scope for coupons
    expect(landing).not.toContain("calculates points, cashback, tiers, missions");
    expect(landing).not.toContain("from store credit to coupons");
    expect(landing).toContain("On Shopify, rewards are paid as store credit.");
  });

  it("gives Shopify's own limits on store credit", () => {
    const landing = readText(PAGES.landing);
    // help.shopify.com/en/manual/customers/store-credit
    expect(landing).toContain("signed in with Shopify customer accounts (not legacy accounts)");
    expect(landing).toContain("Shopify applies the full balance.");
    expect(landing).toContain("12 May 2025");
  });

  it("doesn't link the docs while they still call paid plans retired", () => {
    expect(readText(PAGES.landing)).not.toContain("docs.rewardspro.io");
  });

  it("says where data lives, without the deleted AWS account", () => {
    const privacy = readText(PAGES.privacy);
    expect(privacy).not.toMatch(/Amazon Web Services|\bAWS\b|Bedrock|\bSES\b|Sweden/);
    expect(privacy).not.toContain("23 July 2026");
    expect(privacy).toContain("Supabase");
    expect(privacy).toContain("London");
    expect(privacy).toContain("AI drafting is not offered");
    // contact@ is a Google Workspace mailbox (MX aspmx.l.google.com)
    expect(privacy).toContain("Google Workspace");
    // Cloudflare's email obfuscation isn't on for rewardspro.io
    expect(privacy).not.toMatch(/email-address protection|email-obfuscation|rewrite displayed email/);
  });

  it("describes monitoring and logs as they are once #128 is live", () => {
    for (const path of [PAGES.privacy, PAGES.subprocessors]) {
      // #128 removes Sentry session replay
      expect(readText(path), path).not.toMatch(/replay/i);
    }
    const privacy = readText(PAGES.privacy);
    expect(privacy).toContain("It does not record sessions.");
    expect(privacy).toContain("Tokens, cookies and email addresses are removed before events are sent.");
    expect(privacy).toContain("the names (not the values) of headers and query parameters");
    expect(privacy).not.toContain("may include request headers and submitted request content");
  });

  it("names the shopper emails that go out without a switch", () => {
    const privacy = readText(PAGES.privacy);
    // webhook-customer-sync.server.ts (welcome), webhooks.orders.paid.tsx (tier up and down),
    // api.cron.tier-maintenance.tsx (membership reminders at 7 and 1 days, and on expiry)
    expect(privacy).toContain("a welcome email when RewardsPro first adds a shopper to the programme, and an email when their tier goes up");
    expect(privacy).toContain("an email when a shopper’s tier goes down");
    expect(privacy).toContain("reminders 7 days and 1 day before it ends");
    expect(privacy).not.toContain("the emails a merchant switches on");
    expect(readText(PAGES.subprocessors)).not.toContain("the emails a merchant switches on");
    expect(readText(PAGES.terms)).not.toContain("the emails you switch on");
  });

  it("describes uninstall and data requests as the code handles them", () => {
    const privacy = readText(PAGES.privacy);
    // webhooks.app.uninstalled.tsx erases everything at once (cleanupShopData)
    expect(privacy).toContain("we erase all of that shop’s RewardsPro records at once");
    expect(privacy).not.toContain("does not itself start");
    expect(privacy).not.toContain("manual intervention");
    // services/customer-data-request.server.ts REPORT_RETENTION_DAYS
    expect(privacy).toContain("45 days");
    // webhook-cleanup runs on Sundays, so an expired report goes within a week
    expect(privacy).toContain("deleted at the weekly cleanup, so within 52 days");
    // Shopify retries a failed webhook up to eight times in four hours, then stops
    expect(privacy).toContain("Shopify retries the request for up to four hours");
    expect(privacy).not.toContain("and Shopify sends the request again");
    // cleanupShopData erases EmailSettings, suppression list included
    expect(privacy).toContain("it is erased with the shop’s other records on uninstall");
  });

  it("covers EU GDPR alongside UK GDPR", () => {
    const privacy = readText(PAGES.privacy);
    expect(privacy).toContain("EU GDPR");
    // The old members_en path now redirects here
    expect(privacy).toContain("https://www.edpb.europa.eu/about-edpb/our-members_en");
    expect(privacy).toContain("https://ico.org.uk/make-a-complaint/");
  });

  it("leaves every mention of an EU representative to Yu's decision", () => {
    // None is appointed; each passage carries a [Yu: ...] marker until he decides
    expect(readText(PAGES.privacy)).toContain("named in section 1. [Yu:");
    expect(readText(PAGES.terms)).toContain("Ours acts only for Cambridge TCG Limited. [Yu:");
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

  it("promises only what RewardsPro can keep", () => {
    const terms = readText(PAGES.terms);
    // No merchant email is stored; Shopify's shop.email is readable with the shop's token
    expect(terms).toContain("the email address Shopify uses to contact your store’s owner");
    // Recital 7 of Decision 2021/914 rules Module Two out where EU GDPR applies to us directly
    expect(terms).not.toContain("Module Two");
    expect(terms).toContain("the transfer safeguard the law then requires");
    expect(terms).toContain("We keep your shoppers’ data in a database in London, UK.");
    // api.members.export.tsx: email, Shopify ID, tier, cashback %, RewardsPro's store-credit figure
    expect(terms).toContain("RewardsPro’s record of store credit");
    expect(terms).toContain("Other records aren’t exported");
    // The Article 28 annex points at the full list rather than a shorter copy
    expect(terms).toContain("The categories listed for merchant shoppers in");
    // What #127 hides, and what has no Shopify scope
    for (const paused of ["points", "gift cards", "recurring memberships", "AI email drafting"]) {
      expect(terms).toContain(paused);
    }
  });

  it("lists as subprocessors only the providers the app calls", () => {
    const page = readText(PAGES.subprocessors);
    expect(listedProviders(page, "shopper-data")).toEqual(["Sentry", "Supabase", "Twilio SendGrid", "Vercel"]);
    expect(listedProviders(page, "website")).toEqual(["Cloudflare", "GitBook", "Google Workspace"]);
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

  it("refuses to publish while a [Yu: ...] placeholder or a precondition is open", () => {
    const deploy = read("DEPLOY.md");
    expect(deploy).toContain("! grep -rn '\\[Yu:' public && \\\n  wrangler pages deploy public");
    for (const precondition of ["#127", "#128", "vercel crons ls", "GA4_MEASUREMENT_ID", "shop { email }"]) {
      expect(deploy).toContain(precondition);
    }
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

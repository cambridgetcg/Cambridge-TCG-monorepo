import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * rewardspro.io's privacy and subprocessors pages (RP-07, #167) describe the
 * rebuilt app in apps/rewards. Each test pins a sentence and, next to it, the
 * code fact it rests on, so a change to either fails here.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** Page text with line wrapping collapsed, so phrases match across lines. */
const readText = (path: string) => read(path).replace(/\s+/g, " ");
const app = (path: string) => read(`../rewards/${path}`);

const PRIVACY = "landing/public/privacy-policy/index.html";
const SUBPROCESSORS = "landing/public/subprocessors/index.html";
const SITEMAP = "landing/public/sitemap.xml";

/** The fields of one model in the rebuilt app's Prisma schema. */
function modelFields(model: string): string[] {
  const block = app("prisma/schema.prisma").match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m"))?.[1];
  if (!block) throw new Error(`model ${model} not found`);
  return block
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => /^[a-z]/.test(name ?? ""));
}

/** The providers a subprocessors table lists, by each row's data-provider attribute. */
function listed(html: string, scope: string): string[] {
  return [...html.matchAll(/<tr data-provider="([^"]+)" data-scope="([^"]+)">/g)]
    .filter(([, , rowScope]) => rowScope === scope)
    .map(([, name]) => name)
    .sort();
}

describe("rewardspro.io privacy and subprocessors pages", () => {
  it("use the home page's look and name, and say who the company is", () => {
    for (const path of [PRIVACY, SUBPROCESSORS]) {
      const html = readText(path);
      expect(html, path).toContain('href="/assets/site.css"');
      expect(html, path).toContain('src="/assets/rewardspro-lockup-reversed.svg"');
      expect(html, path).not.toContain("Rewards Pro");
      // No bracketed placeholders left for the owner to fill
      expect(html, path).not.toContain("[");
    }
    const privacy = readText(PRIVACY);
    expect(privacy).toContain("Cambridge TCG Limited, a company registered in England and Wales, company number 15680297");
    expect(privacy).toContain("60 Tottenham Court Road, Suite 4583a, Fitzrovia, London, W1T 2EW");
    expect(privacy).toContain("Last updated 10 November 2026");
    expect(readText(SUBPROCESSORS)).toContain("List dated 10 November 2026");
  });

  it("names neither the old app's providers nor its features", () => {
    for (const path of [PRIVACY, SUBPROCESSORS]) {
      expect(readText(path), path).not.toMatch(/SendGrid|Klaviyo|Bedrock|Amazon Web Services|\bAWS\b|GitBook|Sweden|points|replay|Analytics and Speed/);
    }
    const deps = Object.keys(JSON.parse(app("package.json")).dependencies);
    expect(deps.filter((d) => /sendgrid|mail|klaviyo|analytics|speed-insights|openai|anthropic|bedrock/i.test(d))).toEqual([]);
  });

  it("says the database keeps no names or contact details of customers", () => {
    expect(readText(PRIVACY)).toContain(
      "The current app's records hold no customer names, email addresses, phone numbers or postal addresses",
    );
    for (const model of ["Customer", "Order", "Refund", "LedgerEntry", "Payout", "PrivacyRequest"]) {
      expect(modelFields(model).filter((f) => /email|phone|address|firstName|lastName|birthday/i.test(f)), model).toEqual([]);
    }
    // Names are read live for the pages and the CSV, never stored
    expect(app("app/shopify/names.server.ts")).toContain("RewardsPro stores no name");
    expect(app("app/routes/app.customers.export.tsx")).toContain("never stored");
    // Guest orders are not recorded
    expect(app("app/lib/record-order.server.ts")).toContain("Guest orders have no one to pay and are not recorded.");
  });

  it("gives the past-orders import's reach as the code sets it", () => {
    expect(readText(PRIVACY)).toContain(
      "reads the shop's orders from the 12 months before installation (the last 60 days, if Shopify hasn't given the app access to older orders)",
    );
    const bulk = app("app/shopify/bulk-import.server.ts");
    expect(bulk).toContain("export const IMPORT_HORIZON_DAYS = 365;");
    expect(bulk).toContain("export const SHORT_HORIZON_DAYS = 60;");
    expect(app("app/lib/import.server.ts")).toContain("earns nothing (reason `import`");
  });

  it("says RewardsPro sends no email, and that the store-credit email is Shopify's and off by default", () => {
    const privacy = readText(PRIVACY);
    expect(privacy).toContain("it asks Shopify to email a customer when they earn store credit. Shopify sends that email. RewardsPro sends no email.");
    expect(app("app/routes/app.settings._index.tsx")).toContain("Shopify sends this email itself. RewardsPro sends no email.");
    expect(app("prisma/schema.prisma")).toMatch(/notifyBuyers\s+Boolean\s+@default\(false\)/);
  });

  it("describes the widget as it is built", () => {
    expect(readText(PRIVACY)).toContain("The widget sets no cookies and stores nothing in the customer's browser.");
    expect(readText(PRIVACY)).toContain("For a guest, the widget sends no request to RewardsPro.");
    const widget = app("extensions/rewards-widget/assets/rewards-widget.js");
    expect(widget).not.toMatch(/cookie|localStorage|sessionStorage|indexedDB/i);
    expect(widget.match(/fetch\(/g)).toHaveLength(1);
    // The balance is held in memory briefly, never stored
    expect(readText(PRIVACY)).toContain("holds it in memory for up to 30 seconds, and never stores it");
    expect(app("app/shopify/live-balance.server.ts")).toContain("const CACHE_TTL_MS = 30 * 1000;");
  });

  it("gives the erasure timing and the data-request periods the code uses", () => {
    const privacy = readText(PRIVACY);
    expect(privacy).toContain("deletes its Shopify access tokens at once");
    expect(privacy).toContain("About 48 hours after the uninstall, Shopify asks the app to erase the shop's data");
    expect(privacy).toContain("a nightly job erases the records once 30 days have passed since the uninstall");
    expect(privacy).not.toMatch(/at once, in one step|within \d+ days of (the|your) uninstall/);
    expect(app("app/routes/webhooks.app.uninstalled.tsx")).toContain("prisma.session.deleteMany({ where: { shop } })");
    expect(app("app/routes/api.cron.housekeeping.tsx")).toContain("const ERASE_AFTER_MS = 30 * DAY_MS;");
    expect(app("vercel.json")).toContain('{ "path": "/api/cron/housekeeping", "schedule": "0 3 * * *" }');

    expect(privacy).toContain("It is due 30 days after it arrives, and the report can be downloaded for 45 days.");
    expect(privacy).toContain("builds the report from its records when it is downloaded and keeps no copy");
    const erasure = app("app/lib/erasure.server.ts");
    expect(erasure).toContain("export const REPORT_RETENTION_DAYS = 45;");
    expect(erasure).toContain("export const REPORT_DUE_DAYS = 30;");

    // customers/redact blanks the customer's id; their orders and amounts stay
    expect(privacy).toContain("but without the Shopify customer ID");
    expect(erasure).toContain("data: { externalCustomerId: null, redactedAt: now, lockedTierId: null }");
  });

  it("states the logs and error reports as they are", () => {
    const privacy = readText(PRIVACY);
    expect(privacy).toContain("keeps a log of each request to it for 1 day");
    expect(app("docs/switch.md")).toContain("for their retention (1 day on Pro)");
    // The Customers search text is in the request's web address, and staff can search by name or email
    for (const path of [PRIVACY, SUBPROCESSORS]) {
      expect(readText(path), path).toContain("Customers page, which can be a customer's name or email address");
    }
    expect(app("docs/switch.md")).toContain("the Customers search text (`/app/customers?q=`");
    expect(app("app/routes/app.customers._index.tsx")).toContain('placeholder="Search by name or email"');
    expect(privacy).toContain("the app removes tokens, cookies, IP addresses, query strings, request bodies and email addresses from it");
    expect(privacy).toContain("RewardsPro sends Sentry no performance traces and runs no session recording.");
    const entry = app("app/entry.server.tsx");
    expect(entry).toContain("tracesSampleRate: 0,");
    // No IP address is collected; request headers other than cookies still go
    expect(entry).toContain("userInfo: false,");
    expect(entry).not.toContain("httpHeaders");
    expect(privacy).toContain("the request's web address and headers, such as the browser type");
    expect(entry).toContain("beforeSend: (event) => scrubEvent(event),");
    // No browser SDK, so nothing records sessions
    expect(existsSync(resolve(process.cwd(), "../rewards/app/entry.client.tsx"))).toBe(false);
  });

  it("keeps the paragraph on the previous version's records while its schema exists", () => {
    const privacy = readText(PRIVACY);
    expect(privacy).toContain("the previous version of the app stopped running on 6 November 2026");
    expect(privacy).toContain("Shopify's privacy requests now reach only the current app's records");
    // Drop this test and the paragraph once B5 has dropped schema `rewardspro`
    expect(app("docs/switch.md")).toContain("dump, then drop, schema `rewardspro`");
  });

  it("lists as subprocessors the providers the app is wired to, and where they are", () => {
    const page = readText(SUBPROCESSORS);
    expect(listed(page, "customer-data")).toEqual(["Sentry", "Supabase", "Vercel"]);
    expect(listed(page, "website-and-email")).toEqual(["Cloudflare", "Google Workspace"]);

    expect(app("app/db/database-tls.server.ts")).toContain("SUPABASE_ROOT_CA_2021");
    expect(app("docs/switch.md")).toContain("The database is the Supabase project `rewardspro-prod` (London, eu-west-2)");
    expect(page).toContain("London, UK");
    expect(JSON.parse(app("vercel.json")).regions).toEqual(["lhr1"]);
    expect(page).toContain("The app runs in London, UK");
    expect(JSON.parse(app("package.json")).dependencies).toHaveProperty("@sentry/react-router");
    expect(read("landing/wrangler.toml")).toContain('name = "rewardspro-landing"');
  });

  it("links the two pages to each other and lists both in the sitemap", () => {
    expect(readText(PRIVACY)).toContain('href="/subprocessors/"');
    expect(readText(SUBPROCESSORS)).toContain('href="/privacy-policy/"');
    const sitemap = readText(SITEMAP);
    expect(sitemap).toContain("<loc>https://rewardspro.io/privacy-policy/</loc> <lastmod>2026-11-10</lastmod>");
    expect(sitemap).toContain("<loc>https://rewardspro.io/subprocessors/</loc> <lastmod>2026-11-10</lastmod>");
  });
});

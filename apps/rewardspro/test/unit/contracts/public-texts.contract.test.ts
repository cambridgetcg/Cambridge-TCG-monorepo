import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const HOME = "landing/public/index.html";
const PAGES = [HOME, "landing/public/help/index.html", "landing/public/404.html", PRIVACY, SUBPROCESSORS];

/** The home page's JSON-LD, parsed. */
const homeLd = () => JSON.parse(read(HOME).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);

/** RewardsPro's own accounts, opened or updated by the owner on 11 Nov 2026 with a link to rewardspro.io. */
const ACCOUNTS = [
  "https://www.youtube.com/@rewardsproapp",
  "https://x.com/rewardspro_",
  "https://bsky.app/profile/rewardspro.io",
  "https://www.instagram.com/rewardsproapp/",
];

/** Every file under a folder, dotfolders such as .well-known included. */
function filesUnder(dir: string): string[] {
  return readdirSync(resolve(process.cwd(), dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

describe("rewardspro.io home page", () => {
  it("says free only beside who funds the cashback, in the page and in its structured data", () => {
    const home = readText(HOME);
    expect(home).toContain("RewardsPro is free for every store that installs it, and no paid plans are offered.");
    expect(home).toContain("The cashback is store credit in your own shop, so you fund the cashback you give.");
    expect(home).toContain("The app is free; you fund the cashback.");
    expect(home).not.toMatch(/free forever|Rewards Pro|instant|points|raffle/i);

    const ld = homeLd();
    const appNode = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "SoftwareApplication");
    expect(appNode.offers.price).toBe("0");
    expect(appNode.offers.description).toContain("so the store funds the cashback it gives");
    expect(JSON.stringify(ld)).not.toMatch(/rating|review/i);
  });

  it("describes setup, earning and the widget as the app does them", () => {
    const home = readText(HOME);
    // The setup card's base rate makes the lowest tier, Everyone, in whole percent from 0 to 100
    expect(home).toContain("Start with a base cashback rate, a whole percent from 0 to 100. It becomes your lowest tier, <strong>Everyone</strong>");
    expect(app("app/lib/tiers.server.ts")).toContain('export const BASE_TIER_NAME = "Everyone";');
    expect(app("app/routes/app._index.tsx")).toMatch(/label="Your base cashback rate"\s+name="percent"\s+suffix="%"\s+min=\{0\}\s+max=\{100\}\s+step=\{1\}/);
    // What earns: the app's own words for the base
    expect(home).toContain("Cashback is paid on the product price after discounts, less any part of the order paid with store credit or gift cards.");
    expect(app("app/admin/words.ts")).toContain("Cashback is paid on the product price after discounts, less anything paid with store credit or gift cards.");
    // Orders/paid is the only order topic that records an order, so fulfilment isn't waited for
    expect(home).toContain("It doesn't wait for the order to be fulfilled.");
    expect(app("shopify.app.toml")).not.toMatch(/fulfil/i);
    // The widget's only language
    expect(home).toContain("The widget's text is in English.");
    expect(readdirSync(resolve(process.cwd(), "../rewards/extensions/rewards-widget/locales"))).toEqual(["en.default.json"]);
  });

  it("shows the listing's screenshots with sizes and alt text, and every page links the help page", () => {
    const html = read(HOME);
    const images = [...html.matchAll(/<img\s+src="\/assets\/screens\/([^"]+)"\s+alt="([^"]+)"\s+width="1200"\s+height="675"/g)];
    expect(images.map(([, file]) => file)).toEqual(["01-tiers.webp", "03-order.webp", "02-customer-locked.webp"]);
    for (const [, file, alt] of images) {
      expect(existsSync(resolve(process.cwd(), `landing/public/assets/screens/${file}`)), file).toBe(true);
      expect(alt.length, file).toBeGreaterThan(40);
    }
    expect(existsSync(resolve(process.cwd(), "landing/public/assets/screens/og-tiers.jpg"))).toBe(true);
    for (const path of PAGES) expect(read(path), path).toContain('<li><a href="/help/">Help</a></li>');
    expect(readText(SITEMAP)).toContain("<loc>https://rewardspro.io/</loc> <lastmod>2026-11-12</lastmod>");
  });

  it("gives back to customers who buy, and says no one earns cashback without a paid order, as the app does it", () => {
    const home = readText(HOME);
    // The owner's core concept of 12 Nov 2026, in the wording he said yes to (marketing/MESSAGING.md, top section)
    expect(home).toContain("<h1>Give back to customers who buy from you.</h1>");
    expect(home).toContain("with VIP tiers by spend and a widget on your storefront. No one earns cashback without a paid order.</p>");
    // One way only: some paid orders earn nothing, and the page points to the list
    expect(home).not.toMatch(/every paid order|every order earns|only (paying )?customers/i);
    expect(home).toContain('<a href="/help/#earn-nothing">Every order that earns nothing</a>');
    // The home page names no advertising (the opener about paying to find customers is for posts and video only)
    expect(home).not.toMatch(/\bads?\b|advert/i);

    // Payouts are created in two places: a recorded order's credit and a refund's debit
    const creators = filesUnder("../rewards/app")
      .filter((file) => /payout\.(create|createMany|createManyAndReturn|upsert)\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(file.lastIndexOf("/app/") + 1))
      .sort();
    expect(creators).toEqual(["app/lib/record-order.server.ts", "app/lib/refunds.server.ts"]);
    const record = app("app/lib/record-order.server.ts");
    expect(record).toMatch(/tx\.payout\.create\(\{\s+data: \{[^}]*direction: "credit"/);
    expect(app("app/lib/refunds.server.ts")).toMatch(/tx\.payout\.create\(\{\s+data: \{[^}]*direction: "debit"/);
    // An order with no customer is not recorded, and an imported order earns nothing
    expect(record).toContain('if (facts.externalCustomerId === null) return { status: "no_customer" };');
    expect(record).toContain('if (source === "import") return "import";');
    // recordOrder runs for orders/paid, the hourly sweep of paid or refunded orders, and the import
    const callers = filesUnder("../rewards/app")
      .filter((file) => /(?<!function )\brecordOrder\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(file.lastIndexOf("/app/") + 1))
      .sort();
    expect(callers).toEqual(["app/lib/import.server.ts", "app/lib/payout-check.server.ts", "app/routes/webhooks.orders.paid.tsx"]);
    expect(app("shopify.app.toml")).toMatch(/topics = \[ "orders\/paid" \]\s+uri = "\/webhooks\/orders\/paid"/);
    expect(app("app/shopify/order-source.server.ts")).toContain(
      "(financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)",
    );
  });

  it("says a customer who has spent more can be in a tier with a higher rate, if the shop sets one", () => {
    expect(readText(HOME)).toContain(
      "Add tiers by spend, each with its own cashback rate. So a customer who has spent more with you can be in a tier with a higher rate, if you set one.",
    );
    // A tier is a minimum spend and a rate the shop sets, a whole percent from 0 to 100
    expect(modelFields("Tier")).toEqual(expect.arrayContaining(["minSpend", "cashbackPercent"]));
    const tiers = app("app/lib/tiers.server.ts");
    expect(tiers).toContain("const percent = parseBaseRate(input.percent);");
    // By spend: the tier with the highest minimum the customer's spend has reached
    expect(tiers).toContain("if (tier.minSpend.lte(spend) && tier.minSpend.gt(chosen.minSpend)) chosen = tier;");
    // An order earns the locked tier's rate, or else the rate of the tier the customer holds
    expect(app("app/lib/record-order.server.ts")).toContain(
      "const rateTier = tiers.find((t) => t.id === (customer.lockedTierId ?? customer.tierId)) ?? null;",
    );
  });
});

const HELP = "landing/public/help/index.html";

describe("rewardspro.io help page", () => {
  it("says what a base rate of 0% does, with its limits, as the app does it", () => {
    const help = readText(HELP);
    const section = help.match(/<h3 id="zero-base-rate">[\s\S]*?<\/ul>/)?.[0] ?? "";
    // The owner's yes of 12 Nov 2026, item 4: the setting, said as a setting (marketing/claims.toml rp-zero-base-rate)
    expect(section).toContain("What does a base rate of 0% do?</h3>");
    expect(section).toContain("With a base rate of 0%, orders from customers in your lowest tier earn no cashback.");
    expect(section).toContain("A customer's orders earn cashback once they are in a tier you have set above 0%, by their spend or because you lock them to it, at that tier's rate.");
    expect(section).toContain('<a href="#earn-nothing">Which orders earn nothing?</a>');
    expect(help).toContain('<li>Orders from customers in a tier at 0%, such as your lowest tier at a <a href="#zero-base-rate">base rate of 0%</a>.</li>');
    // Not advice, and no promised result
    expect(section).not.toMatch(/\bonly\b|loyal|\brewards?\b|returning|come back|\bstays?\b|retention|relationship/i);

    // 0 is a rate the base rate field and Tiers both take
    const tiers = app("app/lib/tiers.server.ts");
    expect(tiers).toContain('if (typeof value !== "string" || !/^\\d{1,3}$/.test(value.trim())) return null;');
    expect(tiers).toContain("return percent <= 100 ? percent : null;");
    expect(tiers).toContain("const percent = parseBaseRate(input.percent);");
    // An order's rate is the locked tier's, else the held one's; at 0% it earns nothing but is still written
    const record = app("app/lib/record-order.server.ts");
    expect(record).toContain("const rateTier = tiers.find((t) => t.id === (customer.lockedTierId ?? customer.tierId)) ?? null;");
    expect(record).toMatch(/if \(amount\.gt\(0\)\) \{[\s\S]*?\} else \{\s+noCashback = "nothing_to_pay_on";/);
    // Orders shows "The rate gave nothing" only when the order had something to pay on and no earlier reason applied
    expect(section).toContain('When nothing else stops such an order earning, the <strong>Orders</strong> page shows it as "No cashback", with "The rate gave nothing on this order".');
    const orderStatus = app("app/lib/order-status.ts");
    expect(orderStatus).toContain('const RATE_GAVE_NOTHING = "The rate gave nothing on this order";');
    expect(orderStatus).toContain('if (o.noCashbackReason === "nothing_to_pay_on" && o.cashbackBase !== undefined && new Money(o.cashbackBase).gt(0)) {');
    expect(orderStatus).toContain('off: "Cashback was off",');

    // (1) A new customer starts in the lowest tier, and the tier moves only after the order is recorded
    expect(section).toContain("The order that takes a customer from your lowest tier into a higher one earns nothing, however large");
    expect(record).toContain("tierId: lowest?.id ?? null,");
    expect(app("app/routes/webhooks.orders.paid.tsx")).toMatch(/if \(payoutId\) await sendPayout\(payoutId, rail\);\s+await resolveTier\(result\.customerId\);/);
    // (2) Imported orders count as spend: the orders spend counts are filtered by test, cancellation and window, not source
    expect(section).toContain("Past orders brought in at install count towards tiers, so a customer can be in a tier above 0% before they order again.");
    const counted = tiers.match(/export function spendCounted[\s\S]*?\n\}/)?.[0] ?? "";
    expect(counted).toContain("test: false,");
    expect(counted).not.toContain("source");
    expect(app("app/shopify/bulk-import.server.ts")).toContain("const pass = await runTierPass(connectionId, { deadline, resolvedBefore });");
    // (3) Down with no grace, unless locked
    expect(section).toContain("they move down at the next update, with no grace period, unless they are locked.");
    expect(tiers).toContain("let target: TierRow | null = locked ?? null;");
    // (4) Moving back down takes back no cashback: a refund reads the refunded order's own entry, one with none takes
    // back nothing, and a tier move touches no ledger entry or payout
    expect(section).toContain("If a refund or a cancellation later moves a customer back down, the cashback their other orders earned in the higher tier is not taken back: a refund takes back at most the refunded order's own cashback, and the order that took them up from your lowest tier earned nothing to take back.");
    // A take-back is capped at what is left of that order's own cashback
    const facts = app("app/lib/order-facts.ts");
    expect(facts).toContain("if (i.completesOrder) return left;");
    expect(facts).toContain("return Money.max(0, Money.min(share, left));");
    const refunds = app("app/lib/refunds.server.ts");
    expect(refunds).toContain("where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: `cashback:${orderId}` } },");
    expect(refunds).toContain('if (!cashback || !credit || effect === "none") return nothing;');
    const resolveBody = tiers.match(/export async function resolveTier[\s\S]*?\n\}/)?.[0] ?? "";
    expect(resolveBody).toContain("data: changed ? { tierId, tierSince: tierId ? now : null, resolvedAt: now } : { resolvedAt: now },");
    expect(resolveBody).not.toMatch(/ledgerEntry|payout/);
    expect(app("app/routes/webhooks.orders.cancelled.tsx")).toContain("no money moves here");
    // (5) Cashback switches on with one tier at any rate
    expect(section).toContain("Cashback can be switched on before you add a tier above 0%, and until you do, no order earns any.");
    expect(app("app/lib/merchant.server.ts")).toContain("where: running ? { id: merchantId, tiers: { some: {} } } : { id: merchantId },");
    // (6) The widget, while cashback is on: a guest's rate only above 0; a signed-in customer's rate, 0 included; the next
    // tier above the held one without its rate, and none for a locked customer or one already qualifying above the held
    // tier; the top tier's line with a single tier; and a failed settings write left to the next write, of which the
    // nightly rewrite is one
    expect(section).toContain('While cashback is on, the widget shows guests the sign-in prompt without a rate, and signed-in customers in your lowest tier see "0% back as store credit".');
    expect(section).toContain("When there is a higher tier they can reach, the widget names the next one and the amount left to reach it, but not its rate; with a single tier, it says \"You are on the top tier\".");
    expect(section).toContain("If RewardsPro can't update the widget's settings in Shopify when you save 0%, guests can see the old rate until RewardsPro next writes them, such as in the nightly update.");
    // The next tier is the first above the held one's minimum, and the widget's line names it
    expect(tiers).toContain("const next = sorted.slice(index + 1).find((t) => t.minSpend.gt(current.minSpend));");
    // The settings are written on Home's switch and base rate, on every tier change, after each token exchange, and nightly
    expect(app("app/routes/app._index.tsx").match(/await tellWidget\(admin, conn\);/g)?.length).toBe(2);
    expect(app("app/shopify.server.ts")).toContain("afterAuth: onAppOpened,");
    expect(app("app/shopify/install.server.ts")).toContain("waitUntil(tellWidget(admin, connection, session.shop));");
    const widget = app("extensions/rewards-widget/assets/rewards-widget.js");
    expect(widget).toContain('if (root.getAttribute("data-running") === "true" && isFinite(base) && base > 0) {');
    expect(widget).toContain("if (data.running !== false && isNumber(tier.cashbackPercent)) {");
    expect(widget).toContain('if (p.isMaxTier) return [el("p", "rw-line", copy(root, "top"))];');
    expect(widget).not.toContain("nextTierCashbackPercent");
    expect(widget).toContain('copy(root, "to-next", { amount: money(root, p.amountRemaining, currency), tier: p.nextTierName })');
    const words = JSON.parse(app("extensions/rewards-widget/locales/en.default.json")).rewards_widget;
    expect(words.earn).toBe("{percent}% back as store credit");
    expect(words.to_next).toBe("{amount} more to reach {tier}");
    expect(words.top).toBe("You are on the top tier");
    expect(app("app/routes/api.proxy.$.tsx")).toContain("const stuck = !toNext.isTop && (locked !== undefined || qualify(spend, tiers).minSpend.gt(tier.minSpend));");
    expect(tiers).toContain("if (!next) return { percent: 100, ...none, isTop: true };");
    expect(app("app/routes/app.tiers.tsx")).toContain("Could not update the widget's settings");
    expect(app("app/routes/app._index.tsx")).toContain("Could not update the widget's settings");
    expect(app("app/routes/api.cron.housekeeping.tsx")).toContain("await syncWidgetConfig(admin, conn);");
    expect(app("vercel.json")).toContain('{ "path": "/api/cron/housekeeping", "schedule": "0 3 * * *" }');
    // (7) A lock needs a recorded order: only recordOrder creates a customer
    expect(section).toContain("Once that order is recorded, you can lock yourself to a tier above 0%, and your next order earns its rate.");
    const creators = filesUnder("../rewards/app")
      .filter((file) => /\bcustomer\.(create|createMany|createManyAndReturn|upsert)\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(file.lastIndexOf("/app/") + 1));
    expect(creators).toEqual(["app/lib/record-order.server.ts"]);

    expect(readText(SITEMAP)).toContain("<loc>https://rewardspro.io/help/</loc> <lastmod>2026-11-12</lastmod>");
  });

  it("names, in the list of orders that earn nothing, those whose cashback rounds to nothing and those whose payment status is never Paid, Partially refunded or Refunded", () => {
    // The home page says every order that earns nothing is listed there, so a kind the code adds must reach the list
    const list = readText(HELP).match(/<h3 id="earn-nothing">[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(list.match(/<li>/g)).toHaveLength(11);
    const record = app("app/lib/record-order.server.ts");
    expect(record).toContain('export type NoCashbackReason = "import" | "before_install" | "test" | "cancelled" | "off" | "no_tier" | "nothing_to_pay_on";');
    // no_tier is left off the list: cashback switches on only with a tier, and the lowest (so the last) tier can't be deleted
    expect(app("app/lib/merchant.server.ts")).toContain("where: running ? { id: merchantId, tiers: { some: {} } } : { id: merchantId },");
    expect(app("app/lib/tiers.server.ts")).toContain('if (lowest.id === tierId) return { ok: false as const, reason: "lowest" as const };');

    // Cashback that rounds to nothing at a rate above 0% earns nothing, recorded as nothing to pay on
    expect(list).toContain("<li>Orders with nothing to pay on, such as one paid in full with store credit, and orders whose cashback rounds to nothing, such as 5% of 9p.</li>");
    expect(readText(HELP)).toContain("<p>Cashback is rounded once, half up, to the currency's smallest unit, such as the penny.</p>");
    const money = app("app/lib/money.ts");
    expect(money).toContain("return roundMoney(new Money(base).times(percent).div(100), currency);");
    expect(money).toContain("return new Money(v).toDecimalPlaces(currencyDecimals(currency), Money.ROUND_HALF_UP);");
    expect(record).toContain("const amount = cashbackFor(issueBase, percent, currency);");
    expect(record).toMatch(/if \(amount\.gt\(0\)\) \{[\s\S]*?\} else \{\s+noCashback = "nothing_to_pay_on";/);
    // 5% of 9p is 0.45p, under the half penny that rounds up
    expect((9 * 5) / 100).toBeLessThan(0.5);

    // An order is recorded live only by orders/paid or by the hourly sweep, which lists paid, partly refunded and
    // refunded orders, so an order Shopify never shows as one of those is never recorded
    expect(list).toContain('<li>Orders whose payment status in Shopify is never "Paid", "Partially refunded" or "Refunded", such as one left "Partially paid".</li>');
    const callers = filesUnder("../rewards/app")
      .filter((file) => /(?<!function )\brecordOrder\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(file.lastIndexOf("/app/") + 1))
      .sort();
    expect(callers).toEqual(["app/lib/import.server.ts", "app/lib/payout-check.server.ts", "app/routes/webhooks.orders.paid.tsx"]);
    expect(app("app/routes/webhooks.orders.paid.tsx")).toContain('if (topic !== "ORDERS_PAID") return new Response(null, { status: 400 });');
    expect(app("app/shopify/order-source.server.ts")).toContain(
      "AND (financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)`;",
    );
    expect(app("app/lib/payout-check.server.ts")).toContain("const listed = await store.orders.recentlyUpdatedOrders(since, { deadline: ctx.deadline });");
    // The import's orders earn nothing whatever their status
    expect(record).toContain('if (source === "import") return "import";');
  });

  it("names, in the list of orders that earn nothing, those a reinstall leaves out, those placed before a currency change and those too large to read when RewardsPro comes to record them", () => {
    const help = readText(HELP);
    const list = help.match(/<h3 id="earn-nothing">[\s\S]*?<\/ul>/)?.[0] ?? "";
    const record = app("app/lib/record-order.server.ts");
    const merchant = app("app/lib/merchant.server.ts");
    const sweep = app("app/lib/payout-check.server.ts");
    const source = app("app/shopify/order-source.server.ts");
    const queries = app("app/shopify/graphql.ts");
    const between = (from: string, to: string) => {
      const [a, b] = [queries.indexOf(from), queries.indexOf(to)];
      expect(a, from).toBeGreaterThan(-1);
      expect(b, to).toBeGreaterThan(a);
      return queries.slice(a, b);
    };
    const orderFacts = between("query RewardsOrderFacts(", "query RewardsOrderTransactions(");
    const orderTransactions = between("query RewardsOrderTransactions(", "query RewardsRefundFacts(");
    const refundFacts = between("query RewardsRefundFacts(", "query RewardsUpdatedOrders(");

    // Before the first install: installedAt is set once, when the connection is created, and kept on reactivation.
    // shop/redact (Shopify sends it 48 hours after an uninstall) or the nightly pass 30 days after one erases every
    // row with a merchantId, the connection's too, unless the store is active again; the next install then creates
    // a new connection, so it is a first install
    expect(list).toContain(
      "<li>Orders placed before you first installed RewardsPro, even if they are paid later, and the past orders it brings in. An install after RewardsPro has erased your store's data, which can happen from 48 hours after you uninstall, counts as a first install.</li>",
    );
    expect(record).toContain('if (facts.orderedAt < conn.installedAt) return "before_install";');
    expect(merchant).toMatch(/if \(!existing\) \{[\s\S]*?status: "active",\s+installedAt: now,\s+activatedAt: now,/);
    const erasure = app("app/lib/erasure.server.ts");
    expect(erasure).toContain('const holdsMerchantRows = (model: DataModel) => model.fields.some((field) => field.kind === "scalar" && field.name === "merchantId");');
    expect(erasure).toContain("for (const model of merchantErasureOrder()) {");
    expect(erasure).toContain('if (connection?.status === "active") return { status: "skipped_active" };');
    expect(modelFields("Connection")).toContain("merchantId");
    expect(app("app/routes/webhooks.compliance.tsx")).toMatch(/if \(topic === "SHOP_REDACT"\) \{\s+const erasure = await eraseMerchant\(shop\);/);
    const housekeeping = app("app/routes/api.cron.housekeeping.tsx");
    expect(housekeeping).toContain("const ERASE_AFTER_MS = 30 * DAY_MS;");
    expect(housekeeping).toContain('where: { status: "uninstalled", uninstalledAt: { lt: new Date(now.getTime() - ERASE_AFTER_MS) } },');

    // A reinstall: an order placed in [uninstalledAt, activatedAt) earns nothing, and each uninstall and reinstall
    // overwrites them, so it is the absence before the order is recorded: one first recorded after a later uninstall
    // and reinstall is outside it. Nothing is recorded while the store is uninstalled; once it is back, an order
    // paid while it was away is recorded only if the sweep lists it (three days back), and then it earns: it was
    // placed before that uninstall
    expect(list).toContain(
      "<li>If you uninstall RewardsPro and install it again: orders placed while it was uninstalled, and orders paid while it was uninstalled that it doesn't find once it is back. An order placed while it was uninstalled can still earn if RewardsPro first records it after a later uninstall and reinstall.</li>",
    );
    expect(record).toContain("if (conn.uninstalledAt !== null && facts.orderedAt >= conn.uninstalledAt && facts.orderedAt < conn.activatedAt) {");
    expect(merchant).toContain('data: { status: "uninstalled", uninstalledAt: now },');
    expect(merchant).toContain('data: { status: "active", activatedAt: now, importLaunchedAt: null },');
    expect(merchant).toContain('...(o.evenUninstalled ? {} : { status: "active" as const })');
    expect(app("app/routes/webhooks.orders.paid.tsx")).toContain("const conn = await findConnection(shop);");
    expect(sweep).toMatch(/const connections = await prisma\.connection\.findMany\(\{\s+where: \{ status: "active" \},/);
    expect(sweep).toContain("const since = new Date(Math.max(ctx.now.getTime() - SWEEP_DAYS * DAY_MS, connection.installedAt.getTime()));");
    expect(sweep).toContain("export const SWEEP_DAYS = 3;");

    // A currency change: the order's shop money is Shopify's shop currency when the order was placed, and a read
    // fails when that isn't the shop's currency at the time of the read, read in the same query, for the order and
    // for each of its refunds. So after a change back, a read succeeds again: an order paid then, or one the sweep
    // lists then, is recorded, and a refund read then takes back its share. orders/paid answers 500 and the sweep
    // logs a problem, and with no change back the order is never recorded
    expect(list).toContain(
      "<li>Orders placed before you change your store's currency in Shopify and paid after the change. If you change it back, some of these can still earn.</li>",
    );
    expect(help).toContain(
      "<li>After you change your store's currency in Shopify, refunds of orders placed before the change take nothing back. If you change it back, some of these refunds can still take back their share.</li>",
    );
    expect(orderFacts).toMatch(/query RewardsOrderFacts\(\$id: ID!, \$after: String\) \{\s+shop \{\s+currencyCode\s+\}/);
    expect(source).toContain('const shopCurrency = text(rec(data.shop, "the shop").currencyCode, "the shop\'s currency");');
    expect(source).toContain('const orderShopCurrency = currencyOf(node.currencyCode, "the order\'s shop currency");');
    expect(source).toContain("if (orderShopCurrency !== shopCurrency) {");
    expect(source).toContain("throw new OrderReadError(`The order's shop money is in ${orderShopCurrency}, but the shop's currency is ${shopCurrency}`);");
    expect(source).toContain("return factsFromOrderNode({ ...read.node, transactions }, read.shopCurrency, { refunds: refundNodesRead });");
    expect(source).toContain("const order = parseOrderNode({ ...read.node, transactions }, read.shopCurrency);");
    // A recorded order's refunds reach its cashback only through readRefund: refunds/create and the sweep record
    // what it read, and recordOrder records only the refunds readOrder read with the order
    const appFiles = filesUnder("../rewards/app");
    const using = (pattern: RegExp) =>
      appFiles
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((file) => file.slice(file.lastIndexOf("/app/") + 1))
        .sort();
    expect(using(/(?<!function )\brecordRefund\(/)).toEqual(["app/lib/payout-check.server.ts", "app/routes/webhooks.orders.refunded.tsx"]);
    expect(using(/(?<!function )\brecordRefundInTransaction\(/)).toEqual(["app/lib/record-order.server.ts", "app/lib/refunds.server.ts"]);
    expect(using(/\.readRefund\(/)).toEqual(["app/lib/payout-check.server.ts", "app/routes/webhooks.orders.refunded.tsx"]);
    expect(app("app/routes/webhooks.orders.refunded.tsx")).toContain("result = await recordRefund(conn, read.orderGid, read.refund);");
    expect(sweep).toMatch(/const read = await store\.orders\.readRefund\(refundGid, \{ deadline: ctx\.deadline \}\);\s+if \(!read \|\| read\.orderGid !== order\.orderGid\) continue;\s+const recorded = await recordRefund\(conn, order\.orderGid, read\.refund\);/);

    // Too large to read: 25 pages of 100 lines, 200 transactions, 20 refunds, and in each refund read with the order,
    // more than 100 lines, or 20 transactions or shipping lines. Cashback is worked out once, when the order is
    // recorded, from that read; a later read changes what it earned only through a refund's take-back. Lines,
    // transactions and refunds only grow, so an order too large once stays too large
    expect(list).toContain(
      "<li>Orders too large for RewardsPro to read when it comes to record them: more than 2,500 lines, 200 or more transactions, 20 or more refunds, or a refund of more than 100 lines or with 20 or more transactions or shipping lines.</li>",
    );
    expect(source).toContain("export const MAX_LINE_PAGES = 25;");
    expect(source).toContain("const MAX_TRANSACTIONS = 200;");
    expect(source).toContain("const LIST_LIMIT = 20;");
    expect(source).toContain("if (items.length >= limit) throw new OrderReadError(");
    expect(source).toContain("if (refunds.length >= LIST_LIMIT) {");
    expect(source).toContain("if (first.length < LIST_LIMIT) return first;");
    expect(source).toContain('ensureWhole(all, MAX_TRANSACTIONS, "transactions");');
    expect(source).toContain('throw new OrderReadError("A refund returned more than 100 lines, the most one read takes");');
    expect(source).toContain('ensureWhole(transactions, LIST_LIMIT, "refund transactions");');
    expect(source).toContain('ensureWhole(shippingLines, LIST_LIMIT, "refund shipping lines");');
    expect(source).toContain("const refunds = refundsOf(order, productValue, nodes);");
    expect(record).toContain("const amount = cashbackFor(issueBase, percent, currency);");
    // The page sizes those limits are counted in: a larger page would read part of a list as the whole
    expect(orderFacts).toContain("lineItems(first: 100, after: $after) {");
    expect(orderFacts).toContain("transactions(first: 20) {");
    expect(orderFacts).toContain("refunds(first: 20) {");
    expect(orderTransactions).toContain("transactions(first: 200) {");
    expect(refundFacts).toContain("refundLineItems(first: 100) {");
    expect(refundFacts).toContain("transactions(first: 20) {");
    expect(refundFacts).toContain("refundShippingLines(first: 20) {");
  });
});

describe("rewardspro.io names RewardsPro's own accounts", () => {
  it("lists them as the app's sameAs in the home page's structured data, beside the listing", () => {
    const ld = homeLd();
    const appNode = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "SoftwareApplication");
    expect(appNode.sameAs).toEqual(["https://apps.shopify.com/rewards-pro", ...ACCOUNTS]);
    // The accounts are RewardsPro's, not the company's, so the maker's node claims none of them
    const maker = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "Organization");
    expect(maker.sameAs).toBeUndefined();
  });

  it("links them from one footer, the same bytes on every page", () => {
    const footers = PAGES.map((path) => read(path).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0]);
    for (const [i, footer] of footers.entries()) expect(footer, PAGES[i]).toBe(footers[0]);
    for (const url of ACCOUNTS) expect(footers[0]).toContain(`<a href="${url}">`);
  });

  it("never links the locked Instagram account, @rewardspro.io, anywhere under landing/public/", () => {
    const files = filesUnder("landing/public");
    expect(files.some((file) => file.endsWith("/.well-known/security.txt"))).toBe(true);
    for (const file of files) {
      const text = readFileSync(file, "latin1");
      expect(text, file).not.toMatch(/instagram\.com\/rewardspro\.io/i);
      // Every Instagram link on the site is the current account's
      for (const [link] of text.matchAll(/instagram\.com\/[^\s"'<>)]*/gi)) expect(link, file).toBe("instagram.com/rewardsproapp/");
    }
  });
});

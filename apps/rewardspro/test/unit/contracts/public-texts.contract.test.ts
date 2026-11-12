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
    expect(section).toContain("If a refund or a cancellation later moves a customer back down, the cashback their other orders earned in the higher tier is not taken back: a refund takes back the refunded order's own share and no more, and the order that took them up from your lowest tier earned nothing to take back.");
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
    // tier without its rate, and none for a locked customer or one already qualifying above the held tier; the top
    // tier's line with a single tier; and a failed settings write left to the nightly rewrite
    expect(section).toContain('While cashback is on, the widget shows guests the sign-in prompt without a rate, and signed-in customers in your lowest tier see "0% back as store credit".');
    expect(section).toContain("When there is a higher tier they can reach, the widget names it and the amount left to reach it, but not its rate; with a single tier, it says \"You are on the top tier\".");
    expect(section).toContain("If RewardsPro can't update the widget's settings in Shopify when you save 0%, guests see the old rate until the nightly update writes them again.");
    const widget = app("extensions/rewards-widget/assets/rewards-widget.js");
    expect(widget).toContain('if (root.getAttribute("data-running") === "true" && isFinite(base) && base > 0) {');
    expect(widget).toContain("if (data.running !== false && isNumber(tier.cashbackPercent)) {");
    expect(widget).toContain('if (p.isMaxTier) return [el("p", "rw-line", copy(root, "top"))];');
    expect(widget).not.toContain("nextTierCashbackPercent");
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

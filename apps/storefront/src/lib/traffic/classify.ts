/**
 * ctcg.actor-class/v1: what kind of client a request said it was, and which
 * route group it asked for, decided in memory while the hourly traffic pull
 * (pull.ts) counts an hour of Vercel's request logs. Ported from the
 * classifier the 2026-11-05 traffic study used (classify.py, kept with that
 * study, not in this repository), onto the words in
 * src/lib/observability/vocabulary.ts (migration 0148).
 *
 * Every class is declared, never verified: the logs carry no IP address to
 * check a user agent against, and bot names are spoofed. No class says
 * "human". The order matters and is part of the version:
 *   1. the path: a request for /.env, /.git, a key file, a PHP admin page or
 *      /api/fs is a probe whatever name it gives (spoofed bot names ask for
 *      exactly these);
 *   2. Cambridge's own clients: Vercel's cron, the estate's own monitors;
 *   3. declared names, from a fixed table (search, AI, SEO, preview, headless,
 *      scanners, MCP clients, HTTP libraries);
 *   4. the form robots.txt asks for, <project>/<version> (<contact>):
 *      declared-agent (the contact is never kept);
 *   5. any other name that says bot, crawler or spider: other-crawler;
 *   6. a browser-style user agent: browser-like-fleet when the same string
 *      came from at least FLEET_MIN_COUNTRIES countries within the hour (one
 *      person's browser is in one place in an hour; the study's rotating
 *      fleet was in a median 80), otherwise browser-like;
 *   7. unknown.
 *
 * Nothing here is stored but the words it returns. The user agent, path,
 * route, host and country are read once, in memory, and dropped with the
 * hour. Changing a rule changes what a word means, so it comes with a new
 * CLASSIFIER_VERSION, its migration and its /privacy note.
 */

import { PROJECTS } from "@/lib/admin/vercel";
import {
  CLASSIFIER_VERSION, ERROR_TAGS, includes, statusClass,
  type ActorClass, type CacheResult, type ErrorTag, type HostClass, type PathGroup, type StatusClass, type WafAction,
} from "@/lib/observability/vocabulary";

export { CLASSIFIER_VERSION };

/** Distinct countries within one hour that make a browser-style user agent
 * string a fleet. In the study's 24 hours (2026-11-04/05), 93% of
 * browser-style requests came from strings seen in 5 or more countries in
 * the same hour, and almost all of the rest from strings seen in one or two. */
export const FLEET_MIN_COUNTRIES = 5;

/** Paths only a probe asks for: dotfiles that hold secrets or history,
 * key and script files, PHP admin pages, and the filesystem API a scanner
 * guesses at. */
const PROBE_PATH = new RegExp([
  String.raw`(^|/)\.(env|git|svn|hg|aws|ssh|docker|npmrc|htpasswd|htaccess|ds_store)([._/-]|$)`,
  String.raw`\.(php\d?|asp|aspx|jsp|cgi|pem|key|sql|bak|swp)$`,
  String.raw`(^|/)(wp-admin|wp-content|wp-includes|wp-login|xmlrpc|phpmyadmin|cgi-bin|phpunit|server-status|actuator|id_rsa|id_dsa)([./]|$)`,
  String.raw`^/api/fs(/|$)`,
].join("|"), "i");

/** Declared names, first match wins. Ported from classify.py's family table:
 * same names, each given its class. Bots that name no operator or purpose
 * fall through to other-crawler (step 5). */
const DECLARED: readonly (readonly [ActorClass, RegExp])[] = [
  ["search-crawler", /Googlebot|Storebot-Google|Google-InspectionTool|GoogleOther|Google-Extended|AdsBot-Google|APIs-Google|Mediapartners-Google/],
  ["search-crawler", /bingbot|BingPreview|msnbot/],
  ["ai-search", /OAI-SearchBot/],
  ["ai-user-fetch", /ChatGPT-User/],
  ["ai-training-crawler", /GPTBot/],
  ["other-crawler", /OAI-AdsBot/],
  ["ai-training-crawler", /ClaudeBot/],
  ["ai-search", /Claude-SearchBot/],
  ["ai-user-fetch", /Claude-User/],
  // A coding agent fetching for the person running it.
  ["ai-user-fetch", /claude-code/],
  ["ai-search", /PerplexityBot/],
  ["ai-user-fetch", /Perplexity-User/],
  ["search-crawler", /Applebot/],
  ["seo-crawler", /AhrefsBot|SemrushBot|MJ12bot|DotBot|SERankingBacklinksBot/],
  ["ai-training-crawler", /meta-externalagent|Meta-ExternalAgent/],
  ["ai-user-fetch", /Meta-ExternalFetcher/],
  ["social-preview", /facebookexternalhit|Facebot/],
  // Amazon says Amazonbot's crawl may train its models.
  ["ai-training-crawler", /Amazonbot/],
  ["search-crawler", /Baiduspider/],
  ["ai-training-crawler", /Bytespider/],
  ["other-crawler", /TikTokSpider|ttspider/],
  ["search-crawler", /PetalBot/],
  ["headless-declared", /^Lightpanda|HeadlessChrome|PhantomJS/],
  ["ai-search", /DuckAssistBot/],
  ["search-crawler", /DuckDuckBot/],
  ["search-crawler", /Sogou/],
  ["ai-training-crawler", /CCBot/],
  ["ai-search", /ExaSearchBot|exa\.ai|Kimi-SearchBot|KimiBot|MoonshotBot|DeepSeekBot|Qwenbot|ChatGLM-Spider|GrokBot|YouBot|Querit|Bravebot|brave-search|TernCrawler/],
  ["search-crawler", /SeznamBot|Qwantbot|coccocbot|360Spider|YandexBot|Storebot/],
  ["social-preview", /Twitterbot|Slackbot|Discordbot|LinkedInBot|WhatsApp|TelegramBot|Pinterestbot|redditbot|Embedly|Iframely|SkypeUriPreview|Mastodon\//],
  ["scanner", /l9scan|leakfinder|LeakIX|Scanning-activity|nameserver-checker|AntiCloneBot|NoMoreVibe|TaifoonHarvester|LeadScraper|ProspectFlo|CreateSellMonitor/],
  ["mcp-client", /modelcontextprotocol|\bmcp-(remote|client|inspector)\b|^mcp\//i],
  ["library", /^(curl|Wget|python|Python|aiohttp|Go-http-client|node|axios|undici|okhttp|Java|libwww|Scrapy|PostmanRuntime|Bun|Deno)/],
];

/** robots.txt: "Recommend you send: User-Agent: <project>/<version> (<contact-email>)".
 * A URL counts as a contact too. Browser strings (Mozilla/…) are not this. */
const DECLARED_AGENT = /^(?!Mozilla\/)[A-Za-z0-9][\w.+-]*\/[\w.+-]+\s*\([^)]*(@|https?:\/\/)[^)]*\)/;
/** Step 5. A browser-style string only when it names its bot the way
 * crawlers do (Name/1.0 or "compatible; …bot"), so a phone model with BOT
 * in its name stays a browser. */
const CRAWLER_NAME = /bot|crawl|spider|agent|prefetch|research/i;
const CRAWLER_NAME_IN_BROWSER = /(bot|crawler|spider)[\w.-]*\/|compatible;[^)]*(bot|crawler|spider)/i;
const BROWSER_LIKE = /^Mozilla\/.*(Chrome|Safari|Firefox|Edg)\//;

/** A request's class before the hour is seen whole: browser-like is settled
 * into browser-like-fleet or browser-like by HourTally. */
export function declaredClass(userAgent: unknown, path: unknown): ActorClass {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (PROBE_PATH.test(bare(path))) return "probe";
  if (!ua) return "unknown";
  if (/^vercel-cron\//.test(ua)) return "cron-self";
  if (/^kingdom-(pulse|door-check)/.test(ua)) return "own-monitor";
  for (const [actor, pattern] of DECLARED) if (pattern.test(ua)) return actor;
  if (DECLARED_AGENT.test(ua)) return "declared-agent";
  const browser = BROWSER_LIKE.test(ua);
  if (browser ? CRAWLER_NAME_IN_BROWSER.test(ua) : CRAWLER_NAME.test(ua)) return "other-crawler";
  return browser ? "browser-like" : "unknown";
}

/** The path without query, fragment, page-data suffix or trailing slash. */
function bare(path: unknown): string {
  let p = (typeof path === "string" ? path : "").split(/[?#]/)[0]!;
  if (p.endsWith(".rsc")) p = p.slice(0, -4);
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p === "/index" || p === "" ? "/" : p;
}

/** p is base or under it. */
const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);
const UI_PREFS = new Set(["/api/lang-mode", "/api/appearance", "/api/text-mode", "/api/currency"]);
const STATIC_FILE = /\.(js|css|woff2?|png|jpe?g|svg|ico|webp|gif|map|txt)$/i;

/** The route group a path counts under (classify.py's path_group, with
 * segment-aware prefixes and the data-API and agent doors of 0148). No
 * SKU, set, slug, search term or account path survives it. */
export function pathGroup(path: unknown): PathGroup {
  const p = bare(path);
  if (p === "/") return "/";
  const v1: readonly [string, PathGroup][] = [
    ["/api/v1/member-prices", "/api/v1/member-prices"], ["/api/v1/market", "/api/v1/market/*"], ["/api/v1/prices", "/api/v1/prices/*"],
    ["/api/v1/sold-comps", "/api/v1/sold-comps/*"], ["/api/v1/cards", "/api/v1/cards/*"], ["/api/v1/sources", "/api/v1/sources"],
    ["/api/v1/universal", "/api/v1/universal/*"], ["/api/v1/plans", "/api/v1/plans"], ["/api/v1/account", "/api/v1/account/*"],
    ["/api/v1/feedback", "/api/v1/feedback"], ["/api/v1/peers", "/api/v1/peers"], ["/api/v1/guestbook", "/api/v1/guestbook"],
    ["/api/v1/agents", "/api/v1/agents/*"], ["/api/v1", "/api/v1/(other)"],
    ["/api/mcp", "/api/mcp"], ["/api/data-api", "/api/data-api/*"],
  ];
  for (const [base, group] of v1) if (under(p, base)) return group;
  if (p.startsWith("/.well-known/")) return "/.well-known/*";
  if (/^\/llms[^/]*\.txt$/.test(p)) return "/llms*.txt";
  if (under(p, "/standards") || p === "/standards.json") return "/standards";
  if (under(p, "/agents")) return "/agents";
  if (under(p, "/cards")) return "/cards/...";
  if (p === "/prices") return "/prices";
  if (under(p, "/prices/search")) return "/prices/search";
  if (p.startsWith("/prices/")) return "/prices/[game]/...";
  if (p.startsWith("/product/")) return "/product/[sku]";
  if (p === "/market") return "/market";
  if (p.startsWith("/market/")) return "/market/[sku]";
  if (under(p, "/api/auth")) return "/api/auth/*";
  if (under(p, "/api/market")) return "/api/market/*";
  if (under(p, "/api/account")) return "/api/account/*";
  if (under(p, "/api/cron")) return "/api/cron/*";
  if (UI_PREFS.has(p)) return "/api/(ui prefs)";
  if (under(p, "/api")) return "/api/(other)";
  if (p === "/robots.txt") return "/robots.txt";
  if (p.startsWith("/_next/") || STATIC_FILE.test(p)) return "static";
  if (p.startsWith("/sitemap")) return "/sitemap*";
  for (const [base, group] of [["/login", "/login"], ["/contact", "/contact"], ["/methodology", "/methodology/*"], ["/guides", "/guides/*"], ["/catalog", "/catalog"],
    ["/find", "/find"], ["/welcome-all", "/welcome-all"], ["/pulls", "/pulls/*"], ["/artists", "/artists/*"]] as const) {
    if (under(p, base)) return group;
  }
  return "(other page)";
}

/** A Next.js page-data fetch: Vercel's route for it ends .rsc (the path
 * itself does not, in the study's logs). */
export function isRsc(route: unknown, path: unknown): boolean {
  return (typeof route === "string" && route.endsWith(".rsc")) || (typeof path === "string" && path.split(/[?#]/)[0]!.endsWith(".rsc"));
}

const STOREFRONT = PROJECTS.find(project => project.key === "storefront")!;
const DEPLOY_URL = new RegExp(`^${STOREFRONT.name}-[a-z0-9-]+\\.vercel\\.app$`);

/** Which host a request reached: apex and www through Cloudflare; the
 * production alias and a deployment's own URL straight to Vercel. */
export function hostClass(host: unknown): HostClass {
  const h = (typeof host === "string" ? host : "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (h === STOREFRONT.domain) return "apex";
  if (h === `www.${STOREFRONT.domain}`) return "www";
  if (h === `${STOREFRONT.name}.vercel.app`) return "prod-alias";
  if (DEPLOY_URL.test(h)) return "deploy-url";
  return "other";
}

const CACHE: Readonly<Record<string, CacheResult>> = { hit: "hit", miss: "miss", bypass: "bypass", stale: "stale", prerender: "prerender", revalidated: "revalidated", "": "none" };
export function cacheResult(value: unknown): CacheResult {
  return CACHE[typeof value === "string" ? value.trim().toLowerCase() : ""] ?? "other";
}

/** Vercel's firewall action. "allow" (it let the request through) and no
 * action both count as none. */
const WAF: Readonly<Record<string, WafAction>> = { "": "none", allow: "none", log: "log", challenge: "challenge", deny: "deny", bypass: "bypass", rate_limit: "rate-limit", "rate-limit": "rate-limit" };
export function wafAction(value: unknown): WafAction {
  return WAF[typeof value === "string" ? value.trim().toLowerCase() : ""] ?? "other";
}

/** A CDN request record, as the pull selects it (vercel-logs.ts). */
export interface RequestRecord {
  requestHostname?: unknown; requestPath?: unknown; route?: unknown; httpStatus?: unknown;
  cacheResult?: unknown; wafAction?: unknown; clientUserAgent?: unknown; clientIpCountry?: unknown;
}

/** One traffic_hourly row, without its hour. */
export interface TrafficRow {
  host_class: HostClass; path_group: PathGroup; rsc: boolean; actor_class: ActorClass;
  classifier_version: typeof CLASSIFIER_VERSION; status_class: StatusClass; cache_result: CacheResult; waf_action: WafAction; count: number;
}

type Words = Omit<TrafficRow, "actor_class" | "classifier_version" | "count">;
const wordsKey = (words: Words) => `${words.host_class}\t${words.path_group}\t${words.rsc}\t${words.status_class}\t${words.cache_result}\t${words.waf_action}`;

/** One hour's counts, built in memory. Browser-style strings are held, with
 * the countries each came from, until the hour is whole, so the fleet rule
 * can see the hour; then only the words and counts leave (rows()). Nothing
 * here outlives the pull's run. */
export class HourTally {
  private readonly settled = new Map<string, { words: Words; actor: ActorClass; count: number }>();
  private readonly browsers = new Map<string, { countries: Set<string>; counts: Map<string, { words: Words; count: number }> }>();
  records = 0;

  add(record: RequestRecord): void {
    this.records += 1;
    const words: Words = {
      host_class: hostClass(record.requestHostname),
      path_group: pathGroup(record.requestPath),
      rsc: isRsc(record.route, record.requestPath),
      status_class: statusClass(typeof record.httpStatus === "number" ? record.httpStatus : Number(record.httpStatus ?? NaN)),
      cache_result: cacheResult(record.cacheResult),
      waf_action: wafAction(record.wafAction),
    };
    const actor = declaredClass(record.clientUserAgent, record.requestPath);
    const key = wordsKey(words);
    if (actor !== "browser-like") {
      const entry = this.settled.get(`${actor}\t${key}`) ?? { words, actor, count: 0 };
      entry.count += 1;
      this.settled.set(`${actor}\t${key}`, entry);
      return;
    }
    const ua = record.clientUserAgent as string;
    const browser = this.browsers.get(ua) ?? { countries: new Set<string>(), counts: new Map() };
    if (typeof record.clientIpCountry === "string" && /^[A-Z]{2}$/.test(record.clientIpCountry)) browser.countries.add(record.clientIpCountry);
    const entry = browser.counts.get(key) ?? { words, count: 0 };
    entry.count += 1;
    browser.counts.set(key, entry);
    this.browsers.set(ua, browser);
  }

  /** The hour's rows: words and counts only. */
  rows(): TrafficRow[] {
    const out = new Map<string, TrafficRow>();
    const put = (actor: ActorClass, words: Words, count: number) => {
      const key = `${actor}\t${wordsKey(words)}`;
      const row = out.get(key) ?? { ...words, actor_class: actor, classifier_version: CLASSIFIER_VERSION, count: 0 };
      row.count += count;
      out.set(key, row);
    };
    for (const { words, actor, count } of this.settled.values()) put(actor, words, count);
    for (const { countries, counts } of this.browsers.values()) {
      const actor: ActorClass = countries.size >= FLEET_MIN_COUNTRIES ? "browser-like-fleet" : "browser-like";
      for (const { words, count } of counts.values()) put(actor, words, count);
    }
    return [...out.values()];
  }
}

const ANSI = /\x1b\[[0-9;]*m/g;
const DB_CONNECTIONS = /too many connections|remaining connection slots/i;
const LISTED = ERROR_TAGS.filter(tag => tag !== "other" && tag !== "untagged");

/** A runtime log line's tag: its leading [tag], from ERROR_TAGS, else the
 * tag's first segment if that is listed ([cron/reconcile-stripe] counts as
 * cron), else other; untagged when it has none. A line about the database
 * running out of connections counts as db-connections whatever its tag, since
 * that is about the database, not the caller. The line itself is never kept. */
export function errorTag(message: unknown): ErrorTag {
  const line = (typeof message === "string" ? message : "").replace(ANSI, "");
  if (DB_CONNECTIONS.test(line)) return "db-connections";
  const tag = /^\s*\[([^\]\s]{1,64})\]/.exec(line)?.[1]?.toLowerCase();
  if (!tag) return "untagged";
  if (includes(LISTED, tag)) return tag;
  const head = tag.split("/")[0];
  return includes(LISTED, head) ? head : "other";
}

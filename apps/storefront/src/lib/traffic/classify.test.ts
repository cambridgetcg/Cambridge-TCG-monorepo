import { describe, expect, it } from "vitest";
import { ACTOR_CLASSES, CACHE_RESULTS, ERROR_TAGS, HOST_CLASSES, PATH_GROUPS, WAF_ACTIONS } from "@/lib/observability/vocabulary";
import {
  CLASSIFIER_VERSION, FLEET_MIN_COUNTRIES, HourTally, cacheResult, declaredClass, errorTag, hostClass, isRsc, pathGroup, wafAction,
  type RequestRecord,
} from "./classify";

// Synthetic user agents only: generic browser strings and the public names
// crawlers publish. None comes from the study's logs or names a person.
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const PHONE_NAMED_BOT = "Mozilla/5.0 (Linux; Android 12; EXAMPLEBOT X1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const UA = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  claudeUser: "Claude-User (claude-code/2.0.0; +https://support.anthropic.com/)",
  perplexity: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  semrush: "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
  lightpanda: "Lightpanda/1.0",
  curl: "curl/8.4.0",
  python: "python-requests/2.31.0",
  mcp: "mcp-remote/0.1.0",
  scanner: "Mozilla/5.0 (l9scan/2.0.0; +https://leakix.net)",
  cron: "vercel-cron/1.0",
  monitor: "kingdom-pulse/0.3",
  agent: "example-research/1.0 (ops@example.org)",
  agentUrl: "card-index/2.4 (+https://example.org/about)",
  noContact: "cardsync/1.0",
  unnamedBot: "Mozilla/5.0 (compatible; ExampleBot/1.0; +https://example.org/bot)",
  bareBot: "ExampleCrawlerService",
} as const;

describe("declaredClass (ctcg.actor-class/v1)", () => {
  it.each([
    // 1. The path first: a probe whatever name it gives.
    [UA.googlebot, "/.env", "probe"],
    [UA.claudeUser, "/.git/config", "probe"],
    [CHROME, "/wp-login.php", "probe"],
    [UA.perplexity, "/api/fs/read", "probe"],
    [UA.gptbot, "/certs/key.pem", "probe"],
    [UA.cron, "/api/auth/.env.local", "probe"],
    // 2. Cambridge's own clients.
    [UA.cron, "/api/cron/maintenance", "cron-self"],
    [UA.monitor, "/.well-known/sophia-wake/index.json", "own-monitor"],
    // 3. Declared names.
    [UA.googlebot, "/product/abc", "search-crawler"],
    [UA.gptbot, "/", "ai-training-crawler"],
    [UA.claudeUser, "/cards/op01", "ai-user-fetch"],
    [UA.perplexity, "/market", "ai-search"],
    [UA.semrush, "/prices", "seo-crawler"],
    [UA.facebook, "/", "social-preview"],
    [UA.headless, "/prices/pokemon", "headless-declared"],
    [UA.lightpanda, "/market", "headless-declared"],
    [UA.scanner, "/", "scanner"],
    [UA.mcp, "/api/mcp", "mcp-client"],
    [UA.curl, "/api/v1/status", "library"],
    [UA.python, "/api/v1/prices/pokemon", "library"],
    // 4. The form robots.txt asks for.
    [UA.agent, "/api/v1/welcome", "declared-agent"],
    [UA.agentUrl, "/api/v1/sets", "declared-agent"],
    // 5. Any other crawler name.
    [UA.unnamedBot, "/", "other-crawler"],
    [UA.bareBot, "/", "other-crawler"],
    // 6. Browser-style strings (the fleet rule needs the hour; see HourTally).
    [CHROME, "/product/abc", "browser-like"],
    [FIREFOX, "/", "browser-like"],
    [PHONE_NAMED_BOT, "/", "browser-like"],
    // 7. Everything else.
    [UA.noContact, "/", "unknown"],
    ["", "/", "unknown"],
    [undefined, "/", "unknown"],
    ["Opera/9.80", "/", "unknown"],
  ] as const)("%s on %s is %s", (ua, path, expected) => {
    expect(declaredClass(ua, path)).toBe(expected);
  });

  it("never answers human, verified or a word outside the list", () => {
    const answers = new Set([...Object.values(UA), CHROME, FIREFOX, "", "anything at all"].flatMap(ua => ["/", "/.env", "/api/cron/x"].map(path => declaredClass(ua, path))));
    for (const answer of answers) expect(ACTOR_CLASSES).toContain(answer);
    expect([...answers].join(" ")).not.toMatch(/human|verified/);
  });
});

describe("pathGroup", () => {
  it.each([
    ["/", "/"], ["", "/"], ["/index", "/"], ["/?q=charizard", "/"],
    ["/product/op-op01-001-ja", "/product/[sku]"], ["/product/pkm-sv1-025?ref=x", "/product/[sku]"],
    ["/market", "/market"], ["/market/", "/market"], ["/market/op-op05-119-en", "/market/[sku]"],
    ["/cards/op01/001", "/cards/..."], ["/prices", "/prices"], ["/prices/search", "/prices/search"], ["/prices/pokemon/sv1", "/prices/[game]/..."],
    ["/methodology/pricing", "/methodology/*"], ["/guides/buying", "/guides/*"], ["/standards", "/standards"], ["/standards.json", "/standards"],
    ["/standards/validator", "/standards"], ["/agents", "/agents"], ["/agents/guides/mcp", "/agents"], ["/agentsfoo", "(other page)"],
    ["/login", "/login"], ["/login/", "/login"], ["/contact", "/contact"], ["/robots.txt", "/robots.txt"], ["/sitemap.xml", "/sitemap*"],
    ["/llms.txt", "/llms*.txt"], ["/llms-full.txt", "/llms*.txt"], ["/.well-known/mcp.json", "/.well-known/*"],
    ["/api/mcp", "/api/mcp"], ["/api/mcp/catalog", "/api/mcp"],
    ["/api/v1/prices/games/pokemon/sets/sv1/cards/025", "/api/v1/prices/*"], ["/api/v1/pricesx", "/api/v1/(other)"],
    ["/api/v1/cards/op-op01-001-ja/everything", "/api/v1/cards/*"], ["/api/v1/cards/batch", "/api/v1/cards/*"],
    ["/api/v1/sold-comps/op01", "/api/v1/sold-comps/*"], ["/api/v1/sources/cardrush", "/api/v1/sources"], ["/api/v1/universal/search", "/api/v1/universal/*"],
    ["/api/v1/market/indices", "/api/v1/market/*"], ["/api/v1/member-prices", "/api/v1/member-prices"], ["/api/v1/plans", "/api/v1/plans"],
    ["/api/v1/account/usage", "/api/v1/account/*"], ["/api/v1/feedback", "/api/v1/feedback"], ["/api/v1/peers", "/api/v1/peers"],
    ["/api/v1/guestbook", "/api/v1/guestbook"], ["/api/v1/agents/notes", "/api/v1/agents/*"], ["/api/v1/welcome", "/api/v1/(other)"],
    ["/api/data-api/keys", "/api/data-api/*"], ["/api/market/offers/asks", "/api/market/*"], ["/api/auth/session", "/api/auth/*"],
    ["/api/auth/.env", "/api/auth/*"], ["/api/account/observations", "/api/account/*"], ["/api/cron/maintenance", "/api/cron/*"],
    ["/api/lang-mode", "/api/(ui prefs)"], ["/api/currency", "/api/(ui prefs)"], ["/api/openapi.json", "/api/(other)"],
    ["/_next/static/chunks/main.js", "static"], ["/favicon.ico", "static"], ["/og/card.png", "static"],
    ["/find", "/find"], ["/welcome-all", "/welcome-all"], ["/pulls/op01", "/pulls/*"], ["/artists/someone", "/artists/*"], ["/catalog", "/catalog"],
    ["/.env", "(other page)"], ["/terms", "(other page)"],
  ] as const)("%s → %s", (path, group) => {
    expect(pathGroup(path)).toBe(group);
  });

  it("returns only listed groups, whatever it is given, and never the path", () => {
    const paths = ["/x".repeat(500), "/%E2%82%AC", "//", "/product", "/api", "/api/v2/anything", "/.well-known", "/standards-x", "/llms/x.txt", 42, null, "/market/a/b/c?d=e#f"];
    for (const path of paths) expect(PATH_GROUPS).toContain(pathGroup(path));
    for (let i = 0; i < 500; i += 1) {
      const path = `/${Math.random().toString(36).slice(2)}/${Math.floor(Math.random() * 1e6)}`;
      expect(PATH_GROUPS).toContain(pathGroup(path));
    }
  });

  it("reads page-data fetches from Vercel's route", () => {
    expect(isRsc("/product/[sku].rsc", "/product/abc")).toBe(true);
    expect(isRsc("/product/[sku]", "/product/abc")).toBe(false);
    expect(isRsc(undefined, "/market.rsc")).toBe(true);
    expect(pathGroup("/market.rsc")).toBe("/market");
  });
});

describe("hosts, cache and firewall words", () => {
  it("classes the storefront's hosts", () => {
    expect(["cambridgetcg.com", "CAMBRIDGETCG.COM.", "www.cambridgetcg.com", "cambridgetcg-storefront.vercel.app",
      "cambridgetcg-storefront-abc123xyz-cambridgetcgs-projects.vercel.app", "cambridgetcg-storefront-git-main-cambridgetcgs-projects.vercel.app",
      "prices.cambridgetcg.com", "example.vercel.app", "", undefined].map(hostClass))
      .toEqual(["apex", "apex", "www", "prod-alias", "deploy-url", "deploy-url", "other", "other", "other", "other"]);
  });

  it("lowercases Vercel's cache result and counts allow as no firewall action", () => {
    expect(["MISS", "HIT", "BYPASS", "STALE", "PRERENDER", "REVALIDATED", "", undefined, "SOMETHING"].map(cacheResult))
      .toEqual(["miss", "hit", "bypass", "stale", "prerender", "revalidated", "none", "none", "other"]);
    expect(["allow", "", "deny", "challenge", "log", "bypass", "rate_limit", "redirect"].map(wafAction))
      .toEqual(["none", "none", "deny", "challenge", "log", "bypass", "rate-limit", "other"]);
    for (const word of ["MISS", "x"].map(cacheResult)) expect(CACHE_RESULTS).toContain(word);
    for (const word of ["allow", "x"].map(wafAction)) expect(WAF_ACTIONS).toContain(word);
    for (const word of ["cambridgetcg.com", "x"].map(hostClass)) expect(HOST_CLASSES).toContain(word);
  });
});

const record = (overrides: Partial<Record<keyof RequestRecord, unknown>> = {}): RequestRecord => ({
  requestHostname: "cambridgetcg.com", requestPath: "/product/op-op01-001-ja", route: "/product/[sku]", httpStatus: 200,
  cacheResult: "MISS", wafAction: "allow", clientUserAgent: CHROME, clientIpCountry: "GB", ...overrides,
});

describe("HourTally", () => {
  it(`calls a browser string a fleet when it came from ${FLEET_MIN_COUNTRIES} or more countries in the hour`, () => {
    const tally = new HourTally();
    for (const country of ["US", "SG", "JP", "DE", "BR", "BR", "", "not-a-code"]) tally.add(record({ clientIpCountry: country }));
    for (const country of ["GB", "GB", "FR", "NL"]) tally.add(record({ clientUserAgent: FIREFOX, clientIpCountry: country }));
    const rows = tally.rows();
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor_class: "browser-like-fleet", count: 8 }),
      expect.objectContaining({ actor_class: "browser-like", count: 4 }),
    ]));
    expect(rows.reduce((total, row) => total + row.count, 0)).toBe(tally.records);
  });

  it("keeps four countries a browser, since one person can travel but not be in five places in an hour", () => {
    const tally = new HourTally();
    for (const country of ["US", "SG", "JP", "DE"]) tally.add(record({ clientIpCountry: country }));
    expect(tally.rows()).toEqual([expect.objectContaining({ actor_class: "browser-like", count: 4 })]);
  });

  it("counts a synthetic hour by class, group and status, and lets no input text through", () => {
    const corpus: RequestRecord[] = [];
    const add = (count: number, overrides: Partial<Record<keyof RequestRecord, unknown>>) => { for (let i = 0; i < count; i += 1) corpus.push(record(overrides)); };
    const countries = ["US", "SG", "JP", "DE", "BR", "HK", "FR"];
    for (let i = 0; i < 70; i += 1) corpus.push(record({ clientIpCountry: countries[i % countries.length], requestPath: `/product/sku-${i}`, route: i % 2 ? "/product/[sku].rsc" : "/product/[sku]" }));
    add(5, { clientUserAgent: FIREFOX, requestPath: "/prices/pokemon/sv1", route: "/prices/[...slug]" });
    add(9, { clientUserAgent: UA.googlebot, requestPath: "/market/op-op05-119-en", httpStatus: 404 });
    add(3, { clientUserAgent: UA.claudeUser, requestPath: "/.env.production", httpStatus: 404, route: "/_not-found" });
    add(2, { clientUserAgent: UA.cron, requestPath: "/api/cron/traffic-pull", requestHostname: "cambridgetcg-storefront-abc123-cambridgetcgs-projects.vercel.app", cacheResult: "BYPASS" });
    add(4, { clientUserAgent: UA.agent, requestPath: "/api/v1/prices/games/pokemon", requestHostname: "cambridgetcg-storefront.vercel.app" });
    add(1, { clientUserAgent: UA.scanner, requestPath: "/wp-admin/setup.php", httpStatus: 403, wafAction: "deny" });

    const tally = new HourTally();
    for (const entry of corpus) tally.add(entry);
    const rows = tally.rows();
    const byClass = (actor: string) => rows.filter(row => row.actor_class === actor).reduce((total, row) => total + row.count, 0);
    expect({
      fleet: byClass("browser-like-fleet"), browser: byClass("browser-like"), search: byClass("search-crawler"), probe: byClass("probe"),
      cron: byClass("cron-self"), agent: byClass("declared-agent"),
    }).toEqual({ fleet: 70, browser: 5, search: 9, probe: 4, cron: 2, agent: 4 });
    expect(rows.reduce((total, row) => total + row.count, 0)).toBe(corpus.length);
    expect(rows.find(row => row.actor_class === "browser-like-fleet" && row.rsc)).toMatchObject({ path_group: "/product/[sku]", count: 35 });
    expect(rows.find(row => row.actor_class === "search-crawler")).toMatchObject({ path_group: "/market/[sku]", status_class: "404" });
    expect(rows.find(row => row.actor_class === "cron-self")).toMatchObject({ host_class: "deploy-url", cache_result: "bypass" });
    expect(rows.find(row => row.actor_class === "declared-agent")).toMatchObject({ host_class: "prod-alias", path_group: "/api/v1/prices/*" });
    expect(rows.find(row => row.waf_action === "deny")).toMatchObject({ actor_class: "probe", status_class: "403" });

    // Only the table's words leave: no user agent, path, SKU, host or country.
    const written = JSON.stringify(rows);
    for (const fragment of [CHROME, "Firefox", "Googlebot", "example.org", "sku-1", "op-op05", ".env", "wp-admin", "abc123", "vercel.app", "\"US\"", "\"GB\""]) {
      expect(written).not.toContain(fragment);
    }
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["actor_class", "cache_result", "classifier_version", "count", "host_class", "path_group", "rsc", "status_class", "waf_action"]);
      expect(row.classifier_version).toBe(CLASSIFIER_VERSION);
      expect(PATH_GROUPS).toContain(row.path_group);
      expect(ACTOR_CLASSES).toContain(row.actor_class);
    }
  });
});

describe("errorTag", () => {
  it.each([
    ["[wholesale] price-sources error 503", "wholesale"],
    ["[fairness-audit] CRITICAL FAILURE source=x", "fairness-audit"],
    ["[cron] trade completion sweep failed: COALESCE types integer and text cannot be matched", "cron"],
    ["[cron/collect/cardrush] host suspended", "cron/collect/cardrush"],
    ["[cron/reconcile-stripe] failed", "cron"],
    ["[ops/job-outcomes] not recorded", "ops"],
    ["\u001b[31m[auth][error]\u001b[0m UnknownAction: Unsupported action", "auth"],
    ["[wholesale] too many connections for role \"x\"", "db-connections"],
    ["[Something-New] it broke", "other"],
    ["    at Object.<anonymous> (/var/task/x.js:1:1)", "untagged"],
    ["", "untagged"],
    [undefined, "untagged"],
  ] as const)("%j → %s", (message, tag) => {
    expect(errorTag(message)).toBe(tag);
    expect(ERROR_TAGS).toContain(errorTag(message));
  });
});

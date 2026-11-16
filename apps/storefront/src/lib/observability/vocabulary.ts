/**
 * The fixed lists the observability tables store (migration 0148,
 * docs/operations/monitoring.md). Every column that says what kind of
 * request, actor, route or error a count is about holds one of these words,
 * never the request's own text: no raw path, user agent, query string,
 * referrer, body, message, IP address, or visitor, account or key id. The
 * migrations' CHECKs hold the same lists (0148, and 0150 for mcp_daily.tool;
 * vocabulary.test.ts compares them), so a writer that drifts is refused by
 * the database rather than storing something new.
 *
 * Changing a list is a privacy change: a new word is a new thing counted.
 * Traffic words are versioned by CLASSIFIER_VERSION; a new version comes with
 * a migration and its /privacy note, never by editing a word's meaning.
 */

/** The traffic classifier's version (ctcg.actor-class/vN). */
export const CLASSIFIER_VERSION = "ctcg.actor-class/v1" as const;
export const CLASSIFIER_VERSIONS = [CLASSIFIER_VERSION] as const;

/** Which host a request reached. apex and www are behind Cloudflare;
 * prod-alias (cambridgetcg-storefront.vercel.app) and deploy-url (one
 * deployment's own *.vercel.app) reach Vercel directly. */
export const HOST_CLASSES = ["apex", "www", "prod-alias", "deploy-url", "other"] as const;

/** Route templates, never paths: a request is counted under the group its
 * path falls in, so no SKU, set, search term or account route is stored.
 * "(other page)", "/api/(other)" and "/api/v1/(other)" take what no group
 * names. */
export const PATH_GROUPS = [
  "/",
  "/product/[sku]",
  "/market",
  "/market/[sku]",
  "/cards/...",
  "/catalog",
  "/prices",
  "/prices/search",
  "/prices/[game]/...",
  "/methodology/*",
  "/guides/*",
  "/standards",
  "/agents",
  "/find",
  "/welcome-all",
  "/pulls/*",
  "/artists/*",
  "/contact",
  "/login",
  "/robots.txt",
  "/sitemap*",
  "/llms*.txt",
  "/.well-known/*",
  "/api/mcp",
  "/api/v1/prices/*",
  "/api/v1/cards/*",
  "/api/v1/sold-comps/*",
  "/api/v1/sources",
  "/api/v1/universal/*",
  "/api/v1/market/*",
  "/api/v1/member-prices",
  "/api/v1/plans",
  "/api/v1/account/*",
  "/api/v1/feedback",
  "/api/v1/peers",
  "/api/v1/guestbook",
  "/api/v1/agents/*",
  "/api/v1/(other)",
  "/api/data-api/*",
  "/api/market/*",
  "/api/auth/*",
  "/api/account/*",
  "/api/cron/*",
  "/api/(ui prefs)",
  "/api/(other)",
  "static",
  "(other page)",
] as const;

/** ctcg.actor-class/v1. Every class is what a request declared (its user
 * agent) or the path it asked for: the logs carry no IP address or header to
 * verify a claim with, so none is "verified" and none is "human". Path
 * classes come first: a probe for /.env is a probe whatever name it gives. */
export const ACTOR_CLASSES = [
  "cron-self",
  "own-monitor",
  "probe",
  "ai-training-crawler",
  "ai-search",
  "ai-user-fetch",
  "search-crawler",
  "seo-crawler",
  "social-preview",
  "headless-declared",
  "library",
  "mcp-client",
  "scanner",
  "other-crawler",
  "declared-agent",
  "browser-like-fleet",
  "browser-like",
  "unknown",
] as const;

/** HTTP status, kept to the codes the panels read apart (401 from 404, say)
 * and otherwise its class. */
export const STATUS_CLASSES = ["2xx", "304", "3xx", "400", "401", "403", "404", "429", "4xx", "500", "503", "5xx", "other"] as const;

/** Vercel's cache result, lowercased; none when the record has none. */
export const CACHE_RESULTS = ["hit", "miss", "bypass", "stale", "prerender", "revalidated", "none", "other"] as const;

/** Vercel firewall action; none when the record has none. */
export const WAF_ACTIONS = ["none", "log", "challenge", "deny", "bypass", "rate-limit", "other"] as const;

/** Whether an hour's pull counted everything (ok), some of it (partial), or
 * nothing (failed), or whether the hour was left uncounted on purpose
 * because it began before counting started or restarted (skipped). An hour
 * with no pull row is unknown, never zero. */
export const TRAFFIC_PULL_STATUSES = ["ok", "partial", "failed", "skipped"] as const;

/** Runtime-log error tags: the bracketed prefix a log line starts with (or a
 * fixed pattern for the few untagged ones), never the line's text. "other"
 * is a tag outside this list; "untagged" is a line with none. */
export const ERROR_TAGS = [
  "wholesale",
  "fairness-audit",
  "cron",
  "cron/maintenance",
  "cron/collect/cardmarket",
  "cron/collect/cardrush",
  "cron/collect/tcgplayer",
  "cron/derive/market",
  "mcp",
  "webhook",
  "market",
  "auction",
  "data-api",
  "member-prices",
  "agents",
  "collector-observations",
  "cardmarket-collector",
  "db-connections",
  "auth",
  "ops",
  "other",
  "untagged",
] as const;

/** The JSON-RPC method of an /api/mcp request: an MCP-spec method, "native"
 * for a Cambridge dotted tool name used as the method, "other" for any other
 * name (ping, server/discover and notifications other than
 * notifications/initialized among them), "invalid" for a body that is not a
 * request or was never read (a web page on another site, refused first). The
 * caller's own method text is never stored. */
export const MCP_METHODS = [
  "initialize",
  "notifications/initialized",
  "tools/list",
  "tools/call",
  "resources/list",
  "prompts/list",
  "native",
  "other",
  "invalid",
] as const;

/** The gate's tool names (the TOOLS table in app/api/mcp/route.ts), plus
 * "none" (the method names no tool) and "unknown" (it names one the gate does
 * not have; that name is not stored). agent.revoke_key came with migration
 * 0150 and agent.act with 0152, which holds this list's CHECK since. */
export const MCP_TOOLS = [
  "agent.self",
  "agent.revoke_key",
  "agent.act",
  "play.list_open_rooms",
  "play.observe",
  "play.legal_actions",
  "play.take_action",
  "play.queue_match",
  "play.cancel_queue",
  "play.match_history",
  "catalog.search",
  "catalog.lookup_many",
  "leaderboards.read",
  "prices.recent",
  "deck.save",
  "deck.list_mine",
  "coverage.hunt.list",
  "coverage.hunt.view",
  "coverage.hunt.contribute",
  "coverage.hunt.my_cases",
  "mcp.list_tools",
  "none",
  "unknown",
] as const;

/** How the gate answered. */
export const MCP_OUTCOMES = [
  "ok",
  "notification",
  "invalid-request",
  "unauthenticated",
  "forbidden",
  "tool-error",
  "rate-limited",
  "not-found",
  "error",
] as const;

export type HostClass = (typeof HOST_CLASSES)[number];
export type PathGroup = (typeof PATH_GROUPS)[number];
export type ActorClass = (typeof ACTOR_CLASSES)[number];
export type StatusClass = (typeof STATUS_CLASSES)[number];
export type CacheResult = (typeof CACHE_RESULTS)[number];
export type WafAction = (typeof WAF_ACTIONS)[number];
export type TrafficPullStatus = (typeof TRAFFIC_PULL_STATUSES)[number];
export type ErrorTag = (typeof ERROR_TAGS)[number];
export type McpMethod = (typeof MCP_METHODS)[number];
export type McpTool = (typeof MCP_TOOLS)[number];
export type McpOutcome = (typeof MCP_OUTCOMES)[number];

export const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** A response status as STATUS_CLASSES counts it. */
export function statusClass(status: number): StatusClass {
  if (!Number.isInteger(status) || status < 200 || status > 599) return "other";
  const exact = String(status);
  if (includes(STATUS_CLASSES, exact)) return exact;
  return `${Math.floor(status / 100)}xx` as StatusClass;
}

#!/usr/bin/env tsx
/**
 * Audits the publication and reuse-right boundaries that are easiest to
 * reopen accidentally.
 *
 * Source metadata governs upstream rights. Public storage is not ownership,
 * and first-party storage is not participant consent. Unknown aggregate
 * rights stay NOASSERTION.
 *
 * Usage:
 *   pnpm --filter cambridgetcg-storefront redistribution
 *   pnpm audit:redistribution
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_DIR = dirname(SCRIPTS_DIR);
const REPO_ROOT = resolve(STOREFRONT_DIR, "..", "..");
const INGEST_SRC = resolve(REPO_ROOT, "packages", "data-ingest", "src");
const ACTIVE_SOURCE_ROOT = resolve(STOREFRONT_DIR, "src");
const ENVELOPE_SCHEMA_PATH = resolve(
  REPO_ROOT,
  "packages",
  "data-spec",
  "src",
  "schemas",
  "envelope.ts",
);

const REDISTRIBUTABLE_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa", "mit"]);

// An origin enters this set only after Cambridge has evidenced both ownership
// and publication permission. Storage location alone is never evidence.
const FIRST_PARTY_CC0_ORIGINS = new Set([
  // Cambridge-authored descriptions of datasets. This origin carries no
  // records from the datasets it describes and does not change their rights.
  "cambridge-tcg.dataset-registry",
  // Cambridge-authored typed gap ledger with an explicit CC0 dedication in
  // both packages/data-ingest/src/gaps.ts and docs/principles/known-gaps.md.
  "cambridge-tcg.known-gaps-registry",
]);

// ── The reviewed standard: CC0 export surfaces → their origins ───────────
//
// Edit this table (with review) when a new CC0 surface ships. Every origin
// listed here is then mechanically held to the coherence rule below. The
// table is deliberately explicit: it is the human decision the framework
// asks to be written down, not inferred.

interface Cc0Surface {
  surface: string;
  origins: string[];
  note: string;
}

const CC0_EXPORT_SURFACES: Cc0Surface[] = [
  {
    surface: "/api/v1/datasets",
    origins: ["cambridge-tcg.dataset-registry"],
    note:
      "The dataset catalog. Its CC0 envelope covers only our own authored " +
      "dataset descriptions (lib/datasets.ts); each listed dataset carries its " +
      "own licence and availability in-band. The catalog carries no records " +
      "from those datasets, so CC0 applies only to its authored metadata.",
  },
  {
    surface: "/api/v1/gaps",
    origins: ["cambridge-tcg.known-gaps-registry"],
    note:
      "The authored gap ledger and doctrine explicitly dedicate the corpus " +
      "to CC0; it contains platform gaps, not upstream catalog records.",
  },
];

// ── Findings ─────────────────────────────────────────────────────────────

interface Finding {
  check: number;
  boundary: string;
  message: string;
}

const findings: Finding[] = [];

function fail(check: number, boundary: string, message: string): void {
  findings.push({ check, boundary, message });
}

function source(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function requireText(
  check: number,
  boundary: string,
  body: string,
  expected: string,
  message: string,
): void {
  if (!body.includes(expected)) fail(check, boundary, message);
}

function forbidText(
  check: number,
  boundary: string,
  body: string,
  forbidden: string,
  message: string,
): void {
  if (body.includes(forbidden)) fail(check, boundary, message);
}

function requireBefore(
  check: number,
  boundary: string,
  body: string,
  guard: string,
  work: string,
  message: string,
): void {
  const guardAt = body.indexOf(guard);
  const workAt = body.indexOf(work);
  if (guardAt < 0 || workAt < 0 || guardAt > workAt) {
    fail(check, boundary, message);
  }
}

// The collect routes gate on collectionOn (collection-flags.ts), which the
// scheduling copy reads too. Pins its flag name and its exact-'on' rule, so the
// gate the routes call cannot loosen without this audit seeing it.
const COLLECTION_FLAGS = "apps/storefront/src/lib/datafeed/collection-flags.ts";
function requireCollectionGate(check: number, collected: string, flag: string): void {
  const flags = source(COLLECTION_FLAGS);
  requireText(check, COLLECTION_FLAGS, flags, `${collected}: '${flag}',`, `${collected}'s collection flag must stay ${flag}`);
  requireText(check, COLLECTION_FLAGS, functionBlock(flags, "export function collectionOn("), "return env[DATA_COLLECT_FLAGS[source]] === 'on';", "collectionOn must stay off unless the flag is exactly 'on'");
}

function activeSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...activeSourceFiles(path));
    } else if (
      /\.(ts|tsx|md)$/.test(entry.name) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".generated.")
    ) {
      files.push(path);
    }
  }
  return files;
}

interface SourceMetaShape {
  id: string;
  license: string;
  redistribute: boolean;
}

interface ModuleShape {
  meta: SourceMetaShape;
}

async function loadRegistry(): Promise<Record<string, ModuleShape | undefined>> {
  const registryUrl = `file://${resolve(INGEST_SRC, "registry.ts")}`;
  const mod = (await import(registryUrl)) as {
    SOURCES: Record<string, ModuleShape | undefined>;
  };
  return mod.SOURCES;
}

async function loadMetaSchema(): Promise<Record<string, unknown>> {
  const url = `file://${ENVELOPE_SCHEMA_PATH}`;
  const mod = (await import(url)) as { META_SCHEMA: Record<string, unknown> };
  return mod.META_SCHEMA;
}

function auditCc0Surfaces(
  sources: Record<string, ModuleShape | undefined>,
): number {
  let originsChecked = 0;

  for (const { surface, origins } of CC0_EXPORT_SURFACES) {
    for (const origin of origins) {
      originsChecked += 1;

      if (FIRST_PARTY_CC0_ORIGINS.has(origin)) continue;

      if (!(origin in sources)) {
        fail(
          1,
          `${surface} <- ${origin}`,
          "origin is neither an explicitly reviewed first-party CC0 origin nor a registered source",
        );
        continue;
      }

      const sourceModule = sources[origin];
      if (!sourceModule) {
        fail(
          1,
          `${surface} <- ${origin}`,
          "origin is only a reserved registry slot and has no rights declaration",
        );
        continue;
      }

      const { license, redistribute } = sourceModule.meta;
      if (!redistribute || !REDISTRIBUTABLE_LICENSES.has(license)) {
        fail(
          1,
          `${surface} <- ${origin}`,
          `source declares license '${license}' and redistribute:${redistribute}; it cannot feed a CC0 export`,
        );
      }
    }
  }

  return originsChecked;
}

function auditEnvelopeSchema(metaSchema: Record<string, unknown>): void {
  const required = Array.isArray(metaSchema.required)
    ? (metaSchema.required as string[])
    : [];
  const properties = (metaSchema.properties ?? {}) as Record<string, unknown>;

  if (!required.includes("sources")) {
    fail(2, "envelope schema", "_meta.sources must remain required");
  }

  const sourceLicense = properties.source_license as
    | { oneOf?: Array<{ items?: { enum?: string[] } }> }
    | undefined;
  if (!sourceLicense) {
    fail(
      2,
      "envelope schema",
      "_meta.source_license must remain available for per-source rights",
    );
    return;
  }

  const enumValues =
    sourceLicense.oneOf?.find((branch) => branch.items?.enum)?.items?.enum ?? [];
  const enumSet = new Set(enumValues);
  for (const license of REDISTRIBUTABLE_LICENSES) {
    if (!enumSet.has(license)) {
      fail(
        2,
        "envelope schema",
        `source_license is missing redistributable tier '${license}'`,
      );
    }
  }
}

function auditCatalog(): void {
  const catalog = source("apps/storefront/src/app/data/catalog.jsonl/route.ts");

  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    '"X-Content-License": "NOASSERTION"',
    "response header must declare aggregate rights NOASSERTION",
  );
  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    'license: "NOASSERTION"',
    "manifest must declare aggregate rights NOASSERTION",
  );
  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    'publication_status: "paused_pending_field_level_rights"',
    "bulk publication must remain visibly paused",
  );
  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    "count_expected: 0",
    "paused bulk publication must promise zero card rows",
  );
  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    "complete: false",
    "legacy clients must not treat the status response as a complete empty catalog",
  );
  requireText(
    3,
    "/data/catalog.jsonl",
    catalog,
    "status: 503",
    "paused bulk publication must use an unavailable HTTP status",
  );
  forbidText(
    3,
    "/data/catalog.jsonl",
    catalog,
    "mirror freely",
    "public access must not be described as blanket redistribution permission",
  );
  for (const forbidden of ["@/lib/db", "FROM card_set_cards", '"@kind": "card"', "price_gbp:"]) {
    forbidText(
      3,
      "/data/catalog.jsonl",
      catalog,
      forbidden,
      `paused route must not contain '${forbidden}'`,
    );
  }
}

/** A script that must refuse: its refusal is its first statement, at the
 * top level, with only comments and imports before it, and nothing can switch
 * it off. Its imports are Node built-ins and pg alone, because an imported
 * module runs before any statement of the script. */
function requireRefusedScript(check: number, path: string, prefix: string, message: string): void {
  const body = source(path);
  const staticImport = /^import\b[^;()]*?["']([^"'\n]+)["'];$/gm;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refusal = new RegExp(`^console\\.error\\("${escaped}[^"\\\\\\n]*"\\);\\nprocess\\.exit\\(1\\);$`, "m").exec(body);
  const beforeRefusal = refusal
    ? body.slice(0, refusal.index).replace(/\/\*[\s\S]*?\*\//g, "").replace(staticImport, "").replace(/^\/\/.*$/gm, "").trim()
    : null;
  if (beforeRefusal !== "") fail(check, path, message);
  for (const [, specifier] of body.matchAll(staticImport)) {
    if (!specifier!.startsWith("node:") && specifier !== "pg") fail(check, path, `a refused script must import nothing that runs before its refusal: '${specifier}'`);
  }
}

function auditAcquisitionLocks(): void {
  const cardrush = source("packages/data-ingest/src/cardrush/index.ts");
  requireText(7, "CardRush acquisition", cardrush, "CARDRUSH_ACQUISITION_ENABLED = false as const", "CardRush immutable acquisition lock must remain false");
  requireText(7, "CardRush acquisition", cardrush, "https://cardrush.media/data_policy", "CardRush lock must name the official cross-site policy");

  const tcgcollectorPolicy = source("packages/data-ingest/src/tcgcollector/policy.ts");
  const tcgcollector = source("packages/data-ingest/src/tcgcollector/index.ts");
  requireText(7, "TCGCollector acquisition", tcgcollectorPolicy, "TCGCOLLECTOR_ACQUISITION_ENABLED = false as const", "TCGCollector immutable acquisition lock must remain false");
  requireText(7, "TCGCollector acquisition", tcgcollectorPolicy, "https://www.tcgcollector.com/legal/terms-of-service", "TCGCollector lock must name the official terms");
  requireText(7, "TCGCollector registry", tcgcollector, 'status: "blocked"', "TCGCollector source status must remain blocked");

  const vercel = source("apps/wholesale/vercel.json");
  for (const route of ["ingest/cardrush", "discover/cardrush", "cardrush-hires", "price-snapshot", "discover/tcgcollector"]) {
    forbidText(7, "apps/wholesale/vercel.json", vercel, route, `scheduled acquisition route '${route}' must remain absent`);
  }

  for (const path of [
    "apps/wholesale/tools/lib/cardrush-client.ts",
    "apps/wholesale/tools/lib/s3-images.ts",
    "apps/wholesale/src/app/api/admin/stock-check/live/route.ts",
    "apps/storefront/scripts/cardrush-probe.ts",
    "apps/storefront/scripts/cardrush-discovery-health.ts",
  ]) {
    requireText(7, path, source(path), "CARDRUSH_ACQUISITION_ENABLED", "direct CardRush network path must consult the immutable lock");
  }
  // Copying CardRush images is refused outright rather than locked behind a
  // switch: CardRush listing images are linked at CardRush's own URL, never
  // copied (the agents' reading of Yu's words of 2026-10-29, in the decision
  // record). The old copy script must stop before it reads credentials, the
  // database or the network, with nothing that could switch the stop off.
  requireRefusedScript(7, "apps/storefront/scripts/self-host-cardrush.mjs", "CardRush images are linked, never copied",
    "the CardRush image copy script must refuse, naming why, as its first statement and unconditionally");
  // The old official-image backfill is refused the same way (2026-10-30): no
  // language, source or takedown filter, an UPDATE keyed by sku alone, ambient
  // credentials, overwriting copies and unspaced fetches. Official images reach
  // the bucket only through upload-official-images.mjs (auditOfficialImageTools).
  requireRefusedScript(7, "apps/storefront/scripts/backfill-card-images-s3.mjs", "Official images upload only through upload-official-images.mjs",
    "the old official-image backfill must refuse, naming the new tool, as its first statement and unconditionally");

  const cli = source("apps/wholesale/tools/scrape-cardrush.ts");
  const gateAt = cli.indexOf("if (!CARDRUSH_ACQUISITION_ENABLED)");
  const envAt = cli.indexOf('existsSync(".env.local")');
  if (gateAt < 0 || envAt < 0 || gateAt > envAt) {
    fail(7, "apps/wholesale/tools/scrape-cardrush.ts", "CLI must stop before reading environment secrets or starting acquisition");
  }

  const discovery = source("packages/data-ingest/src/cardrush/discovery.ts");
  for (const helper of ["fetchSitemap", "fetchAndParseProduct", "createDiscoveryFetcher"]) {
    const start = discovery.indexOf(`function ${helper}`);
    const nextExport = discovery.indexOf("\nexport ", start + 1);
    const block = discovery.slice(start, nextExport < 0 ? undefined : nextExport);
    requireText(7, `CardRush discovery.${helper}`, block, "CARDRUSH_ACQUISITION_ENABLED", `${helper} must consult the immutable acquisition lock`);
  }
}

// The scheduled Cardmarket collector is the one permitted Cardmarket path
// (plan §2, docs/plans/tcg-data-platform/paid-data-api.md): official files,
// cron auth, then its flag, then evidence, with no proxy lane. The legacy
// OAuth reader stays locked.
function auditCardmarketCollector(): void {
  const legacy = source("packages/data-ingest/src/cardmarket/index.ts");
  requireText(7, "Cardmarket legacy OAuth", legacy, "CARDMARKET_LEGACY_OAUTH_ENABLED: boolean = false;", "the legacy OAuth reader lock must remain false");

  const routePath = "apps/storefront/src/app/api/cron/collect/cardmarket/route.ts";
  const route = source(routePath);
  requireBefore(7, routePath, route, "requireCronAuth(request)", 'collectionOn("cardmarket")', "cron auth must run before the collection flag is read");
  requireBefore(7, routePath, route, 'collectionOn("cardmarket")', 'import("@/lib/datafeed/cardmarket-collector")', "a disabled run must return before loading the collector");

  const collectorPath = "apps/storefront/src/lib/datafeed/cardmarket-collector.ts";
  const collector = source(collectorPath);
  requireBefore(7, collectorPath, collector, "evidenceVersion !== MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion", "ingestMemberPriceSource(", "the collector must refuse another evidence version before acquisition");
  for (const path of [collectorPath, "packages/data-ingest/src/cardmarket/public-files.ts"]) {
    for (const forbidden of ["proxy_url", "api_token", "brightdata"]) {
      forbidText(7, path, source(path), forbidden, `the Cardmarket collection path must not contain '${forbidden}'`);
    }
  }
}

// ── CardRush page collector (Yu, 2026-10-28) ─────────────────────────────
// The written permission reaches one CardRush path: the identified page
// collector. It refuses without the policy's evidence version before it
// creates its one fetcher, which is createFetcher with no proxy options and
// Cambridge's own User-Agent, and it is reached only through the run module
// and the flag-gated cron route. Every legacy path stays pinned to
// CARDRUSH_ACQUISITION_ENABLED in auditAcquisitionLocks. This block is the
// CardRush collector's alone; other collectors keep their own.

const CARDRUSH_COLLECTOR = "packages/data-ingest/src/cardrush/member-prices.ts";
const CARDRUSH_COLLECTOR_RUN = "apps/storefront/src/lib/datafeed/collectors/cardrush.ts";
const CARDRUSH_COLLECTOR_ROUTE = "apps/storefront/src/app/api/cron/collect/cardrush/route.ts";

function functionBlock(body: string, name: string): string {
  const start = body.indexOf(name);
  if (start < 0) return "";
  const next = body.indexOf("\nexport ", start + 1);
  return body.slice(start, next < 0 ? undefined : next);
}

function auditCardRushPageCollector(): void {
  const legacy = source("packages/data-ingest/src/cardrush/index.ts");
  requireText(7, "CardRush registry", legacy, 'status: "partial"', "CardRush is partial: one identified collector open, every legacy path locked");
  requireText(7, "CardRush registry", legacy, "redistribute: false", "raw CardRush values must remain non-redistributable");
  requireText(7, "CardRush registry", legacy, 'user_agent_suffix: "(cardrush-collector; permission cardrush/2026-10-28.1)"', "the CardRush User-Agent must name the collector and its permission");
  requireText(7, "CardRush registry", legacy, "rate_limit: { rps: 0.5, burst: 1 }", "CardRush meta must keep 0.5 rps with burst 1");
  for (const helper of ["function getOrCreateFetcher", "function scrapeCardRush", "async *read("]) {
    requireText(7, `CardRush legacy ${helper}`, functionBlock(legacy, helper), "if (!CARDRUSH_ACQUISITION_ENABLED)", `legacy ${helper} must consult the immutable acquisition lock`);
  }

  const collector = source(CARDRUSH_COLLECTOR);
  requireBefore(7, CARDRUSH_COLLECTOR, collector, "if (input.evidenceVersion !== MEMBER_PRICE_POLICIES.cardrush.evidenceVersion) throw", "createFetcher(", "the collector must refuse without the CardRush evidence version before creating a fetcher");
  if (collector.split("createFetcher(").length !== 2) fail(7, CARDRUSH_COLLECTOR, "the collector must create exactly one fetcher");
  requireText(7, CARDRUSH_COLLECTOR, collector, "createFetcher({ ...ctx, signal, rate_limit: CARDRUSH_PAGE_RATE }, cardrush.meta, { max_retries: 0 })", "the collector's fetcher must take the collector rate and no proxy options");
  requireText(7, CARDRUSH_COLLECTOR, collector, "CARDRUSH_PAGE_RATE = { rps: 0.5, burst: 1 }", "the collector must read at most 0.5 requests per second per host, burst 1");
  for (const forbidden of [
    "proxy_url", "api_token", "api_zone", "dispatcher", "brightdata", "superproxy", "unlocker", "residential", "CARDRUSH_EGRESS",
    "CARDRUSH_BROWSER_HEADERS", "BROWSER_UA", "Mozilla/", "Sec-Fetch", "sec-ch-ua", "getOrCreateFetcher", "pickDiscoveryFetcher", "createDiscoveryFetcher",
    "'User-Agent'", '"User-Agent"', "'user-agent'", '"user-agent"', "redirect: 'follow'",
  ]) {
    forbidText(7, CARDRUSH_COLLECTOR, collector, forbidden, `the identified collector must not contain '${forbidden}'`);
  }

  const run = source(CARDRUSH_COLLECTOR_RUN);
  requireText(7, CARDRUSH_COLLECTOR_RUN, run, "const policy = MEMBER_PRICE_POLICIES.cardrush;", "the run must take the evidence version from the CardRush policy");
  requireText(7, CARDRUSH_COLLECTOR_RUN, run, "evidenceVersion: policy.evidenceVersion", "the run must pass the policy's evidence version to acquisition");
  requireBefore(7, CARDRUSH_COLLECTOR_RUN, run, "FROM member_price_source_releases", "acquireCardRushMemberPrices(", "the run must check the release row before network work");
  requireText(7, CARDRUSH_COLLECTOR_RUN, run, "writeMemberPriceBatch('cardrush'", "observations must enter through the member-price writer");
  for (const forbidden of ["createFetcher", "fetch(", "proxy", "INSERT INTO", "UPDATE "]) {
    forbidText(7, CARDRUSH_COLLECTOR_RUN, run, forbidden, `the run must not contain '${forbidden}'; network and writes belong to the collector and the writers`);
  }

  const route = source(CARDRUSH_COLLECTOR_ROUTE);
  requireBefore(7, CARDRUSH_COLLECTOR_ROUTE, route, "requireCronAuth(request)", 'if (!collectionOn("cardrush"))', "the route must authenticate before reading its flag");
  requireBefore(7, CARDRUSH_COLLECTOR_ROUTE, route, 'if (!collectionOn("cardrush"))', "collectCardRush()", "the route must stay off unless DATA_COLLECT_CARDRUSH is on");
  requireCollectionGate(7, "cardrush", "DATA_COLLECT_CARDRUSH");

  requireText(7, "data-ingest exports", source("packages/data-ingest/package.json"), '"./cardrush/member-prices"', "the collector must stay a named subpath export");
  for (const file of [...activeSourceFiles(ACTIVE_SOURCE_ROOT), ...activeSourceFiles(INGEST_SRC)]) {
    const path = file.slice(REPO_ROOT.length + 1);
    const body = readFileSync(file, "utf8");
    if (body.includes("acquireCardRushMemberPrices") && path !== CARDRUSH_COLLECTOR && path !== CARDRUSH_COLLECTOR_RUN) {
      fail(7, path, "only the CardRush run module may reach the page collector");
    }
    if (/\bcollectCardRush\b/.test(body) && path !== CARDRUSH_COLLECTOR_RUN && path !== CARDRUSH_COLLECTOR_ROUTE) {
      fail(7, path, "only the flag-gated cron route may start a CardRush run");
    }
  }
}

// ── end CardRush page collector ──────────────────────────────────────────

// ── TCGplayer acquisition (check 11) ────────────────────────────────────
// Yu's permission of 2026-10-28 opened one TCGplayer path: the evidence-gated
// price-guide collector. The legacy OAuth reader, its token mint and the
// wholesale cron stay locked, no other code holds a URL on the price-guide
// data hosts (prose such as tos_notes may name them), and the cron runs the
// collector only after authentication and its flag. This block is
// TCGplayer's own; other sources keep theirs.

const TCGPLAYER_COLLECTOR = "packages/data-ingest/src/tcgplayer/member-prices.ts";
const TCGPLAYER_DATA_HOSTS = ["infinite-api.tcgplayer.com", "mpapi.tcgplayer.com", "mp-search-api.tcgplayer.com"];

function auditTcgplayerAcquisition(): void {
  const legacy = source("packages/data-ingest/src/tcgplayer/index.ts");
  requireText(11, "TCGplayer API reader", legacy, "const TCGPLAYER_ACQUISITION_ENABLED: boolean = false;", "the legacy TCGplayer API reader lock must remain false");
  requireBefore(11, "TCGplayer API reader", legacy, "if (!TCGPLAYER_ACQUISITION_ENABLED)", "createFetcher(ctx, tcgplayer.meta)", "the legacy reader must consult its lock before building a fetcher");
  requireText(11, "TCGplayer token mint", source("packages/data-ingest/src/tcgplayer/oauth.ts"), "throw new Error(TCGPLAYER_ACCESS_BLOCKED_MESSAGE)", "TCGplayer token minting must keep failing before network access");
  const wholesaleCron = source("apps/wholesale/src/app/api/cron/ingest/tcgplayer/route.ts");
  requireText(11, "wholesale ingest/tcgplayer", wholesaleCron, 'code: "SOURCE_UNAVAILABLE"', "the wholesale TCGplayer cron must remain a blocked door");
  forbidText(11, "wholesale ingest/tcgplayer", wholesaleCron, "@/lib/ingest/tcgplayer", "the wholesale TCGplayer cron must not reach its old dispatcher");
  forbidText(11, "apps/wholesale/vercel.json", source("apps/wholesale/vercel.json"), "ingest/tcgplayer", "the wholesale TCGplayer cron must remain unscheduled");

  const collector = source(TCGPLAYER_COLLECTOR);
  requireText(11, TCGPLAYER_COLLECTOR, collector, "TCGPLAYER_RATE_LIMIT = { rps: 0.1, burst: 1 }", "the collector must hold one request per 10 s across TCGplayer hosts");
  requireText(11, TCGPLAYER_COLLECTOR, collector, "rate_limit: TCGPLAYER_RATE_LIMIT }, tcgplayer.meta, { max_retries: 0 })", "the collector's fetcher must ignore caller rates and never retry a refusal");
  requireText(11, TCGPLAYER_COLLECTOR, collector, "fetcher.via_proxy !== null", "the collector must refuse a proxied fetcher");
  for (const helper of ["fetchTcgplayerSets", "fetchTcgplayerCardsProductType", "acquireTcgplayerPriceGuide"]) {
    const start = collector.indexOf(`export async function ${helper}(`);
    const next = collector.indexOf("\nexport ", start + 1);
    const body = start < 0 ? "" : collector.slice(start, next < 0 ? undefined : next);
    requireBefore(11, `${TCGPLAYER_COLLECTOR} ${helper}`, body, "assertEvidence(evidenceVersion)", "await read(", `${helper} must refuse without the permission's evidence version before any request`);
  }
  const run = source("apps/storefront/src/lib/datafeed/collectors/tcgplayer.ts");
  requireBefore(11, "storefront TCGplayer collector", run, "FROM member_price_source_releases", "createTcgplayerFetcher(", "the collector must check its release row before building a fetcher");
  requireText(11, "storefront TCGplayer collector", run, "writeMemberPriceBatch('tcgplayer'", "TCGplayer observations must be written through member-price-writer");
  for (const [path, body] of [[TCGPLAYER_COLLECTOR, collector], ["storefront TCGplayer collector", run]] as const) {
    for (const forbidden of ["proxy_url", "api_token", "api_zone", "brightdata", "superproxy", "residential"]) {
      forbidText(11, path, body, forbidden, `the TCGplayer collector must not contain '${forbidden}'`);
    }
  }
  const cron = source("apps/storefront/src/app/api/cron/collect/tcgplayer/route.ts");
  requireBefore(11, "/api/cron/collect/tcgplayer", cron, "requireCronAuth(request)", 'if (!collectionOn("tcgplayer"))', "the cron must authenticate before reading its flag");
  requireBefore(11, "/api/cron/collect/tcgplayer", cron, 'if (!collectionOn("tcgplayer"))', "collectTcgplayer(", "the cron must collect only when DATA_COLLECT_TCGPLAYER is on");
  requireCollectionGate(11, "tcgplayer", "DATA_COLLECT_TCGPLAYER");

  const roots = [
    ...readdirSync(resolve(REPO_ROOT, "packages")).map((name) => resolve(REPO_ROOT, "packages", name, "src")),
    ...readdirSync(resolve(REPO_ROOT, "apps")).map((name) => resolve(REPO_ROOT, "apps", name, "src")),
    resolve(REPO_ROOT, "apps", "wholesale", "tools"),
  ].filter((root) => existsSync(root));
  for (const file of roots.flatMap(activeSourceFiles)) {
    const path = file.slice(REPO_ROOT.length + 1);
    if (path === TCGPLAYER_COLLECTOR) continue;
    const body = readFileSync(file, "utf8");
    for (const host of TCGPLAYER_DATA_HOSTS) {
      forbidText(11, path, body, `//${host}`, `TCGplayer's page-data host '${host}' may be read only by the evidence-gated collector (${TCGPLAYER_COLLECTOR})`);
    }
  }
}

// ── end TCGplayer acquisition ───────────────────────────────────────────

// ── Official image lanes (check 8) and tools (check 7) ──────────────────
// A guard swap, 2026-10-30: the English-only pins that stood here (the
// single 'bandai-en' source pin, the reader entry points and the projection
// texts) are replaced by stronger, table-driven pins covering both lanes
// (docs/decisions/2026-10-30-japanese-official-images.md). Each lane is a
// fixed (lang, source) pair read by its own function with its own projector;
// the lane table must equal the copy below, which is the reviewed one; every
// card_images reader and writer in the repository is named; and the manual
// tools keep their refusal, identification and full-key pins. A further
// tightening the same day reads the tools' AWS calls one by one instead of
// the file as a whole: each is a reviewed shape, the only write is
// put-object with --if-none-match "*", and each bucket call names the run's
// profile once.

/** The reviewed lane table. A change to official-image-lanes.ts fails here
 * until this copy is changed with it. */
const OFFICIAL_IMAGE_LANE_PINS = {
  en: {
    lang: "en", source: "bandai-en", policy: "cambridge.official-en-media/2026-07-13", evidence: null, credits: null,
    games: {
      op: { host: "en.onepiece-cardgame.com", paths: null, ext: "png" },
      dbf: { host: "www.dbs-cardgame.com", paths: ["/fw/en/", "/fw/images/cards/card/en/"], ext: "webp" },
    },
  },
  ja: {
    lang: "ja", source: "bandai-jp", policy: "cambridge.official-ja-media/2026-10-30", evidence: "cambridge.official-ja-media/2026-10-30",
    credits: {
      op: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
      dbf: "©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc.",
    },
    games: {
      op: { host: "www.onepiece-cardgame.com", paths: ["/images/cardlist/card/"], ext: "png" },
      dbf: { host: "www.dbs-cardgame.com", paths: ["/fw/images/cards/card/jp/"], ext: "webp" },
    },
  },
} as const;
/** Each lane's reader in en-card-data.ts and the projector it must call. */
const OFFICIAL_IMAGE_READERS = {
  en: { reader: "export async function getEnCardImages", projection: "projectOfficialImage(sku, row, cdn)" },
  ja: { reader: "export async function getSameLanguageImages", projection: "projectSameLanguageImage(sku, row, cdn)" },
} as const;

const EN_CARD_DATA = "apps/storefront/src/lib/cards/en-card-data.ts";
const IMAGE_PUBLICATION = "apps/storefront/src/lib/cards/image-publication.ts";
const OFFICIAL_IMAGE_TOOLS = "apps/storefront/src/lib/cards/official-image-tools.ts";
const INGEST_OFFICIAL_JA = "apps/storefront/scripts/ingest-official-ja.mjs";
const UPLOAD_OFFICIAL_IMAGES = "apps/storefront/scripts/upload-official-images.mjs";
const REFUSED_BACKFILL = "apps/storefront/scripts/backfill-card-images-s3.mjs";
const CARD_IMAGES_READ = /\b(?:from|join)\s+card_images\b/i;

/** Template literals, found by a small scanner that skips comments and
 * quoted strings, so SQL is read as SQL and prose as prose. */
function templateLiterals(body: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < body.length;) {
    const c = body[i], next = body[i + 1];
    if (c === "/" && next === "/") { const end = body.indexOf("\n", i); i = end < 0 ? body.length : end; continue; }
    if (c === "/" && next === "*") { const end = body.indexOf("*/", i + 2); i = end < 0 ? body.length : end + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < body.length && body[j] !== c && body[j] !== "\n") j += body[j] === "\\" ? 2 : 1;
      i = j + 1; continue;
    }
    if (c === "`") {
      let j = i + 1, depth = 0;
      while (j < body.length && !(body[j] === "`" && depth === 0)) {
        if (body[j] === "\\") j += 1;
        else if (body[j] === "$" && body[j + 1] === "{") { depth += 1; j += 1; }
        else if (body[j] === "}" && depth > 0) depth -= 1;
        j += 1;
      }
      out.push(body.slice(i + 1, j));
      i = j + 1; continue;
    }
    i += 1;
  }
  return out;
}

/** The body with comments and string text blanked to spaces (same length,
 * newlines kept), template ${…} expressions kept as code, so a position in
 * it is a position in the body and only code is left to match. */
function codeOnly(body: string): string {
  const out = body.split("");
  const blank = (from: number, to: number) => { for (let k = from; k < to && k < out.length; k += 1) if (out[k] !== "\n") out[k] = " "; };
  const scan = (start: number, untilBrace: boolean): number => {
    let i = start, depth = 0;
    while (i < body.length) {
      const c = body[i], next = body[i + 1];
      if (c === "/" && next === "/") { const end = body.indexOf("\n", i); const stop = end < 0 ? body.length : end; blank(i, stop); i = stop; continue; }
      if (c === "/" && next === "*") { const end = body.indexOf("*/", i + 2); const stop = end < 0 ? body.length : end + 2; blank(i, stop); i = stop; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < body.length && body[j] !== c && body[j] !== "\n") j += body[j] === "\\" ? 2 : 1;
        blank(i + 1, j); i = j + 1; continue;
      }
      if (c === "`") {
        let j = i + 1, from = j;
        while (j < body.length && body[j] !== "`") {
          if (body[j] === "\\") { j += 2; continue; }
          if (body[j] === "$" && body[j + 1] === "{") { blank(from, j); j = scan(j + 2, true) + 1; from = j; continue; }
          j += 1;
        }
        blank(from, j); i = j + 1; continue;
      }
      if (c === "{") depth += 1;
      if (c === "}") { if (untilBrace && depth === 0) return i; depth -= 1; }
      i += 1;
    }
    return i;
  };
  scan(0, false);
  return out.join("");
}

/** Each `aws(` call's argument text, from `(` to its matching `)`, and
 * whether it is one array literal. Brackets are matched in code only. */
function awsCalls(body: string): { args: string; literal: boolean }[] {
  const code = codeOnly(body);
  const calls: { args: string; literal: boolean }[] = [];
  for (const match of code.matchAll(/\baws\s*\(/g)) {
    const open = match.index! + match[0].length - 1;
    let depth = 0, close = open;
    for (let i = open; i < code.length; i += 1) {
      if ("([{".includes(code[i]!)) depth += 1;
      else if (")]}".includes(code[i]!) && --depth === 0) { close = i; break; }
    }
    const args = body.slice(open + 1, close).trim().replace(/,\s*$/, "");
    calls.push({ args: args.replace(/\s+/g, " "), literal: /^\[[^]*\]$/.test(args) && codeOnly(args).indexOf("]") === args.length - 1 });
  }
  return calls;
}

/** Every source file under the roots that may hold a card_images query or an
 * import: .ts, .tsx, .mts, .mjs and .js, tests excluded (activeSourceFiles
 * reads only .ts, .tsx and .md). */
function codeFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...codeFiles(path));
    else if (/\.(?:ts|tsx|mts|mjs|js)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name) && !path.includes("/__tests__/")) files.push(path);
  }
  return files;
}
const CARD_IMAGE_SCAN_ROOTS = ["apps/storefront/src", "apps/storefront/scripts", "packages/data-ingest/src", "apps/wholesale/src", "apps/wholesale/tools"];
const relativePath = (file: string) => file.slice(REPO_ROOT.length + 1);
/** Import and dynamic-import specifiers. */
const specifiers = (body: string) => [...body.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^import\s+)["']([^"']+)["']/gm)].map((m) => m[1]!);

function auditOfficialImageLanes(runtimeLanes: unknown): void {
  // 1. The runtime table is the reviewed one.
  if (JSON.stringify(runtimeLanes) !== JSON.stringify(OFFICIAL_IMAGE_LANE_PINS)) {
    fail(8, "apps/storefront/src/lib/cards/official-image-lanes.ts", "the official image lanes must equal the reviewed table in this audit (OFFICIAL_IMAGE_LANE_PINS)");
  }
  const lanes = Object.values(OFFICIAL_IMAGE_LANE_PINS);
  const pair = (lane: { lang: string; source: string }) => `lang = '${lane.lang}' AND source = '${lane.source}'`;

  // 2. Each card_images query in the reader names exactly one lane pair and
  // the publication guards, and each pair lives in its own reader beside its
  // own projector, with the other lane absent.
  const enCardData = source(EN_CARD_DATA);
  const queries = templateLiterals(enCardData).filter((literal) => CARD_IMAGES_READ.test(literal));
  for (const query of queries) {
    for (const guard of ["kind = 'official_sample'", "takedown_status = 'clear'", "s3_key IS NOT NULL"]) {
      if (!query.includes(guard)) fail(8, EN_CARD_DATA, `every card_images query must contain ${guard}`);
    }
    const pairs = [...query.matchAll(/lang = '([a-z]{2})' AND source = '([a-z-]+)'/g)].map((m) => `lang = '${m[1]}' AND source = '${m[2]}'`);
    if (pairs.length !== 1 || !lanes.some((lane) => pair(lane) === pairs[0])) fail(8, EN_CARD_DATA, "every card_images query must name exactly one reviewed lane pair (lang and source together)");
  }
  for (const [lang, { reader, projection }] of Object.entries(OFFICIAL_IMAGE_READERS)) {
    const lane = OFFICIAL_IMAGE_LANE_PINS[lang as keyof typeof OFFICIAL_IMAGE_LANE_PINS];
    const other = lanes.find((l) => l.lang !== lang)!;
    const otherReader = OFFICIAL_IMAGE_READERS[other.lang as keyof typeof OFFICIAL_IMAGE_READERS];
    if (queries.filter((query) => query.includes(pair(lane))).length !== 1) fail(8, EN_CARD_DATA, `the ${lang} lane pair must appear in exactly one card_images query`);
    const block = functionBlock(enCardData, reader);
    const blockQueries = templateLiterals(block).filter((literal) => CARD_IMAGES_READ.test(literal));
    if (blockQueries.length !== 1 || !blockQueries[0]!.includes(pair(lane))) fail(8, EN_CARD_DATA, `${reader} must hold the ${lang} lane's one query`);
    requireText(8, EN_CARD_DATA, block, projection, `${reader} must project through ${projection}`);
    forbidText(8, EN_CARD_DATA, block, pair(other), `${reader} must not read the ${other.lang} lane`);
    forbidText(8, EN_CARD_DATA, block, otherReader.projection, `${reader} must not use the ${other.lang} projector`);
  }
  // 3. The single-card reader shares both batch readers.
  const single = functionBlock(enCardData, "export async function getEnCardData");
  requireText(8, EN_CARD_DATA, single, "getEnCardImages([catalogSku])", "single-card reads must share the English batch boundary");
  requireText(8, EN_CARD_DATA, single, "getSameLanguageImages([catalogSku], env)", "single-card reads must share the Japanese batch boundary and its switch");
  // 4. The kill switch: exactly "off" turns the Japanese lane off, read before any query.
  requireText(8, EN_CARD_DATA, enCardData, 'return env.OFFICIAL_IMAGES_JA?.trim().toLowerCase() !== "off";', "OFFICIAL_IMAGES_JA=off must turn the Japanese lane off");
  requireBefore(8, EN_CARD_DATA, functionBlock(enCardData, OFFICIAL_IMAGE_READERS.ja.reader), "if (!officialImagesJaOn(env)) return new Map();", "FROM card_images",
    "the Japanese reader must read its switch before any query");
  // Text provenance stays English (card_texts has no Japanese lane).
  for (const path of [EN_CARD_DATA, "apps/storefront/src/lib/play/starter-resolve.ts"]) {
    for (const query of templateLiterals(source(path)).filter((literal) => /\bfrom\s+card_texts\b/i.test(literal))) {
      if (!query.includes("lang = 'en' AND source = 'bandai-en'")) fail(8, path, "every card_texts query must stay in the English lane");
    }
  }

  // 5. The projector: the self-hosted URL, both references, nonblank credit,
  // the lane bound by the caller, and the path check per lane.
  const imagePublication = source(IMAGE_PUBLICATION);
  for (const [expected, message] of [
    ["officialImageUrl(row.s3_key, cdn)", "served URLs must use a validated self-hosted object key"],
    ["createImageReference(requestedSku, row.sku)", "an English image must retain the requested and selected identifiers"],
    ["createSameLanguageImageReference(requestedSku, row.sku)", "a Japanese image must retain the requested and selected identifiers"],
    ["!row.attribution.trim()", "blank copyright lines must not publish"],
    ["row.lang !== lane.lang", "a row must be in the language of the lane its caller binds"],
    ["row.source !== lane.source", "a row must be from the source of the lane its caller binds"],
    ["expected.paths === null || expected.paths.some(", "a source URL must be on its lane's path, where the lane names one"],
  ] as const) requireText(8, IMAGE_PUBLICATION, imagePublication, expected, message);
  requireText(8, IMAGE_PUBLICATION, functionBlock(imagePublication, "export function officialMediaProvenance"), "OFFICIAL_IMAGE_LANES.en)", "text provenance must stay in the English lane");
  requireText(8, IMAGE_PUBLICATION, functionBlock(imagePublication, "export function projectSameLanguageImage"), "laneSourceUrl(lane, game, row.source_url, row.sku)", "a Japanese row's publisher file must name its own card");
  forbidText(8, IMAGE_PUBLICATION, imagePublication, '"en.onepiece-cardgame.com" : "www.dbs-cardgame.com"', "the lane table, not a host ternary, decides the publisher host");

  // 6. The stored publisher source_url never becomes the served url.
  for (const path of [EN_CARD_DATA, IMAGE_PUBLICATION]) {
    for (const neverServed of [" url: row.source_url", " url: r.source_url", " url: source_url", " url: sourceUrl"]) {
      forbidText(8, path, source(path), neverServed, "the stored publisher source_url must never become the served image url");
    }
  }

  // 7. Every card_images reader in the repository is named, and the other
  // English readers stay English.
  const allowedReaders = new Set([EN_CARD_DATA, OFFICIAL_IMAGE_TOOLS, REFUSED_BACKFILL]);
  const englishReaders = new Set(["apps/storefront/src/lib/cards/gallery.ts", "apps/storefront/src/lib/cards/notable.ts", "apps/storefront/src/lib/cards/artists.ts", "apps/storefront/src/lib/play/starter-resolve.ts"]);
  for (const file of CARD_IMAGE_SCAN_ROOTS.flatMap((root) => codeFiles(resolve(REPO_ROOT, root)))) {
    const path = relativePath(file), body = readFileSync(file, "utf8");
    if (path === "apps/storefront/scripts/redistribution.ts") continue; // this audit names them to pin them
    if (CARD_IMAGES_READ.test(body)) {
      if (englishReaders.has(path)) {
        for (const query of templateLiterals(body).filter((literal) => CARD_IMAGES_READ.test(literal))) {
          if (!query.includes("lang = 'en'")) fail(8, path, "this English card_images reader must keep lang = 'en' in every query");
        }
      } else if (!allowedReaders.has(path)) fail(8, path, "a new card_images reader must go through en-card-data.ts or be reviewed here");
    }
    // 8. Writers: rows are inserted only by the ingest tool, and updated only
    // by the upload tool (the refused backfill's history aside).
    if (/\binsert\s+into\s+card_images\b/i.test(body) && path !== OFFICIAL_IMAGE_TOOLS) fail(8, path, "only official-image-tools.ts may insert card_images rows");
    if (/\bupdate\s+card_images\b/i.test(body) && path !== OFFICIAL_IMAGE_TOOLS && path !== REFUSED_BACKFILL) fail(8, path, "only official-image-tools.ts may update card_images rows");
  }

  // 9. No publisher host may be fetched or optimised by Next.
  const nextConfig = source("apps/storefront/next.config.ts");
  for (const host of ["onepiece-cardgame.com", "dbs-cardgame.com"]) forbidText(8, "apps/storefront/next.config.ts", nextConfig, host, `next.config must not name ${host}`);
}

function auditOfficialImageTools(): void {
  // The tools' own pins: insert never updates, upload never overwrites, runs
  // under the named profile, records by the full primary key, selects only
  // the lane's clear unuploaded rows, and holds a card under takedown.
  const tools = source(OFFICIAL_IMAGE_TOOLS);
  for (const [expected, message] of [
    ["ON CONFLICT (sku, lang, kind, source) DO NOTHING", "the ingest must never update an existing row"],
    ['"--if-none-match", "*"', "the upload must never overwrite an object"],
    ['"--profile", profile', "the upload must run under the profile named at run time"],
    ["WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4", "rows must be locked and recorded by the full primary key"],
    ["lang = $1 AND source = $2 AND kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NULL", "the upload must select only its lane's clear, unuploaded official rows"],
    ["t.takedown_status <> 'clear'", "the upload must hold every row of a card under takedown"],
    ["shell: false", "the AWS CLI must run without a shell"],
  ] as const) requireText(7, OFFICIAL_IMAGE_TOOLS, tools, expected, message);
  // Statement by statement: every insert leaves existing rows alone, and every
  // update is keyed by the full primary key and may only fill an empty object.
  for (const literal of templateLiterals(tools)) {
    if (/\binsert\s+into\s+card_images\b/i.test(literal) && !literal.includes("ON CONFLICT (sku, lang, kind, source) DO NOTHING")) fail(7, OFFICIAL_IMAGE_TOOLS, "every card_images insert must be ON CONFLICT (sku, lang, kind, source) DO NOTHING");
    if (/\bupdate\s+card_images\b/i.test(literal) && !literal.includes("WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4 AND s3_key IS NULL AND takedown_status = 'clear'")) fail(7, OFFICIAL_IMAGE_TOOLS, "every card_images update must be keyed by the full primary key, on a clear row with no object yet");
    if (/\bfor\s+update\b/i.test(literal) && !literal.includes("WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4 FOR UPDATE NOWAIT")) fail(7, OFFICIAL_IMAGE_TOOLS, "every row lock must be by the full primary key, NOWAIT");
  }
  // Call by call, a further tightening of the guard swap: a file-wide pin
  // still passes when one call keeps the text and another drops it. The
  // tools reach a process only through the one aws helper; each call passes
  // one literal argument list of a reviewed shape; the only write is
  // put-object with --if-none-match "*"; and each call that reaches the
  // bucket names the run's profile, once.
  requireText(7, OFFICIAL_IMAGE_TOOLS, tools, 'const aws = (args: readonly string[]) => deps.execFile("aws", args, { shell: false, timeout: 120_000, env });', "the tools must reach the AWS CLI only through the one aws helper, without a shell");
  const toolCode = codeOnly(tools);
  if ((toolCode.match(/\bexecFile\b/g) ?? []).length !== 2) fail(7, OFFICIAL_IMAGE_TOOLS, "execFile may appear only in ToolDeps and the one aws helper");
  if ((toolCode.match(/\baws\b(?!-)/g) ?? []).length !== (toolCode.match(/\baws\s*\(/g) ?? []).length + 1) fail(7, OFFICIAL_IMAGE_TOOLS, "the aws helper may only be called, never passed on or renamed");
  const awsArgs = awsCalls(tools);
  for (const { args, literal } of awsArgs) {
    const shape = args.slice(0, 60);
    const once = (text: string) => args.split(text).length === 2;
    if (!literal || codeOnly(args).includes("...")) fail(7, OFFICIAL_IMAGE_TOOLS, `every aws call must pass one literal argument list, not '${shape}'`);
    else if (args === '["--version"]') continue;
    else if (args.startsWith('["s3api", "put-object",')) {
      if (!once('"--if-none-match", "*"') || !once('"--if-none-match"')) fail(7, OFFICIAL_IMAGE_TOOLS, 'every put-object must carry "--if-none-match", "*", once');
      if (!once('"--profile", profile') || !once('"--profile"')) fail(7, OFFICIAL_IMAGE_TOOLS, "every put-object must name the run's profile, once");
    } else if (args.startsWith('["s3api", "head-object",')) {
      if (!once('"--profile", profile') || !once('"--profile"')) fail(7, OFFICIAL_IMAGE_TOOLS, "every head-object must name the run's profile, once");
    } else fail(7, OFFICIAL_IMAGE_TOOLS, `aws call '${shape}' is not a reviewed shape (--version, s3api put-object, s3api head-object)`);
  }
  if (!awsArgs.some(({ args }) => args.startsWith('["s3api", "put-object",'))) fail(7, OFFICIAL_IMAGE_TOOLS, "the upload's put-object must stay in the tools, where these pins read it");
  // The scripts inject the process call and make none of their own.
  const upload = source(UPLOAD_OFFICIAL_IMAGES);
  requireText(7, UPLOAD_OFFICIAL_IMAGES, upload, "execFile: (file, args, options) => execFileAsync(file, [...args], { shell: false,", "the upload script's one process call must pass the tools' arguments through, without a shell");
  if ((codeOnly(upload).match(/\bexecFileAsync\s*\(/g) ?? []).length !== 1) fail(7, UPLOAD_OFFICIAL_IMAGES, "the upload script may run a process only through the injected execFile");
  forbidText(7, INGEST_OFFICIAL_JA, source(INGEST_OFFICIAL_JA), "child_process", "the ingest runs no other program");
  requireText(7, UPLOAD_OFFICIAL_IMAGES, upload, "shell: false", "the AWS CLI must run without a shell");
  for (const path of [INGEST_OFFICIAL_JA, UPLOAD_OFFICIAL_IMAGES]) {
    requireText(7, path, source(path), "process.env.DATABASE_URL", "the database URL comes from the environment only");
  }
  for (const path of [OFFICIAL_IMAGE_TOOLS, INGEST_OFFICIAL_JA, UPLOAD_OFFICIAL_IMAGES]) {
    const body = source(path);
    for (const forbidden of ['"cp"', "s3 cp", '"s3"', '"sync"', '"mv"', '"rm"', '"copy-object"', '"delete-object"', '"delete-objects"', '"put-object-acl"', '"upload-part"', '"create-multipart-upload"', "--endpoint-url", "--acl", "shell: true", "execSync", "exec(", "spawn(", "dotenv", "--env-file", ".env.local", ".env.production", "prod.env"]) {
      forbidText(7, path, body, forbidden, `the official-image tools must not contain '${forbidden}'`);
    }
    if (/["'/]\.env\b/.test(body)) fail(7, path, "the official-image tools must not read an env file");
  }
  // The tool logic imports no driver, process module or server-only code; the scripts inject them.
  for (const specifier of specifiers(tools)) {
    if (["pg", "node:child_process", "server-only"].includes(specifier) || specifier.startsWith("@/")) fail(7, OFFICIAL_IMAGE_TOOLS, `the tool logic must not import '${specifier}'`);
  }

  // The Japanese lane reads image addresses and identifiers only.
  const jpDir = "packages/data-ingest/src/bandai-jp";
  for (const file of readdirSync(resolve(REPO_ROOT, jpDir)).filter((name) => name.endsWith(".ts"))) {
    const path = `${jpDir}/${file}`, body = source(path);
    for (const forbidden of ["fieldText(", "effect_text", "trigger_text", 'class="text"', "cardFaq", "getInfo", "detail_url("]) {
      forbidText(7, path, body, forbidden, `the Japanese lane must not read '${forbidden}'`);
    }
  }
  const jpIndex = source(`${jpDir}/index.ts`);
  requireText(7, `${jpDir}/index.ts`, jpIndex, 'status: "blocked"', "bandai-jp stays blocked: a manual tool, no live reader");
  requireText(7, `${jpDir}/index.ts`, jpIndex, "redistribute: false", "bandai-jp values must remain non-redistributable");
  forbidText(7, `${jpDir}/index.ts`, functionBlock(jpIndex, "async *read("), "fetch", "bandai-jp's read() must never fetch");
  const collect = source(`${jpDir}/collect.ts`), media = source("packages/data-ingest/src/official-media.ts");
  for (const [path, body] of [[`${jpDir}/collect.ts`, collect], ["packages/data-ingest/src/official-media.ts", media]] as const) {
    for (const forbidden of ["proxy_url", "api_token", "dispatcher", "brightdata", "superproxy", "Mozilla/", "Sec-Fetch", "redirect: 'follow'", 'redirect: "follow"']) {
      forbidText(7, path, body, forbidden, `the official-media reader must not contain '${forbidden}'`);
    }
  }
  requireBefore(7, `${jpDir}/collect.ts`, collect, "readRobotsTxt(", "fetchSeriesPage(", "robots.txt must be read before any list page");
  requireText(7, `${jpDir}/config.ts`, source(`${jpDir}/config.ts`),
    '"CambridgeTCG-official-media/1.0 (+https://cambridgetcg.com/legal/card-images; contact@cambridgetcg.com; permission cambridge.official-ja-media/2026-10-30)"',
    "the Japanese lane's User-Agent must name Cambridge, a contact and the decision");

  // Import fences: the collection run and the reader are reached only by the
  // tools; the tools only by their scripts.
  const namesCollect = (spec: string) => /(?:^|\/)bandai-jp\/collect(?:\.ts)?$/.test(spec) || spec === "./collect";
  const namesMedia = (spec: string) => /(?:^|\/)official-media(?:\.ts)?$/.test(spec);
  for (const path of ["packages/data-ingest/src/index.ts", `${jpDir}/index.ts`]) {
    for (const spec of specifiers(source(path))) if (namesCollect(spec) || namesMedia(spec)) fail(7, path, `the package index must not export '${spec}'`);
  }
  const mayCollect = new Set([OFFICIAL_IMAGE_TOOLS, INGEST_OFFICIAL_JA, UPLOAD_OFFICIAL_IMAGES]);
  const mayReadMedia = new Set([...mayCollect, `${jpDir}/collect.ts`]);
  const roots = ["apps/storefront/src", "apps/storefront/scripts", "apps/wholesale/src", "apps/wholesale/tools", "apps/admin/src", "packages"];
  for (const file of roots.flatMap((root) => codeFiles(resolve(REPO_ROOT, root)))) {
    const path = relativePath(file);
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (namesCollect(spec) && !mayCollect.has(path)) fail(7, path, "only the official-image tools may reach the Japanese collection run");
      if (namesMedia(spec) && !mayReadMedia.has(path)) fail(7, path, "only the official-image tools may reach the official-media reader");
      if (/(?:^|\/)official-image-tools(?:\.ts)?$/.test(spec) && path !== INGEST_OFFICIAL_JA && path !== UPLOAD_OFFICIAL_IMAGES) fail(7, path, "only the two manual scripts may run the official-image tools");
    }
  }
  // Never scheduled.
  for (const file of codeFiles(resolve(REPO_ROOT, "apps/storefront/src/app/api/cron"))) {
    const body = readFileSync(file, "utf8");
    if (/bandai-jp|official-ja/.test(body)) fail(7, relativePath(file), "no cron may name the Japanese official-image lane");
  }
  for (const path of ["apps/storefront/vercel.json", "apps/wholesale/vercel.json"]) {
    if (existsSync(resolve(REPO_ROOT, path)) && /bandai-jp|official-ja/.test(source(path))) fail(7, path, "no schedule may name the Japanese official-image lane");
  }
}

// ── end official images ───────────────────────────────────────────────

function auditLegacyPublicationLocks(): void {
  const policy = source("apps/storefront/src/lib/public-wholesale-fields.ts");
  requireText(8, "legacy wholesale fields", policy, "LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED = false as const", "legacy field publication lock must remain false");
  for (const projection of ["price_gbp: null", "channel_price: null", "image_url: null"]) {
    requireText(8, "legacy wholesale fields", policy, projection, `public projection must keep '${projection}'`);
  }

  const client = source("apps/storefront/src/lib/wholesale/client.ts");
  requireText(8, "wholesale HTTP client", client, "withholdUnreviewedWholesaleFields", "HTTP responses must pass through the public-field projector");

  const dbSource = source("apps/storefront/src/lib/wholesale/db-source.ts");
  requireText(8, "wholesale DB client", dbSource, "price_gbp: null", "direct DB responses must emit null price");
  requireText(8, "wholesale DB client", dbSource, "image_url: null", "direct DB responses must emit null image");
  forbidText(8, "wholesale DB client", dbSource, "SELECT sku, card_number, price, cardrush_jpy", "public DB query must not select legacy price lineage");

  // The official image lanes (self-hosted publisher art) are pinned in
  // auditOfficialImageLanes below.

  const publicationPolicy = source("apps/wholesale/src/lib/source-publication-policy.ts");
  requireText(8, "wholesale price sources", publicationPolicy, "Object.freeze([] as const)", "price-source publication allowlist must remain empty");
  requireText(8, "wholesale external publication", publicationPolicy, "LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED = false as const", "external legacy catalog publication lock must remain false");

  for (const path of [
    "apps/storefront/src/app/api/v1/cards/[sku]/cardrush-history/route.ts",
    "apps/wholesale/src/app/api/v1/cardrush/history/[sku]/route.ts",
  ]) {
    const body = source(path);
    requireText(8, path, body, "503", "legacy history route must remain unavailable");
    for (const forbidden of ["price_archive", "priceArchive", "fetchCardrushHistory"]) {
      forbidText(8, path, body, forbidden, `legacy history route must not contain '${forbidden}'`);
    }
  }

  for (const path of [
    "apps/wholesale/src/app/api/v1/prices/route.ts",
    "apps/wholesale/src/app/api/v1/prices/[sku]/route.ts",
    "apps/wholesale/src/app/api/v1/prices/movers/route.ts",
  ]) {
    const body = source(path);
    requireText(8, path, body, "status: 503", "legacy catalog route must remain unavailable");
    for (const forbidden of ["authenticateApiKey", 'from "@/lib/db"', "price_archive", "cards.price"]) {
      forbidText(8, path, body, forbidden, `status-only route must not contain '${forbidden}'`);
    }
  }

  const quarantine = source("apps/wholesale/src/app/api/v1/ingest-quarantine/[id]/route.ts");
  requireText(8, "quarantine detail", quarantine, "status: 503", "raw quarantine detail must remain unavailable");
  for (const forbidden of ["authenticateApiKey", 'from "@/lib/db"', "raw_payload"]) {
    forbidText(8, "quarantine detail", quarantine, forbidden, `status-only quarantine route must not contain '${forbidden}'`);
  }

  // New order admission is retired outright. It no longer reaches the legacy
  // catalog guard or authentication; pin its immediate status-only response.
  const retiredOrdersPath = "apps/wholesale/src/app/api/orders/route.ts";
  const retiredOrders = source(retiredOrdersPath);
  requireText(8, retiredOrdersPath, retiredOrders, "export async function POST() {\n  return NextResponse.json(newOrdersRetiredResult(), {", "retired order admission must return before parsing or other work");
  requireText(8, retiredOrdersPath, retiredOrders, "status: NEW_ORDERS_RETIRED_STATUS", "retired order admission must use its fixed retirement status");
  requireText(8, retiredOrdersPath, retiredOrders, '"Cache-Control": "no-store"', "retired order admission must remain uncached");
  for (const forbidden of ['from "@/lib/auth"', 'from "@/lib/db"', 'from "@/lib/email/', "await ", "fetch(", "req.", "request."]) {
    forbidText(8, retiredOrdersPath, retiredOrders, forbidden, `retired order admission must not contain '${forbidden}'`);
  }
  const retirementPolicy = source("apps/wholesale/src/lib/commercial-retirement.ts");
  requireText(8, "wholesale retirement policy", retirementPolicy, "NEW_ORDERS_RETIRED_STATUS = 410", "new order admission must remain retired with HTTP 410");
  requireText(8, "wholesale retirement policy", retirementPolicy, 'code: "NEW_ORDERS_RETIRED"', "retired order admission must preserve its explicit response code");

  for (const [path, firstWork] of [
    ["apps/wholesale/src/app/api/cards/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cart/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cart/refresh/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cron/shopify-sync/route.ts", "requireCronAuth(req)"],
    ["apps/wholesale/src/app/api/admin/shopify-sync/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cron/rebuild-buylist/route.ts", "requireCronAuth(req)"],
    ["apps/wholesale/src/app/api/admin/rebuild-buylist/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cron/ebay-sync/route.ts", "requireCronAuth(req)"],
    ["apps/wholesale/src/app/api/admin/channels/ebay/sync/route.ts", "const session = await auth()"],
  ] as const) {
    requireBefore(
      8,
      path,
      source(path),
      "if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED)",
      firstWork,
      "legacy catalog guard must run before auth, database, or external work",
    );
  }

  for (const [path, firstWork] of [
    ["apps/wholesale/src/lib/shopify-sync.ts", "const client = new ShopifyClient()"],
    ["apps/wholesale/src/lib/buylist-builder.ts", "const [opGame] = await db"],
    ["apps/wholesale/src/lib/cloudflare-kv.ts", "const accountId = process.env.CF_ACCOUNT_ID"],
    ["apps/wholesale/src/lib/channels/ebay.ts", "const tokenResult = await getAccessToken()"],
  ] as const) {
    requireBefore(
      8,
      path,
      source(path),
      "if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED)",
      firstWork,
      "shared external-publication helper must fail before secrets, database, or network work",
    );
  }

  const ebayCli = source("apps/wholesale/tools/ebay-sync.ts");
  requireBefore(8, "eBay catalog CLI", ebayCli, "if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED)", 'existsSync(".env.local")', "eBay CLI must stop before reading environment secrets");

  const bountyVault = source("apps/storefront/src/app/api/bounty/vault/route.ts");
  requireText(8, "bounty vault", bountyVault, "spot_price_gbp: null", "signed-in vault must withhold legacy spot price");
  requireText(8, "bounty vault", bountyVault, "image_url: null", "signed-in vault must withhold legacy image");

  const everything = source("apps/storefront/src/app/api/v1/cards/[sku]/everything/route.ts");
  requireText(8, "everything composer", everything, "reference_price_gbp: null", "composer must independently null the legacy reference price");
  requireText(8, "everything composer", everything, "image_url: null", "composer must independently null legacy images");

  const marketHistory = source("apps/storefront/src/lib/market/card-market.ts");
  forbidText(8, "market history", marketHistory, "FROM card_price_history", "mixed legacy history table must not be queried by the public composer");
}

function auditParticipantNoteBoundary(): void {
  for (const path of [
    "apps/storefront/src/app/api/v1/agents/notes/route.ts",
    "apps/storefront/src/app/api/v1/agents/notes/[id]/route.ts",
  ]) {
    const body = source(path);
    requireText(10, path, body, "PARTICIPANT_NOTE_STORAGE_ENABLED = false as const", "participant-note storage off-switch must remain false");
    requireText(10, path, body, "PARTICIPANT_NOTE_PUBLICATION_ENABLED = false as const", "participant-note publication off-switch must remain false");
  }
  const collection = source("apps/storefront/src/app/api/v1/agents/notes/route.ts");
  requireText(10, "agent note witness", collection, 'visibility: "receipt_echo_only"', "participant POST must remain witness-only");
  requireText(10, "agent note witness", collection, 'const PARTICIPANT_RIGHTS_LICENSE = "NOASSERTION"', "participant rights must remain unasserted");
  requireText(10, "agent note witness", collection, 'const PARTICIPANT_SOURCE_LICENSE = "proprietary"', "participant source tier must remain conservative and envelope-valid");
  requireText(10, "agent note witness", collection, 'license: PARTICIPANT_RIGHTS_LICENSE', "participant echo must remain NOASSERTION-governed");
}

function auditFxSources(): void {
  for (const path of [
    "apps/storefront/src/lib/fx/rates.ts",
    "apps/wholesale/src/lib/fx.ts",
    "apps/wholesale/tools/lib/fx-rate.ts",
  ]) {
    const body = source(path);
    forbidText(9, path, body, "open.er-api", "retired FX provider must not remain callable");
    forbidText(9, path, body, "exchangerate.host", "retired FX provider must not remain callable");
  }
  requireText(9, "storefront FX", source("apps/storefront/src/lib/fx/rates.ts"), "ecb.europa.eu", "storefront FX must name ECB");
  requireText(9, "wholesale FX", source("apps/wholesale/src/lib/fx.ts"), "ECB_REUSE_POLICY_URL", "wholesale FX must carry ECB attribution policy");
}

function auditConservativeEnvelope(): void {
  const spec = source("packages/data-spec/src/freshness.ts");
  const envelope = source("apps/storefront/src/lib/data-pantry/envelope.ts");

  requireText(
    4,
    "envelope default",
    spec,
    'DEFAULT_LICENSE = "NOASSERTION"',
    "undeclared aggregate rights must default to NOASSERTION",
  );
  requireText(
    4,
    "envelope default",
    envelope,
    "license: resolveLicense(opts)",
    "the runtime envelope must resolve rights instead of copying a blanket default",
  );
  requireText(
    4,
    "envelope CC0 guard",
    envelope,
    'opts.license === "CC0-1.0"',
    "an explicit CC0 claim must be checked against declared source rights",
  );
  requireText(
    4,
    "envelope CC0 guard",
    envelope,
    "!allSourcesAreCc0",
    "mixed or restrictive declared sources must prevent a CC0 aggregate claim",
  );
}

function auditSoldComps(): void {
  const routePaths = [
    "apps/storefront/src/app/api/v1/sold-comps/route.ts",
    "apps/storefront/src/app/api/v1/sold-comps/[sku]/route.ts",
  ];

  for (const routePath of routePaths) {
    const route = source(routePath);
    requireText(
      5,
      routePath,
      route,
      'license: "NOASSERTION"',
      "paused sold comps must not claim a reusable aggregate license",
    );
    requireText(
      5,
      routePath,
      route,
      'source_license: ["internal-only"]',
      "paused sold comps must retain the internal-only source boundary",
    );
    requireText(
      5,
      routePath,
      route,
      "soldCompsPausedData",
      "route must return only the paused policy projection",
    );
    for (const forbidden of [
      "@/lib/db",
      "market_trades",
      "p2p_sold_comps",
      "CC0-1.0",
    ]) {
      forbidText(
        5,
        routePath,
        route,
        forbidden,
        `paused route must not contain '${forbidden}'`,
      );
    }
  }

  const queryPath = "apps/storefront/src/lib/sold-comps/query.ts";
  const query = source(queryPath);
  requireText(
    5,
    queryPath,
    query,
    'status: "paused"',
    "sold-comps projection must remain visibly paused",
  );
  for (const forbidden of [
    "@/lib/db",
    "query(",
    "market_trades",
    "p2p_sold_comps",
    "PERCENTILE_CONT",
  ]) {
    forbidText(
      5,
      queryPath,
      query,
      forbidden,
      `paused projection must not contain '${forbidden}'`,
    );
  }
}

function auditGlobalCopy(): void {
  const retiredBlanketClaims = [
    "CC0 by default",
    "CC0-1.0 by default",
    "published under CC0 by default",
    "Most data is CC0",
    "absence means CC0",
    "train on it freely",
  ];

  for (const file of activeSourceFiles(ACTIVE_SOURCE_ROOT)) {
    const body = readFileSync(file, "utf8");
    for (const claim of retiredBlanketClaims) {
      forbidText(
        6,
        file.slice(REPO_ROOT.length + 1),
        body,
        claim,
        `restores retired blanket claim '${claim}'`,
      );
    }
  }
}

async function main(): Promise<void> {
  const sources = await loadRegistry();
  const metaSchema = await loadMetaSchema();
  const lanesUrl = `file://${resolve(ACTIVE_SOURCE_ROOT, "lib", "cards", "official-image-lanes.ts")}`;
  const { OFFICIAL_IMAGE_LANES } = (await import(lanesUrl)) as { OFFICIAL_IMAGE_LANES: unknown };
  const originsChecked = auditCc0Surfaces(sources);

  auditEnvelopeSchema(metaSchema);
  auditCatalog();
  auditConservativeEnvelope();
  auditSoldComps();
  auditGlobalCopy();
  auditAcquisitionLocks();
  auditCardmarketCollector();
  auditCardRushPageCollector();
  auditTcgplayerAcquisition();
  auditLegacyPublicationLocks();
  auditOfficialImageLanes(OFFICIAL_IMAGE_LANES);
  auditOfficialImageTools();
  auditFxSources();
  auditParticipantNoteBoundary();

  console.log("");
  console.log("redistribution audit - publication and reuse-right boundaries");
  console.log("");
  console.log(`  CC0 data surfaces declared: ${CC0_EXPORT_SURFACES.length}`);
  console.log(`  CC0 origins checked:        ${originsChecked}`);
  console.log(`  registry sources:           ${Object.keys(sources).length}`);
  console.log(`  findings:                   ${findings.length}`);
  console.log("");

  if (findings.length === 0) {
    console.log("ok - source rights remain registry-governed");
    console.log("ok - unknown aggregate rights resolve to NOASSERTION");
    console.log("ok - sold comps remain paused and off participant data");
    console.log("ok - the bulk catalog does not mistake storage for ownership");
    console.log("ok - blocked acquisition paths cannot reopen through tools or audits");
    console.log("ok - Cardmarket collection runs only through its flag-gated, evidence-gated official-file collector");
    console.log("ok - the CardRush page collector is the one permitted CardRush path: evidence-gated, identified, no proxy");
    console.log("ok - TCGplayer is read only by the evidence-gated price-guide collector; its API reader stays locked");
    console.log("ok - reviewed legacy wholesale projections retain their price/image locks; catalog photo fallback has a separate display rule");
    console.log("ok - official card images publish only self-hosted (s3_key), takedown-clear, attributed and in their pinned language lane — never a publisher url");
    console.log("ok - official images are collected and uploaded only by the two manual tools: identified, robots-first, never overwriting, by full key");
    console.log("ok - live FX paths use attributed ECB statistics");
    console.log("ok - participant note storage and publication remain disabled");
    return;
  }

  for (const finding of findings) {
    console.error(
      `fail - [check ${finding.check}] ${finding.boundary}: ${finding.message}`,
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Audit crashed:", error);
  process.exit(2);
});

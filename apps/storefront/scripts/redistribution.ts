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
  // database or the network, with nothing that could switch the stop off: the
  // refusal is its first statement, at the top level, with only comments and
  // imports before it. Its imports are Node built-ins and pg alone, because an
  // imported module runs before any statement of the script.
  const selfHostPath = "apps/storefront/scripts/self-host-cardrush.mjs";
  const selfHost = source(selfHostPath);
  const staticImport = /^import\b[^;()]*?["']([^"'\n]+)["'];$/gm;
  const refusal = /^console\.error\("CardRush images are linked, never copied[^"\\\n]*"\);\nprocess\.exit\(1\);$/m.exec(selfHost);
  const beforeRefusal = refusal
    ? selfHost.slice(0, refusal.index).replace(/\/\*[\s\S]*?\*\//g, "").replace(staticImport, "").replace(/^\/\/.*$/gm, "").trim()
    : null;
  if (beforeRefusal !== "") fail(7, selfHostPath, "the CardRush image copy script must refuse, naming why, as its first statement and unconditionally");
  for (const [, specifier] of selfHost.matchAll(staticImport)) {
    if (!specifier!.startsWith("node:") && specifier !== "pg") fail(7, selfHostPath, `the CardRush image copy script must import nothing that runs before its refusal: '${specifier}'`);
  }

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

  // The legacy image lane stays null (above); the ONE honest way an image now
  // reaches the public is the official English-image reader. Recorded rule
  // 2026-07-13 (docs/EN-CARD-DATA.md, /legal/card-images): publish OFFICIAL
  // publisher art, self-hosted on our own host, takedown-clear, always attributed,
  // under nominative-fair-use for a marketplace. This block pins that the reader
  // publishes a row ONLY via its self-hosted object (CARD_IMAGE_CDN + s3_key),
  // gated on s3_key IS NOT NULL, takedown_status = 'clear', kind = 'official_sample'
  // — and that a stored publisher source_url is metadata only, never the served url.
  const enCardData = source("apps/storefront/src/lib/cards/en-card-data.ts");
  requireText(8, "official image reader", enCardData, "export async function getEnCardData", "the single-card official-image reader must remain the named contract entry point");
  requireText(8, "official image reader", enCardData, "export async function getEnCardImages", "the batch official-image reader must remain the named contract entry point");
  // Single and batch use one runtime projector; behavioral fixtures verify its
  // URL, source, reference and attribution checks beyond these source pins.
  requireText(8, "official image reader", enCardData, "getEnCardImages([catalogSku])", "single-card reads must share the batch publication boundary");
  requireText(8, "official image reader", enCardData, "projectOfficialImage(sku, row, cdn)", "batch reads must use the reviewed official-media projection");
  requireText(8, "official image reader", enCardData, "source = 'bandai-en'", "only the recorded source may enter this reader");
  const imagePublication = source("apps/storefront/src/lib/cards/image-publication.ts");
  requireText(8, "official image projection", imagePublication, "officialImageUrl(row.s3_key, cdn)", "served URLs must use a validated self-hosted object key");
  requireText(8, "official image projection", imagePublication, "createImageReference(requestedSku, row.sku)", "an image must retain the requested and selected identifiers");
  requireText(8, "official image projection", imagePublication, "!row.attribution.trim()", "blank copyright lines must not publish");
  // The query publishes ONLY self-hosted, takedown-clear, publisher-official rows.
  requireText(8, "official image reader", enCardData, "s3_key IS NOT NULL", "the reader must publish only rows self-hosted on our host (s3_key present)");
  requireText(8, "official image reader", enCardData, "takedown_status = 'clear'", "a disputed or removed row must never publish");
  requireText(8, "official image reader", enCardData, "kind = 'official_sample'", "only publisher-official art may publish, never a shop scan");
  // The stored publisher source_url must never be assigned to the served `url`.
  // (Leading space so these never collide with the legitimate `source_url:` field.)
  for (const neverServed of [" url: row.source_url", " url: r.source_url", " url: source_url"]) {
    forbidText(8, "official image reader", enCardData, neverServed, "the stored publisher source_url must never become the served image url");
  }

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
    console.log("ok - official card images publish only self-hosted (s3_key), takedown-clear, and attributed - never a publisher url");
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

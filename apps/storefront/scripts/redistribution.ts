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

import { readFileSync, readdirSync } from "node:fs";
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
  requireText(7, "CardRush registry", cardrush, 'status: "blocked"', "CardRush source status must remain blocked");

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
  // The served url is built from the Cambridge-controlled host + s3_key, in both
  // the single-card and the batch (grid) reader. If either regressed to serve the
  // publisher source_url, this positive pin would go missing and the audit fails.
  requireText(8, "official image reader", enCardData, "`${CARD_IMAGE_CDN}/${row.s3_key}`", "single-card image url must be the self-hosted host + s3_key, never a publisher url");
  requireText(8, "official image reader", enCardData, "`${CARD_IMAGE_CDN}/${r.s3_key}`", "batch image url must be the self-hosted host + s3_key, never a publisher url");
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

  for (const [path, firstWork] of [
    ["apps/wholesale/src/app/api/cards/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cart/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/cart/refresh/route.ts", "const session = await auth()"],
    ["apps/wholesale/src/app/api/orders/route.ts", "const session = await auth()"],
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
    console.log("ok - legacy prices and images remain withheld from public projections");
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

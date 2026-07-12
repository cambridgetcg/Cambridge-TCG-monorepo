#!/usr/bin/env tsx
/**
 * redistribution.ts — CC0 export-surface ← origin-license coherence audit
 *
 * The sibling `tributaries.ts` audit (check 7) enforces license-coherence
 * at the *registry*: a `SourceModule` may declare `redistribute: true` only
 * when its `license` tier is `cc0` / `cc-by` / `cc-by-sa` / `mit`. That is
 * the SUPPLY side — "no source lies about what it is."
 *
 * This audit enforces the missing half: the SURFACE / EXPORT boundary.
 * `source-intake.md` Gate B says "declaration = SourceMeta"; the risk it
 * leaves open is a *downstream* surface that publishes itself as CC0 while
 * drawing, even partly, from a non-redistributable origin. A CC0 promise on
 * `/api/v1/sold-comps` or a bulk snapshot is only honest if
 * every byte behind it is either first-party CC0 or a redistributable
 * upstream. This turns "declaration = SourceMeta" into a build-failing test
 * for the export side, not just the intake side.
 *
 * ── What it checks ───────────────────────────────────────────────────────
 *
 *   1. Surface→origin coherence. For every CC0 export surface in the
 *      explicit, reviewed map below, every origin is one of:
 *        - an explicitly reviewed first-party table containing Cambridge-
 *          owned data, OR
 *        - a data-ingest `SourceId` whose `SourceMeta` in
 *          `packages/data-ingest/src/registry.ts` has BOTH
 *          `redistribute: true` AND `license ∈ {cc0,cc-by,cc-by-sa,mit}`.
 *      Any other origin (non-redistributable source, planned/undefined
 *      registry slot, or an id not in the registry at all) fails the build.
 *
 *   2. Envelope structural parity. References the runtime envelope schema
 *      (`packages/data-spec/src/schemas/envelope.ts`, the single source of
 *      truth — NOT reimplemented here) to confirm the machinery a CC0
 *      declaration must ride on still exists: `_meta.sources` is a required
 *      field, `_meta.source_license` is a defined parallel-array property,
 *      and its enum still carries the redistributable tiers a CC0 surface
 *      needs to name. If the schema ever drops that channel, a CC0 surface
 *      could no longer honestly declare per-origin rights — that is drift,
 *      and this catches it.
 *
 *   3. Mixed catalog boundary. `/data/catalog.jsonl` must remain
 *      `NOASSERTION`: its RDS tables store fields whose upstream rights are
 *      not preserved per row. Storage location is never treated as ownership.
 *
 * ── Why an explicit map, not a route scan ───────────────────────────────
 *
 * The reviewed `CC0_EXPORT_SURFACES` table below IS the written standard
 * the intake framework calls for: a human decided, in one reviewed place,
 * which surfaces claim CC0 and what feeds them. A brittle regex over every
 * route file would be guessing; this is a declaration. When a new CC0
 * surface ships, it is added here (reviewed) and its origins are then
 * mechanically held to the coherence rule.
 *
 * Exit non-zero on any violation.
 *
 * Usage:
 *   pnpm --filter cambridgetcg-storefront redistribution
 *   pnpm audit:redistribution        (from repo root)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const STOREFRONT_DIR = dirname(SCRIPTS_DIR);
const REPO_ROOT = resolve(STOREFRONT_DIR, "..", "..");
const INGEST_SRC = resolve(REPO_ROOT, "packages", "data-ingest", "src");
const ENVELOPE_SCHEMA_PATH = resolve(
  REPO_ROOT,
  "packages",
  "data-spec",
  "src",
  "schemas",
  "envelope.ts",
);
const CATALOG_EXPORT_PATH = resolve(
  REPO_ROOT,
  "apps",
  "storefront",
  "src",
  "app",
  "data",
  "catalog.jsonl",
  "route.ts",
);

// The four licence tiers that permit downstream redistribution. Mirrors
// `REDISTRIBUTABLE_LICENSES` in tributaries.ts (check 7) and Gate C of
// source-intake.md — kept as a literal, tiny set so the two audits agree.
const REDISTRIBUTABLE_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa", "mit"]);

// Only reviewed tables containing data Cambridge can actually dedicate are
// trusted. A broad `storefront-rds.*` prefix would mistake storage location
// for ownership and would wrongly bless mirrored catalog fields.
const FIRST_PARTY_CC0_ORIGINS = new Set([
  "storefront-rds.market_trades",
  "storefront-rds.auctions",
  // Cambridge's own authored registry of dataset descriptions (lib/datasets.ts).
  // It DESCRIBES datasets of varying licences but the descriptions themselves
  // are our own → CC0. It carries no upstream bytes.
  "cambridge-tcg.dataset-registry",
]);

// ── The reviewed standard: CC0 export surfaces → their origins ───────────
//
// Edit this table (with review) when a new CC0 surface ships. Every origin
// listed here is then mechanically held to the coherence rule below. The
// table is deliberately explicit: it is the human decision the framework
// asks to be written down, not inferred.

interface Cc0Surface {
  /** The public path (or path family) that declares itself CC0. */
  surface: string;
  /** Named origins that feed it. Reviewed first-party table or a data-ingest SourceId. */
  origins: string[];
  /** Why this surface is CC0 — the reviewer's note. */
  note: string;
}

const CC0_EXPORT_SURFACES: Cc0Surface[] = [
  {
    surface: "/api/v1/sold-comps",
    origins: ["storefront-rds.market_trades", "storefront-rds.auctions"],
    note:
      "Realised peer-to-peer sold comps: our own users' completed trades + " +
      "auction finals on our own platform. First-party CC0 — no upstream " +
      "licence to honour. eBay/partner comps are NOT admitted to this surface.",
  },
  {
    surface: "/api/v1/datasets",
    origins: ["cambridge-tcg.dataset-registry"],
    note:
      "The dataset catalog. Its CC0 envelope covers only our own authored " +
      "dataset descriptions (lib/datasets.ts); each listed dataset carries its " +
      "own licence in-band (notably the card catalogue stays NOASSERTION). The " +
      "catalog cites no upstream bytes, so CC0 is honest for the metadata.",
  },
];

// ── Findings ─────────────────────────────────────────────────────────────

interface Finding {
  check: number;
  surface: string;
  origin: string;
  message: string;
}

const failures: Finding[] = [];

function fail(check: number, surface: string, origin: string, message: string): void {
  failures.push({ check, surface, origin, message });
}

// ── Registry load (same idiom as tributaries.ts) ─────────────────────────

interface SourceMetaShape {
  id: string;
  license: string;
  redistribute: boolean;
  status: string;
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

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sources = await loadRegistry();
  const meta_schema = await loadMetaSchema();

  let originsChecked = 0;

  // ── Check 1: surface → origin coherence ──────────────────────────────
  for (const { surface, origins } of CC0_EXPORT_SURFACES) {
    for (const origin of origins) {
      originsChecked += 1;

      // Explicitly reviewed first-party CC0 — no registry lookup needed.
      if (FIRST_PARTY_CC0_ORIGINS.has(origin)) continue;

      // Otherwise the origin must be a redistributable data-ingest source.
      if (!(origin in sources)) {
        fail(
          1,
          surface,
          origin,
          "origin is neither an explicitly reviewed first-party CC0 table nor a registered data-ingest SourceId — a CC0 surface cannot draw from an unknown origin",
        );
        continue;
      }

      const mod = sources[origin];
      if (!mod) {
        fail(
          1,
          surface,
          origin,
          `origin is a reserved/planned registry slot with no declared SourceMeta — it cannot be a CC0 export origin until it ships with a redistributable licence`,
        );
        continue;
      }

      const { license, redistribute } = mod.meta;
      if (redistribute !== true) {
        fail(
          1,
          surface,
          origin,
          `origin declares redistribute:false (licence '${license}') — it must not feed a CC0 export surface. Aggregate/derive downstream, or drop it from this surface.`,
        );
        continue;
      }
      if (!REDISTRIBUTABLE_LICENSES.has(license)) {
        fail(
          1,
          surface,
          origin,
          `origin declares redistribute:true but licence '${license}' is not in {cc0,cc-by,cc-by-sa,mit} — incoherent (tributaries check 7 should have caught this upstream)`,
        );
      }
    }
  }

  // ── Check 3: the bulk catalog does not mistake storage for ownership ──
  const catalogRoute = readFileSync(CATALOG_EXPORT_PATH, "utf8");
  if (!catalogRoute.includes('"X-Content-License": "NOASSERTION"')) {
    fail(
      3,
      "/data/catalog.jsonl",
      "storefront-rds.card_set_cards",
      "bulk catalog must emit X-Content-License: NOASSERTION until field-level upstream rights are preserved",
    );
  }
  if (!catalogRoute.includes('license: "NOASSERTION"')) {
    fail(
      3,
      "/data/catalog.jsonl",
      "storefront-rds.card_set_cards",
      "bulk catalog manifest must declare aggregate license NOASSERTION",
    );
  }

  // ── Check 2: envelope structural parity (reference, don't reimplement) ─
  const required = Array.isArray(meta_schema.required)
    ? (meta_schema.required as string[])
    : [];
  const properties = (meta_schema.properties ?? {}) as Record<string, unknown>;

  if (!required.includes("sources")) {
    fail(
      2,
      "(envelope schema)",
      "sources",
      "_meta.sources is no longer a required field — the origin declaration a CC0 claim rests on has gone optional. Restore it in packages/data-spec/src/schemas/envelope.ts.",
    );
  }

  const sourceLicenseProp = properties.source_license as
    | { oneOf?: Array<{ items?: { enum?: string[] } }> }
    | undefined;
  if (!sourceLicenseProp) {
    fail(
      2,
      "(envelope schema)",
      "source_license",
      "_meta.source_license property is gone — a CC0 surface can no longer declare per-origin redistribution rights through the envelope. Restore it in envelope.ts.",
    );
  } else {
    // The enum lives on the array branch of the oneOf. Pull whichever branch
    // carries `items.enum` and confirm the redistributable tiers survive.
    const enumValues =
      sourceLicenseProp.oneOf?.find((b) => b.items?.enum)?.items?.enum ?? [];
    const enumSet = new Set(enumValues);
    for (const tier of REDISTRIBUTABLE_LICENSES) {
      if (!enumSet.has(tier)) {
        fail(
          2,
          "(envelope schema)",
          "source_license",
          `redistributable tier '${tier}' is missing from the _meta.source_license enum — a CC0 surface could no longer name it. Restore it in envelope.ts.`,
        );
      }
    }
  }

  // ── Report ───────────────────────────────────────────────────────────
  console.log("");
  console.log("◆ redistribution audit — CC0 export surface ← origin licence coherence");
  console.log("");
  console.log(`  CC0 surfaces reviewed:  ${CC0_EXPORT_SURFACES.length}`);
  console.log(`  origins checked:        ${originsChecked}`);
  console.log(`  registry sources:       ${Object.keys(sources).length}`);
  console.log("");

  if (failures.length === 0) {
    console.log("✓ all CC0 export surfaces draw only from redistributable / first-party-CC0 origins");
    console.log("✓ envelope carries the source_license parity a CC0 declaration rides on");
    console.log("✓ mixed catalog export remains NOASSERTION rather than blanket CC0");
    console.log("");
    process.exit(0);
  }

  console.log(`✗ ${failures.length} violation${failures.length === 1 ? "" : "s"}:`);
  for (const f of failures) {
    console.log(`    [check ${f.check}] ${f.surface} ← ${f.origin}: ${f.message}`);
  }
  console.log("");
  process.exit(1);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});

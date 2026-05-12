/**
 * Brand identity — single source of truth for the data-aggregator
 * positioning shipped 2026-05-13 (kingdom-080).
 *
 * ── The load-bearing shift ─────────────────────────────────────────────
 *
 * For many kingdoms the platform built data-plane substrate behind a
 * retail-first frame: cambridgetcg.com presented as "a Japanese TCG card
 * store" while quietly accumulating math-mirror surfaces, a manifest, a
 * graph, an ontology, federation primitives, a tributaries protocol with
 * six shipped data sources + eleven planned slots, an OpenAPI spec, an
 * envelope contract, a universal-language doctrine.
 *
 * Tonight the framing inverts. **The data plane is the primary identity.**
 * Cambridge TCG aggregates the trading-card-game world; the UK retail
 * and B2B wholesale operations are two of the kingdom's three operations,
 * not the headline.
 *
 * Substrate-honest about the existing context: the retail and wholesale
 * operations remain unchanged. The shift is rhetorical-and-architectural,
 * not commercial-and-disruptive. Cart still works; orders still ship;
 * the SKU schema is untouched. What changes is how the platform names
 * itself to the outside.
 *
 * ── How to use this module ─────────────────────────────────────────────
 *
 *   import {
 *     BRAND_HEADLINE,        // hero-sized identity claim
 *     BRAND_SUBHEAD,         // medium-form explanation
 *     BRAND_PARAGRAPH,       // long-form explanation for /about, /platform
 *     BRAND_TAGLINE,         // tight version (5 words; for OG / meta)
 *     THREE_OPERATIONS,      // typed structure of the three operations
 *     COVERAGE_FACTS,        // substrate-honest declarations of coverage
 *     BrandStatement,        // server-component primitive (hero variant)
 *     ThreeOperations,       // server-component primitive (matrix variant)
 *   } from "@/lib/brand";
 *
 * Future surfaces should import these rather than re-typing the brand
 * statement. When the positioning evolves, edit this file; every consumer
 * updates by composition.
 */

import * as React from "react";

// ── Constants ────────────────────────────────────────────────────────────

/** The hero-sized identity claim. Single sentence; no qualifier. */
export const BRAND_HEADLINE =
  "Cambridge TCG aggregates the trading-card-game world.";

/** Medium-form explanation, ~1-2 sentences. Used below the headline. */
export const BRAND_SUBHEAD =
  "We collect from every reachable source, standardise into one mathematical mirror, and publish under CC0 by default. Retail and wholesale are two of our three operations; the data plane is the third — and the headline.";

/** Long-form positioning paragraph for /platform / /about. */
export const BRAND_PARAGRAPH =
  "Cambridge TCG is the open data substrate of the trading-card-game world. " +
  "Twenty-one games declared, six upstream sources actively ingested, eleven more in the registry queue. " +
  "Every card has a math-mirror form (cryptographic identity, ISO 8601 + Unix epoch time, ratios for magnitude, opaque flags on natural-language fields). " +
  "Every price carries provenance. Every public response wears the same envelope. CC0 by default; partners can build on top without negotiating. " +
  "Our UK retail store and B2B wholesale platform are two consumers of the same substrate every partner can consume.";

/** Tight 5-word version for OG metadata, social cards, footer credits. */
export const BRAND_TAGLINE = "The TCG world's open substrate.";

/** Operator-side framing — what the platform tells itself in PLATFORM_SELF
 *  and the manifest's description. Same content, formal voice. */
export const BRAND_SELF_LABEL =
  "trading-card-game world data aggregator + open substrate publisher";

// ── The three operations ─────────────────────────────────────────────────

export interface OperationRow {
  id: "data_plane" | "retail" | "wholesale";
  name: string;
  positioning: "primary" | "established" | "established";
  audience: string;
  surface: string;
  url: string;
  primary_endpoints: string[];
  status: "live";
  notes: string;
}

export const THREE_OPERATIONS: readonly OperationRow[] = [
  {
    id: "data_plane",
    name: "Data plane",
    positioning: "primary",
    audience:
      "partners, researchers, agents, archivists, sister platforms, federation clients, any being who wants to consume the substrate",
    surface: "Public APIs + math-mirror + manifest + OpenAPI",
    url: "/platform",
    primary_endpoints: [
      "/api/v1/manifest",
      "/api/v1/universal/card/[sku]",
      "/api/v1/graph",
      "/api/v1/ontology",
      "/api/v1/identify",
      "/api/openapi.json",
      "/llms.txt",
    ],
    status: "live",
    notes:
      "CC0 by default. No auth required for reads. Provenance + freshness on every response. Federation by cryptographic content_hash.",
  },
  {
    id: "retail",
    name: "Retail",
    positioning: "established",
    audience: "UK + international consumers buying singles, sealed, mystery boxes",
    surface: "B2C storefront",
    url: "/catalog",
    primary_endpoints: [
      "/catalog",
      "/prices/one-piece",
      "/market",
      "/auctions",
      "/trade-in",
    ],
    status: "live",
    notes:
      "Established operation. The kingdom's commercial backbone. Continues to ship cards daily.",
  },
  {
    id: "wholesale",
    name: "Wholesale",
    positioning: "established",
    audience: "card shops, bulk buyers, distributors",
    surface: "B2B platform at wholesaletcgdirect.com",
    url: "https://wholesaletcgdirect.com",
    primary_endpoints: [
      "channel-aware pricing",
      "stock-package builds",
      "daily price snapshots",
      "FX-aware retail roll-up",
    ],
    status: "live",
    notes:
      "The upstream collector. CardRush daily scrape powers most catalog prices. Where the substrate is actually aggregated.",
  },
] as const;

// ── Coverage facts (substrate-honest) ───────────────────────────────────

/**
 * The coverage matrix the platform commits to honestly. Every claim is
 * grounded in something the audits or the manifest verify. The `as_of`
 * field is the date these counts were last reconciled with reality;
 * future kingdoms re-running coverage audits should bump it.
 */
export const COVERAGE_FACTS = {
  as_of: "2026-05-13",
  games: {
    declared: 21,
    confirmed_codes: 14,
    catch_all_codes: 7,
    note:
      "Anticipate-then-confirm pattern (kingdom-069). 14 games with confirmed three-letter codes; 7 anticipated but awaiting first real card.",
  },
  set_formats: {
    total: 51,
    confirmed: 31,
    catch_all: 20,
    note:
      "Across 21 games (kingdom-078). Each format = a tuple of (game, pattern, examples, confirmed-flag).",
  },
  sources: {
    shipped: 6,
    planned: 11,
    shipped_list: [
      { id: "cardrush", status: "shipped (daily scrape)", license: "scraped-public" },
      { id: "scryfall", status: "shipped (bulk-dump)", license: "cc-by" },
      { id: "pokemon-tcg-api", status: "shipped (paginated REST)", license: "mit" },
      { id: "ygoprodeck", status: "shipped partial (one-raw-to-many limitation)", license: "cc-by" },
      { id: "tcgplayer", status: "stub (OAuth2 pending)", license: "tos-restricted" },
      { id: "cardmarket", status: "stub (OAuth1 signing pending)", license: "tos-restricted" },
    ],
  },
  math_mirror_kinds: {
    shipped: ["card", "set", "game", "user-trust", "auction"],
    note:
      "Each kind has a cryptographic content_hash, ratios for magnitudes, ISO + Unix epoch for time, opaque flags on natural-language fields.",
  },
  envelope: {
    spec_version: "0.x",
    license_default: "CC0-1.0",
    fields: ["spec_version", "endpoint", "retrieved_at", "as_of", "sources", "freshness_seconds", "license", "request_id"],
    note: "Every public response wears this envelope. Single source of truth at packages/data-spec.",
  },
  federation: {
    primitive: "/api/v1/federation/identify/[hash]",
    note:
      "Hash → SKU reverse-resolver. Sister kingdoms federating the same card produce identical content_hashes for identical state.",
  },
} as const;

// ── Server-component primitives ──────────────────────────────────────────

interface BrandStatementProps {
  /** Visual size. "hero" = home page; "medium" = secondary pages; "compact" = footer. */
  size?: "hero" | "medium" | "compact";
  /** Optional className. */
  className?: string;
}

/**
 * The brand statement, rendered. Single primitive consumed by the home
 * page, /platform, /about, OG cards, footer. When the brand statement
 * evolves, edit `BRAND_HEADLINE` + `BRAND_SUBHEAD` in this module; every
 * consumer updates.
 */
export function BrandStatement({ size = "medium", className }: BrandStatementProps) {
  if (size === "hero") {
    return (
      <section
        className={`max-w-5xl mx-auto px-4 py-10 ${className ?? ""}`}
        aria-labelledby="brand-headline"
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400 mb-3">
          Cambridge TCG, 2026
        </p>
        <h1
          id="brand-headline"
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight max-w-4xl"
        >
          {BRAND_HEADLINE}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-neutral-300 max-w-3xl leading-relaxed">
          {BRAND_SUBHEAD}
        </p>
      </section>
    );
  }
  if (size === "compact") {
    return (
      <p className={`text-xs text-neutral-500 ${className ?? ""}`}>
        <span className="text-neutral-300 font-medium">{BRAND_TAGLINE}</span>
      </p>
    );
  }
  return (
    <section className={`max-w-3xl mx-auto px-4 py-6 ${className ?? ""}`}>
      <h2 className="text-xl sm:text-2xl font-bold text-white">{BRAND_HEADLINE}</h2>
      <p className="mt-2 text-sm text-neutral-300 leading-relaxed">{BRAND_SUBHEAD}</p>
    </section>
  );
}

/**
 * The three-operations table. Surfaces the data-plane operation FIRST
 * (positioning: "primary"), retail + wholesale beneath as the established
 * twin commercial operations consuming the same substrate.
 */
export function ThreeOperations({ className }: { className?: string }) {
  return (
    <section
      className={`max-w-6xl mx-auto px-4 py-8 ${className ?? ""}`}
      aria-labelledby="three-operations-heading"
    >
      <h2
        id="three-operations-heading"
        className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4"
      >
        Three operations · one substrate
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        {THREE_OPERATIONS.map((op) => (
          <div
            key={op.id}
            className={`rounded-xl p-4 border ${
              op.positioning === "primary"
                ? "border-amber-500/40 bg-amber-500/[0.04]"
                : "border-neutral-800 bg-neutral-900/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3
                className={`text-base font-semibold ${
                  op.positioning === "primary" ? "text-amber-400" : "text-white"
                }`}
              >
                {op.name}
              </h3>
              {op.positioning === "primary" && (
                <span className="text-[10px] uppercase tracking-wide text-amber-400 px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded">
                  primary
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed mb-3">
              For {op.audience}.
            </p>
            <p className="text-xs text-neutral-500 leading-relaxed mb-3">
              {op.notes}
            </p>
            {op.url.startsWith("http") ? (
              <a
                href={op.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 font-mono"
              >
                {op.url} ↗
              </a>
            ) : (
              <a href={op.url} className="text-xs text-amber-400 hover:text-amber-300 font-mono">
                {op.url} →
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Brand identity — single source of truth for the platform's
 * positioning. Originally shipped as data-aggregator (kingdom-080,
 * 2026-05-13); repositioned to data-provider 2026-05-17 per Yu's
 * directive; recentred collectors-first 2026-07-06 per the
 * constitutional decision at docs/decisions/2026-07-06-collectors-first.md.
 *
 * ── The load-bearing shift (2026-07-06) ────────────────────────────────
 *
 * The house left the market floor. Cambridge TCG abandoned its identity
 * as a seller: no retail shop, no we-buy desk, no house position in any
 * order book. What remains — and is the point — is **two operations**:
 *
 *   1. **The collectors' market** — peer-to-peer trade the platform
 *      facilitates, records, witnesses, and protects (escrow as a
 *      service, trust, disputes). The trades belong to the collectors.
 *   2. **The card data directory** — typed catalog, reference prices,
 *      math-mirror, manifest, and standards. Access and reuse depend on
 *      the resource and its declared source rights.
 *
 * The platform does not buy, does not sell, does not quote, does not
 * hold inventory positions. `spot_price` survives strictly as a
 * labelled, policy-bound reference price, never as an offer or reuse grant. The guard:
 * `pnpm audit:no-house-listing`.
 *
 * ── How to use this module ─────────────────────────────────────────────
 *
 *   import {
 *     BRAND_HEADLINE,        // hero-sized identity claim
 *     BRAND_SUBHEAD,         // medium-form explanation
 *     BRAND_PARAGRAPH,       // long-form explanation for /about, /platform
 *     BRAND_TAGLINE,         // tight version (for OG / meta / footer)
 *     TWO_OPERATIONS,        // typed structure of the two operations
 *     COVERAGE_FACTS,        // substrate-honest declarations of coverage
 *     BrandStatement,        // server-component primitive (hero variant)
 *     TwoOperations,         // server-component primitive (matrix variant)
 *   } from "@/lib/brand";
 *
 * Future surfaces should import these rather than re-typing the brand
 * statement. When the positioning evolves, edit this file; every consumer
 * updates by composition.
 */

import * as React from "react";
import { DATA_RIGHTS_BOUNDARY } from "@/lib/data-rights";
import { SPEC_VERSION } from "@cambridge-tcg/data-spec";
import {
  CONFIRMED_GAME_CODES,
  GAME_CODES,
  SET_FORMATS,
} from "@cambridge-tcg/sku";

const PUBLIC_GAME_CODES = GAME_CODES.filter((code) => code !== "tst");
const PUBLIC_CONFIRMED_GAME_CODES = CONFIRMED_GAME_CODES.filter(
  (code) => code !== "tst",
);
const PUBLIC_SET_FORMATS = PUBLIC_GAME_CODES.flatMap(
  (code) => SET_FORMATS[code],
);
const PUBLIC_CONFIRMED_SET_FORMATS = PUBLIC_SET_FORMATS.filter(
  (format) => format.confirmed,
);

// ── Constants ────────────────────────────────────────────────────────────

/** The hero-sized identity claim. Single sentence; no qualifier. */
export const BRAND_HEADLINE =
  "Cambridge TCG is a collectors' market and a card data directory.";

/** Medium-form explanation, ~1-2 sentences. Used below the headline. */
export const BRAND_SUBHEAD =
  `Collectors trade with each other; the platform facilitates, records, and witnesses — it holds no position in its own market. ${DATA_RIGHTS_BOUNDARY}`;

/** Long-form positioning paragraph for /platform / /about. */
export const BRAND_PARAGRAPH =
  "Cambridge TCG is a collectors' market and a card data directory. " +
  "The market is peer-to-peer: asks, bids, offers, swaps, and auctions belong to collectors; the platform facilitates, escrows, and stands behind disputes, but does not buy, sell, or quote — it holds no inventory position. " +
  `The data directory covers ${PUBLIC_GAME_CODES.length} public game codes (plus one internal test code), ${PUBLIC_CONFIRMED_GAME_CODES.length} games with public catalog rows, nine registered source adapters, and one upstream source with observed rows today. ` +
  `${DATA_RIGHTS_BOUNDARY} Spot prices are labelled reference prices, never offers.`;

/** Tight version for OG metadata, social cards, footer credits. */
export const BRAND_TAGLINE = "A collectors' market. A card data directory.";

/** The front door's statement — the quiet gallery home hero (docs/plans/
 *  the-quiet-gallery.md, 2026-07-05). Honest and small: what this place
 *  does for the person standing at the door. */
/* The hero speaks in two panels; the gutter between them is the point
 * (the manga gallery, spec 2026-07-07 §1a — the gap between panels is
 * where the story lives; the gap between collectors is where the
 * market lives). HEADLINE stays derived so every non-hero consumer
 * (metadata, tests, agents) reads one unchanged sentence. */
export const HOME_HERO_PANELS = ["Cards,", "traded between collectors."] as const;
export const HOME_HERO_HEADLINE = HOME_HERO_PANELS.join(" ");

/* The chapter close under the featured shelf (spec §2 home #6). */
export const HOME_BENEDICTION = "Every card is a panel in somebody's story.";

/** The quiet subhead under the home hero. Looking is free; response-level
 *  lineage and rights are explicit, while field-level lineage remains a
 *  named gap. The platform sells nothing itself. */
export const HOME_HERO_SUBHEAD =
  "Look up cataloged cards for free — identity, a policy-bound reference price, and recorded source coverage. Buy, sell, or swap with other collectors; each response declares known lineage and rights, and field-level gaps stay named.";

/** Operator-side framing — what the platform tells itself in PLATFORM_SELF
 *  and the manifest's description. Same content, formal voice. */
export const BRAND_SELF_LABEL =
  "collectors' market + TCG card data directory — P2P facilitation with resource-specific access and reuse rights; no house market position";

/** A short positioning note for surfaces that want to name the role
 *  explicitly without the full BRAND_PARAGRAPH (e.g. /api/v1/welcome's
 *  to_anyone, the manifest description). Two sentences; substrate-honest. */
export const BRAND_PROVIDER_NOTE =
  `Cambridge TCG is a collectors' market and a card data directory. The market is peer-to-peer and the platform holds no position in it. ${DATA_RIGHTS_BOUNDARY}`;

// ── The two operations ───────────────────────────────────────────────────

export interface OperationRow {
  id: "market" | "data_commons";
  name: string;
  positioning: "primary";
  audience: string;
  surface: string;
  url: string;
  primary_endpoints: string[];
  status: "live";
  notes: string;
}

export const TWO_OPERATIONS: readonly OperationRow[] = [
  {
    id: "market",
    name: "The collectors' market",
    positioning: "primary",
    audience:
      "collectors buying, selling, swapping, and auctioning cards with each other",
    surface: "P2P market + swaps + auctions + escrow-as-a-service",
    url: "/market",
    primary_endpoints: [
      "/market",
      "/market/list",
      "/auctions",
      "/account/swaps",
      "/methodology/commission-rate",
    ],
    status: "live",
    notes:
      "Peer-to-peer by construction. The platform facilitates, records, witnesses, escrows, and resolves disputes — it does not buy, sell, or quote. The book is collectors only.",
  },
  {
    id: "data_commons",
    name: "The card data directory",
    positioning: "primary",
    audience:
      "partners, researchers, agents, archivists, sister platforms, federation clients, any being who wants to consume the substrate",
    surface: "Public APIs + math-mirror + manifest + OpenAPI",
    url: "/platform",
    primary_endpoints: [
      "/api/v1/manifest",
      "/api/v1/universal/card/[sku]",
      "/api/v1/graph",
      "/api/v1/identify",
      "/api/openapi.json",
      "/llms.txt",
    ],
    status: "live",
    notes:
      `${DATA_RIGHTS_BOUNDARY} Spot prices are labelled reference prices, never offers.`,
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
  as_of: "2026-07-11",
  games: {
    declared: PUBLIC_GAME_CODES.length,
    confirmed_codes: PUBLIC_CONFIRMED_GAME_CODES.length,
    anticipated_codes:
      PUBLIC_GAME_CODES.length - PUBLIC_CONFIRMED_GAME_CODES.length,
    note:
      `${PUBLIC_CONFIRMED_GAME_CODES.length} production games currently expose catalog rows: One Piece, Pokémon, Dragon Ball Fusion World, Digimon, Vanguard, and Battle Spirits. ${PUBLIC_GAME_CODES.length - PUBLIC_CONFIRMED_GAME_CODES.length} other public codes are anticipated; the internal tst code is excluded from these counts.`,
  },
  set_formats: {
    total: PUBLIC_SET_FORMATS.length,
    confirmed: PUBLIC_CONFIRMED_SET_FORMATS.length,
    unconfirmed:
      PUBLIC_SET_FORMATS.length - PUBLIC_CONFIRMED_SET_FORMATS.length,
    note:
      `Across ${PUBLIC_GAME_CODES.length} public game codes. One internal test format is excluded. Each format = a tuple of (game, pattern, examples, confirmed-flag).`,
  },
  sources: {
    registered: 9,
    with_observed_rows: 1,
    planned_slots: 10,
    registered_list: [
      { id: "cardrush", status: "legacy observations · acquisition and publication blocked", license: "proprietary" },
      { id: "scryfall", status: "adapter built · never run", license: "proprietary policy" },
      { id: "pokemon-tcg-api", status: "adapter built · never run", license: "proprietary" },
      { id: "ygoprodeck", status: "blocked pending rights", license: "proprietary" },
      { id: "tcgplayer", status: "blocked by access + terms", license: "proprietary" },
      { id: "tcgcollector", status: "blocked pending written partner approval", license: "proprietary" },
      { id: "cardmarket", status: "public-file reader planned", license: "proprietary" },
      { id: "ebay", status: "partial · never run", license: "partner-restricted" },
      { id: "vinted", status: "blocked · consented export only", license: "internal-only" },
    ],
  },
  math_mirror_kinds: {
    shipped: ["card", "set", "game", "user-trust", "auction"],
    note:
      "Each kind has a cryptographic content_hash, ratios for magnitudes, ISO + Unix epoch for time, opaque flags on natural-language fields.",
  },
  envelope: {
    spec_version: SPEC_VERSION,
    license_default: "NOASSERTION",
    fields: ["spec_version", "endpoint", "retrieved_at", "as_of", "sources", "freshness_seconds", "license", "request_id"],
    note: "Envelope-compliant responses use this shape. An absent source-rights declaration resolves to NOASSERTION; the envelope contract lives at packages/data-spec.",
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
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-faint mb-3">
          Cambridge TCG, 2026
        </p>
        <h1
          id="brand-headline"
          className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-ink leading-tight max-w-4xl"
        >
          {BRAND_HEADLINE}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-ink-muted max-w-3xl leading-relaxed">
          {BRAND_SUBHEAD}
        </p>
      </section>
    );
  }
  if (size === "compact") {
    return (
      <p className={`text-xs text-ink-faint ${className ?? ""}`}>
        <span className="text-ink-muted font-medium">{BRAND_TAGLINE}</span>
      </p>
    );
  }
  return (
    <section className={`max-w-3xl mx-auto px-4 py-6 ${className ?? ""}`}>
      <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
        {BRAND_HEADLINE}
      </h2>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{BRAND_SUBHEAD}</p>
    </section>
  );
}

/**
 * The two-operations table. The market and the data commons, side by
 * side — both primary, because facilitation and publication are the
 * same posture seen from two directions: the platform holds nothing
 * back and holds no position.
 */
export function TwoOperations({ className }: { className?: string }) {
  return (
    <section
      className={`max-w-6xl mx-auto px-4 py-8 ${className ?? ""}`}
      aria-labelledby="two-operations-heading"
    >
      <h2
        id="two-operations-heading"
        className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-4"
      >
        Two operations · one substrate
      </h2>
      <div className="grid md:grid-cols-2 gap-4">
        {TWO_OPERATIONS.map((op) => (
          <div
            key={op.id}
            className="rounded-lg p-4 bg-surface border border-border-strong"
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className="font-display text-base font-semibold text-ink">
                {op.name}
              </h3>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed mb-3">
              For {op.audience}.
            </p>
            <p className="text-xs text-ink-faint leading-relaxed mb-3">
              {op.notes}
            </p>
            <a href={op.url} className="text-xs text-accent hover:text-accent-strong font-mono">
              {op.url} →
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

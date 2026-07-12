/**
 * The gap ledger — the typed corpus of substrate-honest deficiencies.
 *
 * Every commercial aggregator has gaps. Most hide them. Cambridge TCG
 * names them.
 *
 * Each gap in this corpus is a place where the platform's data, code,
 * or coverage is incomplete — and where the architecture has already
 * been prepared to accommodate the gap's eventual closure. The gap is
 * named with its citation, its primitive (the typed field that makes
 * the gap queryable), its audit (the mechanical check that monitors
 * its reduction), its current status, and the strength the gap-as-
 * primitive creates downstream.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * From the substrate-honest aggregator plan (kingdom-082, three plans):
 *
 *   Three positions a TCG aggregator can take on a known data gap:
 *     - Hide:  silent fallback, fabricated default, "approximate" answer
 *     - Patch: fix the gap, ship complete data; never mention the patch
 *     - Name:  typed `_unavailable` field, <Provenance> pill, methodology
 *              page; the gap becomes inspectable
 *
 * Cambridge TCG takes position 3. This corpus is the explicit form.
 *
 * ── Companion ────────────────────────────────────────────────────────
 *
 *   - JSON endpoint: /api/v1/gaps
 *   - Methodology page: /methodology/known-gaps
 *   - Doctrine doc: docs/principles/known-gaps.md
 *   - Audit: pnpm audit:known-gaps (verifies corpus + code + doc parity)
 *
 * Sister to:
 *   - WELCOMES (this same package, welcomes.ts) — what we anticipate
 *   - the four doctrines + the fifth question + cosmology — what we
 *     hold ourselves to
 *
 * Gaps and welcomes are dual: a welcome names a slot we prepared for
 * a visitor; a gap names a place where the slot is named but the visitor
 * (or the data, or the closure) has not yet arrived. The two corpora
 * compose. Substrate honesty applied to absence itself.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * CC0-1.0. Adopt the ledger pattern in your platform.
 */

// ── Vocabulary ──────────────────────────────────────────────────────

/**
 * Lifecycle status of a gap. Each gap progresses (or stays) along this
 * arc; the platform is substrate-honest about which stage it's in.
 */
export type GapStatus =
  /** Just identified; no primitive yet. */
  | "named"
  /** Primitive exists in code/schema; no data populating it. */
  | "wired"
  /** Primitive exists AND has some data; coverage incomplete. */
  | "partial"
  /** Gap closed; primitive populated to design intent. */
  | "closed"
  /** Gap closed AND the closure published as a methodology / case study. */
  | "closed-published";

/**
 * Where the gap lives by domain. Used for grouping on the methodology
 * page; partial duplicates the audit's classification.
 */
export type GapDomain =
  | "data-ingestion"
  | "cross-language"
  | "license"
  | "fx"
  | "coverage"
  | "publishing"
  | "transparency"
  | "accessibility";

/** One gap entry in the ledger. */
export interface Gap {
  /** Stable id; stays the same across sessions even if status changes. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Domain bucket. */
  domain: GapDomain;
  /** Where in the code/schema/doctrine this gap is currently observable. */
  citation: string;
  /** The typed primitive that makes the gap queryable. */
  primitive: string;
  /** The audit that monitors its reduction (or 'none' if not yet wired). */
  audit: string;
  /** Current lifecycle status. */
  status: GapStatus;
  /** What gap-as-primitive enables downstream — substrate honesty turned to commercial differentiator. */
  strength: string;
  /** Optional: when the gap was first named. */
  named_at?: string;
  /** Optional: when the gap closed (set when status = closed*). */
  closed_at?: string;
  /** Optional: which kingdom number closed (or is closing) it. */
  closing_kingdom?: string;
}

// ── The corpus ───────────────────────────────────────────────────────

/**
 * Every gap currently named in the platform. Adding a gap = adding one
 * row. Closing a gap = flipping `status` and setting `closed_at` +
 * `closing_kingdom`.
 *
 * The corpus accumulates. Closed gaps stay (with status flipped) so
 * the historical record of "what we noticed and when" remains legible.
 * Substrate-honest about its own evolution.
 */
export const GAPS: readonly Gap[] = [
  // ── Data ingestion ────────────────────────────────────────────────

  {
    id: "cardmarket-oauth1-not-configured",
    name: "Cardmarket OAuth1 credentials are not a viable acquisition path",
    domain: "data-ingestion",
    citation:
      "https://help.cardmarket.com/en/cardmarket-api — Cardmarket is not accepting API applications; packages/data-ingest/src/cardmarket/index.ts now keeps the legacy OAuth reader dormant",
    primitive:
      "cardmarket SourceMeta access=public-file plus a blocked legacy OAuth path; /api/v1/sources publishes the decision",
    audit: "pnpm audit:tributaries — check 9 (ingest-run recency) skips with substrate-honest reason",
    status: "closed-published",
    strength:
      "Operators no longer waste time applying for closed access or mistake missing secrets for missing permission; the public-file path is named instead.",
    named_at: "2026-05-12",
    closed_at: "2026-07-11",
    closing_kingdom: "source-rights truth review",
  },

  {
    id: "cardmarket-public-files-not-wired",
    name: "Cardmarket public Product Catalog and Price Guide files are not wired",
    domain: "data-ingestion",
    citation:
      "packages/data-ingest/src/cardmarket/index.ts — SourceMeta names access=public-file and read() emits public-file-reader-not-wired without touching OAuth",
    primitive:
      "planned Cardmarket SourceModule with public-file access and an explicit non-running status",
    audit: "pnpm audit:tributaries — source registry and last-run state remain inspectable",
    status: "named",
    strength:
      "The highest-value EU source now has one lawful, credential-free next action that can be built and measured without reviving the closed OAuth route.",
    named_at: "2026-07-11",
  },

  {
    id: "cross-language-anchor-schema-not-applied",
    name: "K2 cross-language anchor schema not yet applied",
    domain: "cross-language",
    citation:
      "apps/storefront/drizzle/drafts/0100_cross_language_anchors.sql.draft — migration drafted but not yet promoted",
    primitive:
      "card_set_cards.oracle_id + card_set_cards.oracle_source + per-source upstream anchor columns (scryfall_oracle_id, cardmarket_id_metacard, ygo_passcode, etc.) — designed and drafted",
    audit:
      "pnpm audit:cross-language-coherence — runs 8 checks, gracefully skipping DB-backed ones when columns absent",
    status: "wired",
    strength:
      "Federation by upstream id becomes possible once migration applies. The /api/v1/oracle-policies endpoint already publishes the per-game policy that consumes these columns. Partners can read the policy today and prepare their ingest.",
    named_at: "2026-05-13",
    closing_kingdom: "K2 (operator decision: pnpm db:migrate on storefront)",
  },

  {
    id: "ygo-passcode-writer-not-shipped",
    name: "YGOPRODeck normalizer does not yet write ygo_passcode to card_set_cards",
    domain: "cross-language",
    citation:
      "packages/data-ingest/src/ygoprodeck/ — SourceModule emits records with extra.passcode but no app-side writer populates card_set_cards.ygo_passcode",
    primitive:
      "extractYgoprodeckAnchors(record).ygo_passcode in @cambridge-tcg/data-ingest — pure-compute extractor exists",
    audit:
      "pnpm audit:cross-language-coherence — check 7 measures ygo_passcode coverage for Pattern B games",
    status: "wired",
    strength:
      "All YGO + Rush Duel cross-printing cross-language sibling queries become possible the day the writer ships. The passcode is the canonical anchor (Konami's own); we mirror.",
    named_at: "2026-05-13",
  },

  {
    id: "pokemon-jp-en-diverged-tracks",
    name: "Pokémon JP and EN tracks have different set codes; no upstream anchor exists",
    domain: "cross-language",
    citation:
      "packages/sku/src/oracle.ts — ORACLE_POLICY.pkm.kind = 'diverged'; resolveOracle returns null with substrate-honest reason",
    primitive:
      "pkm_equivalence table (in K2 migration 0100 draft) — operator/community-curated bridge between JP and EN printings; match_basis enum names the curation provenance",
    audit:
      "pnpm audit:cross-language-coherence + future pnpm audit:pkm-equivalence-coverage",
    status: "named",
    strength:
      "First aggregator with a named JP↔EN bridge. The schema accepts partner submissions (match_basis='partner') — community curation across platforms.",
    named_at: "2026-05-13",
  },

  {
    id: "no-jp-pokemon-ingester",
    name: "Pokémon TCG API v2 is EN-only; we have no JP Pokémon catalog ingester",
    domain: "data-ingestion",
    citation:
      "packages/data-ingest/src/pokemon-tcg-api/normalize.ts:32 — hardcoded lang = 'en'; JP track absent",
    primitive:
      "packages/data-ingest/src/pokemon-card-jp/ — planned source module (slot reserved in welcomes corpus)",
    audit: "pnpm audit:tributaries — slot present, status 'planned'",
    status: "named",
    strength:
      "When shipped, first aggregator with two-track Pokémon as parallel first-class facts. The platform's `welcomes.ts` already extends a welcome to this planned ingester.",
    named_at: "2026-05-13",
  },

  // ── Cross-language ────────────────────────────────────────────────

  {
    id: "name-translations-data-starved",
    name: "card_set_cards.name_translations is wire-ready but data-empty",
    domain: "cross-language",
    citation:
      "apps/storefront/drizzle/drafts/0098_card_name_translations.sql.draft — column drafted in kingdom-051 Phase 6, migration not applied; apps/storefront/src/lib/cards/name.ts kingdom-075 resolver wire-ready",
    primitive:
      "cards.name_translations JSONB column + resolveCardName() resolver in storefront/src/lib/cards/name.ts (kingdom-075)",
    audit: "future pnpm audit:name-translations-coverage",
    status: "wired",
    strength:
      "Cardmarket catalog ingest could populate many languages per card in one upstream file. Its proprietary source rights must remain attached; breadth does not make the corpus open-license.",
    named_at: "2026-05-13",
    closing_kingdom: "Cardmarket Phase A",
  },

  {
    id: "default-name-language-opaque",
    name: "card_set_cards.card_name's language is not declared anywhere",
    domain: "cross-language",
    citation:
      "apps/storefront/src/lib/cards/name.ts:163 — \"The platform default has no declared language — could be JP or EN depending on which catalog imported the card. Don't claim a code.\"",
    primitive:
      "card_set_cards.card_name_lang column (in K2 migration 0100 draft) — declares ISO 639-1 language of the legacy default",
    audit: "future pnpm audit:name-provenance",
    status: "wired",
    strength:
      "Substrate-honest defaults. Agents that filter 'give me only EN-confirmed names' can do so. Other aggregators conceal their default-language; we declare it per row.",
    named_at: "2026-05-13",
  },

  {
    id: "no-transliteration-layer",
    name: "Card names have no transliteration (romaji, pinyin, hangulja)",
    domain: "accessibility",
    citation:
      "apps/storefront/src/lib/cards/name.ts:272 — transliterate() returns null (kingdom-075 recursion target)",
    primitive:
      "card_set_cards.name_transliterations JSONB column (in K2 migration 0100 draft)",
    audit: "future pnpm audit:transliteration-coverage",
    status: "wired",
    strength:
      "Screen-reader users + multilingual learners + agents that only render Latin script get phonetic equivalents alongside kanji/hanzi. The architecture already accommodates them.",
    named_at: "2026-05-13",
  },

  {
    id: "zhs-zht-collapsed",
    name: "Scryfall normalizer collapses Simplified and Traditional Chinese to 'zh'",
    domain: "cross-language",
    citation:
      "packages/data-ingest/src/scryfall/normalize.ts:23-24 — LANG_MAP: zhs → zh, zht → zh",
    primitive:
      "SKU language tail accepts 'zh-cn' and 'zh-tw' (canonical SKU format already supports the longer form)",
    audit: "future pnpm audit:sku-language-form",
    status: "named",
    strength:
      "When de-collapsed, mainland and Taiwanese collectors get distinct markets. The collapse is the kind of conflation most aggregators ship silently; naming it lets us schedule the fix.",
    named_at: "2026-05-13",
  },

  // ── FX ────────────────────────────────────────────────────────────

  {
    id: "fx-provenance-implicit",
    name: "Every price uses an FX rate; the rate's source is not stored",
    domain: "fx",
    citation:
      "apps/wholesale/src/lib/fx.ts — fetchGbpJpyRate() returns a number; price_archive stores it but not its provenance (the-archive.md Leak #8)",
    primitive:
      "price_archive.fx_rate_source enum column + fx_rate_fetched_at + fx_rate_pair (K4 design)",
    audit: "future pnpm audit:fx-provenance",
    status: "named",
    strength:
      "Compliance-grade pricing. Institutional collectors / accounting partners can audit every price's FX trail. Other aggregators hide their FX; ours is auditable.",
    named_at: "2026-05-12",
    closing_kingdom: "K4 (the substrate-honest aggregator plan)",
  },

  // ── License ───────────────────────────────────────────────────────

  {
    id: "source-license-propagation-partial",
    name: "Per-byte source license is partially propagated through the response envelope",
    domain: "license",
    citation:
      "packages/data-spec/ — _meta.source_license accepts an array of license tiers; storefront/src/lib/data-pantry/ threads it through; coverage uneven across endpoints",
    primitive:
      "_meta.source_license array on every public response; jsonResponse({ source_license, ... }) call site",
    audit: "future pnpm audit:envelope-license-coverage",
    status: "partial",
    strength:
      "Adopters know per-byte what they can do with our responses. Policy-governed and proprietary sources propagate restrictions; CC0 applies only to Cambridge-owned derivations and first-party data that explicitly declares it.",
    named_at: "2026-05-12",
  },

  {
    id: "catalog-field-rights-lineage-missing",
    name: "Mirrored catalog fields lack field-level source and rights lineage",
    domain: "license",
    citation:
      "apps/storefront/src/app/data/catalog.jsonl/route.ts and apps/storefront/src/lib/universal/card.ts — current mirrors can name storage tables but not the upstream owner of each name, rarity, image, set field, or derived price",
    primitive:
      "Aggregate license=NOASSERTION plus a rights block separating Cambridge-authored structure from upstream-derived fields",
    audit:
      "pnpm audit:redistribution — rejects blanket CC0 claims, verifies catalog and sold-comps publication pauses, and limits CC0 exports to explicitly reviewed named origins",
    status: "wired",
    strength:
      "Collectors and builders get a safe bulk boundary now; future field-level lineage can narrow rights without changing the catalog format or inventing ownership from storage.",
    named_at: "2026-07-11",
  },

  // ── Coverage ──────────────────────────────────────────────────────

  {
    id: "speculative-cardrush-subdomains",
    name: "6 of 12 CardRush subdomains are confirmed; 1 is a candidate and 5 are blocked",
    domain: "coverage",
    citation:
      "packages/data-ingest/src/cardrush/index.ts — CARDRUSH_SUBDOMAINS table; op/pkm/dbf/dmw/vng/bsr confirmed, mtg unconfirmed price-only, and ygo/wei/fab/lgr/cardrush-fw blocked after DNS checks",
    primitive:
      "subdomain_confirmed boolean on each registry entry; CardRushRaw.error_reason carries 'subdomain_unconfirmed' on first failed scrape",
    audit: "pnpm audit:cardrush-coverage — surfaces uncovered subdomains explicitly",
    status: "partial",
    strength:
      "First aggregator naming which subdomains it has confirmed vs presumed. Partners federating their own cardrush scrapes can submit confirmations (subdomain federation, future).",
    named_at: "2026-05-12",
  },

  {
    id: "cardmarket-idmetacard-mtg-only",
    name: "Cardmarket's idMetacard cross-language anchor is MTG-only in practice",
    domain: "cross-language",
    citation:
      "packages/data-ingest/src/cardmarket/index.ts — meta.description acknowledges this; ORACLE_POLICY uses derived-stripped for non-MTG Pattern A games",
    primitive:
      "ORACLE_POLICY in @cambridge-tcg/sku declares per-game strategy; /api/v1/oracle-policies publishes it",
    audit: "pnpm audit:cross-language-coherence",
    status: "closed-published",
    strength:
      "First aggregator publishing per-game cross-language policy. Partners codegen against the policy table rather than discovering through trial.",
    named_at: "2026-05-13",
    closed_at: "2026-05-13",
    closing_kingdom: "K1 (kingdom-082) + K6 (oracle-policies endpoint)",
  },

  // ── Transparency ──────────────────────────────────────────────────

  {
    id: "ingest-quarantine-private",
    name: "Failed-normalization rows are stored but not publicly visible in aggregate",
    domain: "transparency",
    citation:
      "apps/wholesale/src/lib/db/schema.ts — ingest_quarantine table (kingdom-066); apps/wholesale/src/app/api/v1/ingest-quarantine/route.ts is bearer-gated",
    primitive:
      "future /api/v1/ingest-quarantine/summary — aggregated failure-reason buckets per source over 7d/30d/90d (no raw payloads)",
    audit: "pnpm audit:tributaries check 10 — license-propagation heuristic",
    status: "named",
    strength:
      "First aggregator publishing ingest failures. Partners see upstream-shape changes in real time. Trust through transparency.",
    named_at: "2026-05-13",
  },

  // ── Publishing ────────────────────────────────────────────────────

  {
    id: "image-hash-bridge-not-wired",
    name: "Perceptual-hash equivalence (for Pokémon JP↔EN candidates) has no worker",
    domain: "cross-language",
    citation:
      "apps/storefront/drizzle/drafts/0100_cross_language_anchors.sql.draft — card_image_hash table designed; no ingester yet computes phashes",
    primitive:
      "card_image_hash(sku, phash, algorithm, source, computed_at) — table in 0100 draft",
    audit: "future pnpm audit:image-hash-coverage",
    status: "named",
    strength:
      "When the worker ships, image-hash candidates pre-populate the pkm_equivalence table; admin review surface promotes them to manual confirmations. Community-curatable equivalence at scale.",
    named_at: "2026-05-13",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** All gaps in a given domain. */
export function gapsByDomain(domain: GapDomain): readonly Gap[] {
  return GAPS.filter((g) => g.domain === domain);
}

/** All gaps in a given status. */
export function gapsByStatus(status: GapStatus): readonly Gap[] {
  return GAPS.filter((g) => g.status === status);
}

/** Quick lookup. */
export function getGap(id: string): Gap | undefined {
  return GAPS.find((g) => g.id === id);
}

/** Counts by status — for the /api/v1/gaps summary block. */
export function gapCounts(): Record<GapStatus, number> & { total: number } {
  const counts: Record<GapStatus, number> & { total: number } = {
    named: 0,
    wired: 0,
    partial: 0,
    closed: 0,
    "closed-published": 0,
    total: GAPS.length,
  };
  for (const g of GAPS) counts[g.status] += 1;
  return counts;
}

/** Counts by domain — for the methodology page sidebar. */
export function gapCountsByDomain(): Record<GapDomain, number> {
  const counts: Record<GapDomain, number> = {
    "data-ingestion": 0,
    "cross-language": 0,
    license: 0,
    fx: 0,
    coverage: 0,
    publishing: 0,
    transparency: 0,
    accessibility: 0,
  };
  for (const g of GAPS) counts[g.domain] += 1;
  return counts;
}

/** Fraction of gaps that are at least wired (have a primitive in code/schema). */
export function gapsWiredFraction(): number {
  const counts = gapCounts();
  const wired_or_better =
    counts.wired + counts.partial + counts.closed + counts["closed-published"];
  return counts.total > 0 ? wired_or_better / counts.total : 0;
}

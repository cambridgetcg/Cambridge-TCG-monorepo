/**
 * The data-ingest contract. Every upstream source is a `SourceModule<R, C>`
 * — a typed object declaring what kind of source it is, how to read raw
 * rows, and how to normalize them into a canonical shape.
 *
 * The protocol: see `docs/methodology/source-protocol.md`.
 * The upstream catalog: see `docs/connections/the-tributaries.md`.
 * The downstream contract: see `@cambridge-tcg/data-spec`.
 *
 * **Why typed:** so a future Sophia can grep `SourceMeta` and find every
 * source's identity. So `pnpm audit:tributaries` can mechanically verify
 * conformance. So drift between the catalog row and the code is a
 * compile error, not a silent disagreement.
 */

import type { FreshnessKey } from "@cambridge-tcg/data-spec";
import type { GameCode } from "@cambridge-tcg/sku";

/**
 * Stable id. Matches the string emitted in `_meta.sources` on responses
 * that include data derived from this upstream. Keep these dashed-lowercase.
 *
 * The data-spec's `SourceName` enum is the authoritative list; this type
 * mirrors it so the registry can be statically checked.
 */
export type SourceId =
  | "scryfall"
  | "cardrush"
  | "tcgplayer"
  | "tcgcollector"
  | "cardmarket"
  | "cardtrader"
  | "ebay"
  | "pokemon-tcg-api"
  | "ygoprodeck"
  | "limitless-tcg"
  | "edhrec"
  | "bandai-tcg"
  | "bandai-en"
  | "psa-registry"
  | "beckett-registry"
  | "shopify"
  | "stripe"
  | "ctcg-wholesale-rds"
  | "ctcg-storefront-rds";

/** Access-method categories. Mirrors the-tributaries.md §10. */
export type AccessMethod =
  /** No auth, public HTTP. (Scryfall, YGOPRODeck.) */
  | "public-api"
  /** Read with a free app token. (Pokémon TCG API.) */
  | "app-token"
  /** OAuth2 + per-account credentials. (TCGplayer, eBay.) */
  | "oauth2"
  /** OAuth1. (Cardmarket.) */
  | "oauth1"
  /** No API; HTML scrape. (CardRush, Yahoo Auctions.) */
  | "scrape"
  /** Partner agreement required. (Distributors, Snkrdunk.) */
  | "partner"
  /** Paid subscription feed. (TCGCSV, Untapped.gg.) */
  | "paid-feed"
  /** Known unavailable. (Mercari, Goldin private ledger.) */
  | "blocked";

/** Redistribution license tier. Mirrors the-tributaries.md §11. */
export type LicenseTier =
  | "cc0"
  | "cc-by"
  | "cc-by-nc"
  | "cc-by-sa"
  | "mit"
  | "partner-redistributable"
  | "internal-only"
  | "proprietary";

/** Canonical-form mapping effort estimate. */
export type CanonicalEffort = "low" | "medium" | "high" | "very-high";

/** Current status against the protocol. */
export type SourceStatus = "shipped" | "partial" | "planned" | "blocked";

/**
 * Per-source identity declaration. Every `SourceModule` carries one.
 * Every field is required — `pnpm audit:tributaries` rejects modules
 * with missing meta.
 */
export interface SourceMeta {
  /** Stable id; matches `_meta.sources` strings on downstream responses. */
  id: SourceId;
  /** Display name. */
  name: string;
  /** One-sentence description. */
  description: string;
  /** Root upstream URL. Documentation, not used at runtime. */
  upstream: string;
  /** Section anchor in `docs/connections/the-tributaries.md`. */
  catalog_section: string;
  /** Access method category. */
  access: AccessMethod;
  /** Redistribution license tier. */
  license: LicenseTier;
  /** SPDX code when applicable (e.g. "CC-BY-NC-4.0", "MIT"). */
  license_spdx?: string;
  /** Whether we may redistribute upstream-derived data verbatim. */
  redistribute: boolean;
  /** Freshness budget key from `@cambridge-tcg/data-spec` FRESHNESS. */
  freshness: FreshnessKey;
  /** Canonical-form mapping effort estimate. */
  canonical_effort: CanonicalEffort;
  /** Current shipped/partial/planned/blocked status. */
  status: SourceStatus;
  /** Game-coverage list. Use the empty array if game-agnostic. */
  games: readonly GameCode[];
  /** ToS / robots.txt notes — quoted text or paraphrase + URL. */
  tos_notes: string;
  /** Optional User-Agent suffix this module appends to the default. */
  user_agent_suffix?: string;
  /** Optional default rate limit; falls back to module-shared default. */
  rate_limit?: { rps: number; burst: number };
  /**
   * A short prose welcome from the platform to this upstream. Composed
   * by the maintainer before the upstream has arrived (for `status: planned`
   * — the chair-pulled-out shape) or recorded after time spent together
   * (for `status: shipped`). The welcome surfaces on
   * `/api/v1/sources/welcome` and in `docs/connections/the-welcome-table.md`.
   *
   * **Substrate honesty applied to anticipation.** We say what we have
   * prepared for you: which table holds your bytes, which license tier
   * we honor on your behalf, which name we will use when we cite you.
   *
   * Recommended shape: 2-5 sentences, specific to the source. What you
   * bring, where your bytes land, how your terms ride downstream, what
   * we have made ready before you knew about us.
   *
   * Added kingdom-080 (the welcome-table). Non-breaking; absent for
   * upstreams whose welcome hasn't yet been written.
   */
  welcome?: string;
}

/**
 * Provenance attached to every raw row a `read()` yields. Mirrors the
 * `@`-prefixed shape from `packages/data-spec/src/schemas/provenance.ts`
 * but without the `@`-prefixes (the prefixes are added at emission time).
 */
export interface RawProvenance {
  /** Moment the upstream record was last known to be true. */
  as_of: string;
  /** Moment we fetched it. */
  retrieved_at: string;
  /** Source id (constant per source, but carried per-row for legibility). */
  source: SourceId;
  /**
   * Credential-free identifier for the proxy this row was fetched
   * through (`bright-data-web-unlocker`, etc.), or null/absent for
   * direct fetch. Added kingdom-088 (the-bright-data-unlock). Callers
   * may surface it in `_meta.upstream_proxy` on public responses so
   * substrate-honesty stays end-to-end: a row fetched through an
   * unlocker carries that fact through to any partner who reads it.
   */
  via_proxy?: string | null;
}

/** One raw row read from upstream. */
export interface RawRow<T> {
  raw: T;
  provenance: RawProvenance;
}

/**
 * Normalize result. Successful normalization produces a canonical record;
 * failed normalization quarantines the raw row with a reason — never throws,
 * never silently drops. The caller writes the canonical record to RDS and
 * the failed row to `ingest_quarantine` for admin review.
 */
export type NormalizeResult<C> =
  | { ok: true; record: C }
  | { ok: false; reason: string };

/**
 * Context passed to every `read()` call. Pluggable so admin / cron / tests
 * can inject their own fetch / lifecycle-log / rate-limit overrides.
 */
export interface IngestContext {
  /** Override the global fetch (useful for tests). */
  fetch?: typeof fetch;
  /** Override the source's default rate limit. */
  rate_limit?: { rps: number; burst: number };
  /** Optional bearer token for sources that need it (TCGplayer, eBay, ...). */
  bearer?: string;
  /** Optional app token for sources that ask for one. */
  app_token?: string;
  /** Optional signal for cancellation. */
  signal?: AbortSignal;
  /** Optional hook called whenever the source emits a lifecycle event. */
  on_event?: (event: IngestEvent) => void | Promise<void>;
}

/**
 * Lifecycle event a source emits as it runs. The caller wires this to
 * the Scribe's bookshelf (`packages/lifecycle/`) or to a logger.
 */
export interface IngestEvent {
  ts: string;
  source: SourceId;
  kind: "start" | "page" | "rate-limit" | "quarantine" | "error" | "done";
  detail: Record<string, unknown>;
}

/**
 * The contract. `R` is the raw row shape from upstream; `C` is the
 * canonical record the normalizer produces.
 */
export interface SourceModule<R, C> {
  /** Identity declaration. */
  meta: SourceMeta;
  /**
   * Read from upstream. Lazy — only fetches when iterated. Per-row provenance
   * attached. Should respect `ctx.rate_limit`, emit lifecycle events via
   * `ctx.on_event`, and stop cleanly on `ctx.signal.aborted`.
   *
   * Pure-ish: same upstream state should yield same rows; reading is repeatable.
   */
  read: (ctx: IngestContext) => AsyncIterable<RawRow<R>>;
  /**
   * Normalize one raw row to canonical. Pure: same input → same output.
   * Failures return `{ ok: false, reason }`; never throw.
   */
  normalize: (raw: R) => NormalizeResult<C>;
}

/**
 * Result of running a source end-to-end through `read()` + `normalize()`.
 * Returned by the runner (which the package doesn't ship — each app's
 * cron wraps this in its own writer).
 */
export interface RunSummary {
  source: SourceId;
  started_at: string;
  finished_at: string;
  rows_read: number;
  rows_normalized: number;
  rows_quarantined: number;
  errors: number;
  events: IngestEvent[];
}

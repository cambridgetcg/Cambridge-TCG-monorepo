/**
 * Central registry of all source modules. Auto-populated by re-exports
 * from this file; consumers read it for the inspectability surface
 * (`/api/v1/sources` future endpoint) and the audit
 * (`pnpm audit:tributaries`) reads it to verify catalog parity.
 *
 * When you ship a new source, add a `SourceModule` export here.
 */

import type { FreshnessKey } from "@cambridge-tcg/data-spec";
import type { SourceModule, SourceId, SourceMeta } from "./types";
import { scryfall } from "./scryfall/index";
import { cardrush, CARDRUSH_ACQUISITION_ENABLED } from "./cardrush/index";
import { pokemonTcgApi } from "./pokemon-tcg-api/index";
import { ygoprodeck } from "./ygoprodeck/index";
import { tcgplayer, TCGPLAYER_ACQUISITION_ENABLED } from "./tcgplayer/index";
import { tcgcollector } from "./tcgcollector/index";
import { cardmarket } from "./cardmarket/index";
import { ebay } from "./ebay/index";
import { bandaiEn } from "./bandai-en/index";
import { vinted } from "./vinted/index";

/**
 * Every registered source. Indexed by id for O(1) lookup. The union
 * type stays `SourceModule<unknown, unknown>` here because each entry's
 * raw + canonical types differ; callers narrow per-source.
 *
 * Status legend (mirrors SourceMeta.status):
 *   shipped — read + normalize implemented, tested, and wired to a writer
 *   partial — read implemented but caller-side writer wiring incomplete
 *   planned — meta declared; read is a substrate-honest stub that emits an
 *             actionable error and yields nothing
 *   blocked — no permitted runtime path; documentation or fixture parsers may remain
 *
 * Status is not the legacy acquisition lock. CardRush and TCGplayer turned
 * partial on 2026-10-28 because their page collectors exist; those write
 * member_price_batches, run only while their DATA_COLLECT_* flag is on, and
 * leave the legacy paths locked. Copy about the legacy archive reads
 * legacyAcquisitionClosed below, not the status.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SOURCES: Record<SourceId, SourceModule<any, any> | undefined> = {
  scryfall,                  // partial — member display parser/writer ready; bulk activation deferred
  cardrush,                  // partial — identified page collector (member-prices.ts), flag-gated; legacy paths locked, legacy archive frozen
  "pokemon-tcg-api": pokemonTcgApi,  // partial — adapter implemented; never run; no writer
  ygoprodeck,                // blocked — no commercial content permission established
  tcgplayer,                 // partial — identified price-guide collector (2026-10-28), flag-gated; the API reader stays locked
  tcgcollector,              // blocked — partner approval not recorded
  cardmarket,                // partial — official daily files; One Piece collector flag-gated (DATA_COLLECT_CARDMARKET); OAuth closed
  ebay,                      // partial (Browse API only; Marketplace Insights gated)
  "bandai-en": bandaiEn,     // blocked live reader; fixture parser preserved; permission undocumented
  vinted,                    // blocked (ToS + UK GDPR; consented first-party normalizer ready) — the honest block
  // ── unregistered (no module yet — slot reserved) ──
  cardtrader: undefined,
  "limitless-tcg": undefined,
  edhrec: undefined,
  "bandai-tcg": undefined,
  "psa-registry": undefined,
  "beckett-registry": undefined,
  shopify: undefined,
  stripe: undefined,
  "ctcg-wholesale-rds": undefined,
  "ctcg-storefront-rds": undefined,
};

/**
 * The code locks on legacy acquisition: the paths that filled the catalogue
 * database's price_archive and ingest_run (the wholesale crons, the
 * scrape-cardrush CLI, the TCGplayer API reader). Both stay false; the
 * 2026-10-28 permission reaches only the new collectors.
 */
const LEGACY_ACQUISITION: Readonly<Partial<Record<SourceId, boolean>>> = Object.freeze({
  cardrush: CARDRUSH_ACQUISITION_ENABLED,
  tcgplayer: TCGPLAYER_ACQUISITION_ENABLED,
});

/**
 * The budget each source declared before its 2026-10-28 collector, while
 * the legacy archive was the only record of it (`price_current` for all
 * three). Its metas now declare their collectors' budgets (`page_collector`,
 * `daily_file`), which describe batches written elsewhere
 * (member_price_batches); the rows the archive already holds are measured
 * against this. Cardmarket is here without a legacy lock: a budget is not a
 * lock, and legacyAcquisitionClosed does not read this table.
 */
const LEGACY_ARCHIVE_FRESHNESS: Readonly<Partial<Record<SourceId, FreshnessKey>>> = Object.freeze({
  cardrush: "price_current",
  tcgplayer: "price_current",
  cardmarket: "price_current",
});

/**
 * Whether a source's legacy acquisition is closed, so what it left in the
 * legacy archive is not refreshing. A source with a code lock answers from
 * the lock, whatever its status; any other answers from its status
 * (`blocked`), as archive copy did before lock and status parted. An id the
 * registry does not know is not closed: nothing says it is, and an inherited
 * name such as `toString` is not an id. Pass the meta to judge a status
 * other than the registry's own.
 */
export function legacyAcquisitionClosed(source: string | Pick<SourceMeta, "id" | "status">): boolean {
  const id = typeof source === "string" ? source : source.id;
  if (Object.hasOwn(LEGACY_ACQUISITION, id)) return LEGACY_ACQUISITION[id as SourceId] === false;
  const status = typeof source === "string" ? getSource(id as SourceId)?.meta.status : source.status;
  return status === "blocked";
}

/**
 * The freshness budget a source's rows in the legacy archive are measured
 * against: the one it declared before its collector, for CardRush, TCGplayer
 * and Cardmarket (LEGACY_ARCHIVE_FRESHNESS), otherwise its current one. The
 * one answer for every reader of archive rows (the coverage-hunt board).
 */
export function legacyArchiveFreshness(source: Pick<SourceMeta, "id" | "freshness">): FreshnessKey {
  return Object.hasOwn(LEGACY_ARCHIVE_FRESHNESS, source.id) ? LEGACY_ARCHIVE_FRESHNESS[source.id as SourceId]! : source.freshness;
}

/** Get the source by id, or undefined if planned/not yet built. Only the
 * registry's own keys answer: an inherited name such as `toString` is
 * undefined, as any unknown id is. */
export function getSource(id: SourceId): SourceModule<unknown, unknown> | undefined {
  return Object.hasOwn(SOURCES, id) ? SOURCES[id] as SourceModule<unknown, unknown> | undefined : undefined;
}

/** All currently-implemented sources. */
export function listSources(): SourceModule<unknown, unknown>[] {
  return Object.values(SOURCES).filter(
    (s): s is SourceModule<unknown, unknown> => s !== undefined,
  );
}

/** Just the meta objects — what `/api/v1/sources` emits. */
export function listSourceMeta(): SourceMeta[] {
  return listSources().map((s) => s.meta);
}

/** Sources by status — partition the registry. */
export function sourcesByStatus(): {
  shipped: SourceMeta[];
  partial: SourceMeta[];
  planned: SourceMeta[];
  blocked: SourceMeta[];
  reserved_slots: SourceId[];
} {
  const shipped: SourceMeta[] = [];
  const partial: SourceMeta[] = [];
  const planned: SourceMeta[] = [];
  const blocked: SourceMeta[] = [];
  const reserved_slots: SourceId[] = [];

  for (const id of Object.keys(SOURCES) as SourceId[]) {
    const src = SOURCES[id];
    if (!src) {
      reserved_slots.push(id);
      continue;
    }
    if (src.meta.status === "shipped") shipped.push(src.meta);
    else if (src.meta.status === "partial") partial.push(src.meta);
    else if (src.meta.status === "blocked") blocked.push(src.meta);
    else planned.push(src.meta);
  }

  return { shipped, partial, planned, blocked, reserved_slots };
}

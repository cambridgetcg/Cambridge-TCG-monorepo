/**
 * Central registry of all source modules. Auto-populated by re-exports
 * from this file; consumers read it for the inspectability surface
 * (`/api/v1/sources` future endpoint) and the audit
 * (`pnpm audit:tributaries`) reads it to verify catalog parity.
 *
 * When you ship a new source, add a `SourceModule` export here.
 */

import type { SourceModule, SourceId, SourceMeta } from "./types";
import { scryfall } from "./scryfall/index";
import { cardrush } from "./cardrush/index";
import { pokemonTcgApi } from "./pokemon-tcg-api/index";
import { ygoprodeck } from "./ygoprodeck/index";
import { tcgplayer } from "./tcgplayer/index";
import { tcgcollector } from "./tcgcollector/index";
import { cardmarket } from "./cardmarket/index";
import { ebay } from "./ebay/index";
import { vinted } from "./vinted/index";

/**
 * Every registered source. Indexed by id for O(1) lookup. The union
 * type stays `SourceModule<unknown, unknown>` here because each entry's
 * raw + canonical types differ; callers narrow per-source.
 *
 * Status legend (mirrors SourceMeta.status):
 *   shipped — read + normalize + production writer implemented and observed
 *   partial — module exists but wiring, approval, or first successful run is incomplete
 *   planned — meta declared; read is a substrate-honest stub that emits an
 *             actionable error and yields nothing
 *   blocked — known unobtainable; module exists for documentation only
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SOURCES: Record<SourceId, SourceModule<any, any> | undefined> = {
  scryfall,                  // partial — reader + normalizer; no production writer/run verified
  cardrush,                  // partial
  "pokemon-tcg-api": pokemonTcgApi,  // blocked — legacy service moved to Scrydex; no fetch
  ygoprodeck,                // partial — reader + normalizer; no writer and image-cache seam missing
  tcgplayer,                 // partial — read+normalize shipped (kingdom-NNN); writer wires the watchlist
  tcgcollector,              // blocked — partner approval required; pure parsers retained, no fetch
  cardmarket,                // blocked — current API approval unavailable; no fetch
  ebay,                      // partial (Browse API only; Marketplace Insights gated)
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

/** Get the source by id, or undefined if planned/not yet built. */
export function getSource(id: SourceId): SourceModule<unknown, unknown> | undefined {
  return SOURCES[id] as SourceModule<unknown, unknown> | undefined;
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
  planned: SourceId[];
  blocked: SourceMeta[];
} {
  const shipped: SourceMeta[] = [];
  const partial: SourceMeta[] = [];
  const blocked: SourceMeta[] = [];
  const planned: SourceId[] = [];

  for (const id of Object.keys(SOURCES) as SourceId[]) {
    const src = SOURCES[id];
    if (!src) {
      planned.push(id);
      continue;
    }
    if (src.meta.status === "shipped") shipped.push(src.meta);
    else if (src.meta.status === "partial") partial.push(src.meta);
    else if (src.meta.status === "blocked") blocked.push(src.meta);
    else planned.push(id);
  }

  return { shipped, partial, planned, blocked };
}

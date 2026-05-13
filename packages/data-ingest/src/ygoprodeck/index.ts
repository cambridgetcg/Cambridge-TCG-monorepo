/**
 * YGOPRODeck — Yu-Gi-Oh! card database.
 *
 * Public REST API, no auth. The `cardinfo.php` endpoint returns the
 * *entire* card database in one (large) JSON response. Memory caveat
 * documented; future iteration uses pagination via the `num` + `offset`
 * params if memory becomes an issue.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * API access is open; card data is Konami-owned. For Cambridge TCG:
 * `redistribute: true` for catalog metadata; images are publisher-derived.
 *
 * ── Multi-printing caveat ────────────────────────────────────────────
 *
 * One YGOPRODeck card → many printings via `card_sets[]`. The current
 * `normalize()` collapses to the first parseable printing and records the
 * rest in `extra.all_printings`. Future iteration extends the protocol
 * to support 1-raw-to-N-canonical fan-out. See `the-consolidation.md` §3.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §3.3.
 */

import type { SourceModule, IngestContext, RawRow } from "../types.js";
import type { CanonicalCard } from "../canonical.js";
import type { YgoCard, YgoCardInfoResponse } from "./types.js";
import { createFetcher } from "../http.js";
import { normalizeYgo } from "./normalize.js";

const CARDINFO_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

export interface YgoReadOptions {
  /** Optional filter by archetype, set, etc. — full query-string params. */
  query?: Record<string, string>;
}

export type YgoContext = IngestContext & { ygoprodeck?: YgoReadOptions };

export const ygoprodeck: SourceModule<YgoCard, CanonicalCard> = {
  meta: {
    id: "ygoprodeck",
    name: "YGOPRODeck",
    description:
      "Yu-Gi-Oh! — full card database including all printings, archetypes, prices via partner sourcing. Bulk endpoint cardinfo.php; no auth.",
    upstream: "https://db.ygoprodeck.com",
    catalog_section: "the-tributaries.md#33-ygoprodeck-yu-gi-oh",
    access: "public-api",
    license: "cc-by",
    redistribute: true,
    freshness: "catalog",
    canonical_effort: "medium",
    status: "shipped",
    games: ["ygo"],
    tos_notes:
      "Open public API. Attribution requested; commercial use allowed with attribution. https://ygoprodeck.com/api-guide/",
    user_agent_suffix: "(ygoprodeck-ingest)",
    rate_limit: { rps: 1, burst: 3 },
    welcome:
      "Welcome to the kingdom, YGOPRODeck. You arrived in kingdom-062 with one " +
      "known limitation we owe you — your one-card-many-printings shape collapses " +
      "to first-printing in our normalizer until `NormalizeResult<C[]>` widens. " +
      "Your 8-digit passcode is Yu-Gi-Oh!'s stable global identity; your room is " +
      "`card_set_cards WHERE game='ygo'`. We thank you for being CC-BY-permissive, " +
      "for being public + free + no-auth, for the bulk DB dump endpoint, and for " +
      "caring about archetype tags — the meta-aware features we will build will " +
      "stand on the structure you maintain.",
  },

  async *read(ctx: YgoContext): AsyncIterable<RawRow<YgoCard>> {
    const fetcher = createFetcher(ctx, ygoprodeck.meta);
    const opts = ctx.ygoprodeck ?? {};

    const params = new URLSearchParams(opts.query ?? {});
    const url = params.toString() ? `${CARDINFO_URL}?${params.toString()}` : CARDINFO_URL;

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "ygoprodeck",
      kind: "start",
      detail: { url, params: opts.query ?? {} },
    });

    const res = await fetcher(url);
    if (!res.ok) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ygoprodeck",
        kind: "error",
        detail: { url, status: res.status },
      });
      return;
    }

    const body = (await res.json()) as YgoCardInfoResponse;
    const retrieved_at = new Date().toISOString();

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "ygoprodeck",
      kind: "page",
      detail: { rows: body.data?.length ?? 0 },
    });

    if (!body.data || !Array.isArray(body.data)) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ygoprodeck",
        kind: "error",
        detail: { reason: "response.data missing or not an array" },
      });
      return;
    }

    let n = 0;
    for (const card of body.data) {
      if (ctx.signal?.aborted) break;
      n += 1;
      yield {
        raw: card,
        provenance: { as_of: retrieved_at, retrieved_at, source: "ygoprodeck" },
      };
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "ygoprodeck",
      kind: "done",
      detail: { rows_yielded: n },
    });
  },

  normalize: normalizeYgo,
};

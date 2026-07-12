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
 * API access is public, but no CC-BY or commercial data license is stated.
 * The guide identifies card text/images as Konami/4K Media material and the
 * wider site terms are non-commercial. Cambridge keeps this reader blocked
 * pending written permission; public access is not a license.
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

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { YgoCard, YgoCardInfoResponse } from "./types";
import { createFetcher } from "../http";
import { normalizeYgo } from "./normalize";

const CARDINFO_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const YGOPRODECK_ACQUISITION_ENABLED = false;

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
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "medium",
    status: "blocked",
    games: ["ygo"],
    tos_notes:
      "The API guide permits public consumption, asks clients to download/cache data, limits traffic to 20 requests/second, and forbids continual image hotlinking. It states no CC-BY or commercial data license; card text/images are identified as Konami/4K Media copyright. Cambridge requires written commercial permission before running this source. https://api.ygoprodeck.com/api-guide/",
    user_agent_suffix: "(ygoprodeck-ingest)",
    rate_limit: { rps: 1, burst: 3 },
    welcome:
      "Welcome to the kingdom, YGOPRODeck. Your adapter arrived in kingdom-062 with one " +
      "known limitation we owe you — your one-card-many-printings shape collapses " +
      "to first-printing in our normalizer until `NormalizeResult<C[]>` widens. " +
      "Your 8-digit passcode is Yu-Gi-Oh!'s stable global identity; your room is " +
      "`card_set_cards WHERE game='ygo'`. We thank you for documenting caching and " +
      "rate limits. The adapter remains closed until written commercial permission " +
      "makes the rights boundary clear; the wider doorway is ours to build honestly.",
  },

  async *read(ctx: YgoContext): AsyncIterable<RawRow<YgoCard>> {
    if (!YGOPRODECK_ACQUISITION_ENABLED || ygoprodeck.meta.status === "blocked") {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ygoprodeck",
        kind: "error",
        detail: {
          status: "blocked-rights-review",
          reason:
            "Public API access does not establish commercial reuse rights for Konami/4K Media card content.",
          next_action:
            "Obtain written permission covering Cambridge TCG's commercial catalog use before enabling this reader.",
        },
      });
      return;
    }

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

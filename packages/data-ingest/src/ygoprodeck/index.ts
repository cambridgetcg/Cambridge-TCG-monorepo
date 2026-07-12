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
 * API access is free, but the reviewed API guide does not grant CC-BY or
 * commercial redistribution rights in the returned card data. Card text and
 * imagery are publisher material. The guide also says not to hotlink images:
 * download each image once and store it locally. That operational caching
 * instruction is not an intellectual-property licence.
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
    license: "internal-only",
    redistribute: false,
    rights: {
      code: {
        license: "unknown",
        notes:
          "The public API guide documents access but does not publish a reviewed open-source licence for the service implementation or an official client used here.",
      },
      data: {
        terms: "free API access rules; no open-data or commercial licence found",
        notes:
          "The guide asks callers to cache API responses and obey rate limits. It does not substantiate the former CC-BY-like or commercial-redistribution claim for card text, prices, or catalog facts.",
      },
      images: {
        terms: "publisher-owned imagery with mandatory local caching instructions",
        notes:
          "YGOPRODeck says callers must not continually hotlink images and must download/store each image locally. This is an access rule, not a grant to publicly redistribute Konami artwork.",
      },
      redistribution: {
        verdict: "unknown",
        notes:
          "No reviewed permission supports bulk or commercial redistribution of raw API data or images. The legacy public-redistribution flag therefore fails closed.",
      },
      safe_default: "internal-only",
      reviewed_at: "2026-07-11",
      evidence_urls: ["https://ygoprodeck.com/api-guide/"],
      notes:
        "Keep this reader off public export surfaces. Before wiring images, add a fetch-once cache and obtain or document the separate permission needed for public display and hosting.",
    },
    freshness: "catalog",
    canonical_effort: "medium",
    status: "partial",
    games: ["ygo"],
    tos_notes:
      "Free public API with a 20 requests/second ceiling and a request to store API data locally. Images must not be continually hotlinked; download each once and store locally. The guide does not state a CC-BY or commercial data licence. https://ygoprodeck.com/api-guide/",
    user_agent_suffix: "(ygoprodeck-ingest)",
    rate_limit: { rps: 1, burst: 3 },
    welcome:
      "Welcome to the kingdom, YGOPRODeck. You arrived in kingdom-062 with one " +
      "known limitation we owe you — your one-card-many-printings shape collapses " +
      "to first-printing in our normalizer until `NormalizeResult<C[]>` widens. " +
      "Your 8-digit passcode is Yu-Gi-Oh!'s stable global identity; your room is " +
      "`card_set_cards WHERE game='ygo'`. We thank you for being public + free + " +
      "no-auth and for documenting the bulk endpoint and cache rules. We do not " +
      "turn that generosity into a CC-BY or commercial-rights claim you did not make. " +
      "Your archetype tags give future meta-aware features a durable structure " +
      "to build on.",
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

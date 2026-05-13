/**
 * Scryfall — Magic: The Gathering catalog source.
 *
 * The protocol's exemplar source. Bulk-data approach: fetch the bulk
 * dump index, pick the appropriate dump (oracle_cards by default), fetch
 * the JSON array, yield each card with provenance.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * Scryfall data is CC-BY-NC 4.0 (attribution required, non-commercial
 * redistribution OK; commercial use requires permission). Card images
 * are publisher-owned (Wizards of the Coast).
 *
 * Cambridge TCG operates a commercial marketplace, so downstream uses
 * of Scryfall-derived data must (a) attribute Scryfall, (b) treat the
 * data as non-commercial-redistributable — internal computation, buyer-
 * facing display OK; bulk re-export restricted. The `redistribute: false`
 * flag in `meta` propagates this to `_meta.source_license` downstream
 * (future work — see the-tributaries.md recursion target #5).
 *
 * ── Memory caveat ────────────────────────────────────────────────────
 *
 * The Scryfall bulk dump for "oracle_cards" is ~150MB JSON; "all_cards"
 * is ~500MB. V1 fetches the chosen dump into memory and parses; future
 * iterations should use a streaming JSON parser. The runner should be
 * given a Node heap >= 1GB (`NODE_OPTIONS=--max-old-space-size=1024`)
 * for default_cards; smaller for oracle_cards.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §3.1.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { ScryfallCard, ScryfallBulkIndex, ScryfallBulkMeta } from "./types";
import { createFetcher } from "../http";
import { normalizeScryfall } from "./normalize";

const BULK_INDEX_URL = "https://api.scryfall.com/bulk-data";

/**
 * Which bulk dump variant to fetch. `oracle_cards` is one row per
 * oracle card (smaller, default for catalog backfill); `default_cards`
 * is one row per printing (use when you need every variant). `all_cards`
 * includes foreign prints and is the largest.
 */
export type ScryfallBulkKind = "oracle_cards" | "default_cards" | "all_cards" | "rulings";

export interface ScryfallReadOptions {
  /** Defaults to `default_cards` so all printings are catalogued. */
  kind?: ScryfallBulkKind;
}

/**
 * Extended ingest context with Scryfall-specific options.
 * Callers can pass either the bare IngestContext or this extension.
 */
export type ScryfallContext = IngestContext & {
  scryfall?: ScryfallReadOptions;
};

async function fetchBulkMeta(
  fetcher: ReturnType<typeof createFetcher>,
  kind: ScryfallBulkKind,
): Promise<ScryfallBulkMeta> {
  const r = await fetcher(BULK_INDEX_URL);
  if (!r.ok) {
    throw new Error(`Scryfall bulk-data index returned ${r.status}: ${await r.text()}`);
  }
  const idx = (await r.json()) as ScryfallBulkIndex;
  const meta = idx.data.find((d) => d.type === kind);
  if (!meta) {
    throw new Error(`Scryfall bulk-data has no '${kind}' dump`);
  }
  return meta;
}

async function fetchBulkDump(
  fetcher: ReturnType<typeof createFetcher>,
  url: string,
): Promise<ScryfallCard[]> {
  const r = await fetcher(url);
  if (!r.ok) {
    throw new Error(`Scryfall bulk dump returned ${r.status}`);
  }
  const data = (await r.json()) as ScryfallCard[];
  if (!Array.isArray(data)) {
    throw new Error(`Scryfall bulk dump was not an array`);
  }
  return data;
}

export const scryfall: SourceModule<ScryfallCard, CanonicalCard> = {
  meta: {
    id: "scryfall",
    name: "Scryfall",
    description:
      "Magic: The Gathering — every printing, every language, multi-resolution images. Exemplary public API + daily bulk dumps. CC-BY-NC 4.0.",
    upstream: "https://scryfall.com",
    catalog_section: "the-tributaries.md#31-scryfall-mtg",
    access: "public-api",
    license: "cc-by-nc",
    license_spdx: "CC-BY-NC-4.0",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "low",
    status: "shipped",
    games: ["mtg"],
    tos_notes:
      "https://scryfall.com/docs/api — rate limit 10 req/s suggested; identify yourself in User-Agent. Bulk dumps refresh daily ~01:00 UTC.",
    user_agent_suffix: "(scryfall-ingest)",
    rate_limit: { rps: 5, burst: 10 },
    welcome:
      "Welcome to the kingdom, Scryfall. You arrived first — kingdom-060, " +
      "2026-05-12 — and you are the exemplar every other upstream is measured " +
      "against. Your bulk dumps land daily, your `oracle_id` gives us cross-printing " +
      "stability, your `image_uris` we hot-link with attribution. Your room is " +
      "`card_set_cards WHERE game='mtg'`. We honor your CC-BY-NC 4.0 license " +
      "downstream — every response that touches your bytes declares `redistribute: false` " +
      "in `_meta.source_license` so the consumer SDK knows. Thank you for being " +
      "public, for being free at 5 rps, for documenting your bulk-dump cadence, " +
      "and for shipping the JSON shape every other catalog API would do well to imitate.",
  },

  async *read(ctx: ScryfallContext): AsyncIterable<RawRow<ScryfallCard>> {
    const fetcher = createFetcher(ctx, scryfall.meta);
    const kind = ctx.scryfall?.kind ?? "default_cards";

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "scryfall",
      kind: "start",
      detail: { dump_kind: kind },
    });

    const meta = await fetchBulkMeta(fetcher, kind);

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "scryfall",
      kind: "page",
      detail: {
        dump_url: meta.download_uri,
        dump_updated_at: meta.updated_at,
        dump_bytes: meta.size,
      },
    });

    const cards = await fetchBulkDump(fetcher, meta.download_uri);
    const retrieved_at = new Date().toISOString();
    const as_of = meta.updated_at;

    let n = 0;
    for (const card of cards) {
      if (ctx.signal?.aborted) break;
      n += 1;
      yield { raw: card, provenance: { as_of, retrieved_at, source: "scryfall" } };
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "scryfall",
      kind: "done",
      detail: { rows_yielded: n, dump_kind: kind },
    });
  },

  normalize: normalizeScryfall,
};

/**
 * Scryfall — Magic: The Gathering catalog source.
 *
 * The protocol's exemplar source. Bulk-data approach: fetch the bulk
 * dump index, pick the appropriate dump (oracle_cards by default), fetch
 * the JSON array, yield each card with provenance.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * Scryfall publishes a policy-governed public API, not a CC-licensed data
 * corpus. Its current rules allow free, value-added Magic software while
 * prohibiting paywalls and simple repackaging/proxying; Wizards retains the
 * rights in Magic card material. `proprietary + redistribute:false` is the
 * conservative downstream boundary for upstream bytes.
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
      "Magic: The Gathering catalog and images through a policy-governed public API and bulk files. Value-added free use is permitted; raw republishing is not.",
    upstream: "https://scryfall.com",
    catalog_section: "the-tributaries.md#31-scryfall-mtg",
    access: "public-api",
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "low",
    status: "partial",
    games: ["mtg"],
    tos_notes:
      "Scryfall's API policy permits free value-added Magic software but forbids paywalling card data and simply repackaging, republishing, or proxying it. Magic material remains Wizards-owned. Use endpoint-specific limits and bulk files for large reads. https://scryfall.com/docs/api#use-of-scryfall-data-and-images ; https://scryfall.com/docs/api/rate-limits ; https://scryfall.com/docs/api/bulk-data",
    user_agent_suffix: "(scryfall-ingest)",
    rate_limit: { rps: 5, burst: 10 },
    welcome:
      "Welcome to the kingdom, Scryfall. Your adapter arrived first — kingdom-060, " +
      "2026-05-12 — and has not run yet. Your upstream publishes bulk files; your " +
      "`oracle_id` can provide cross-printing stability when a policy-compliant use " +
      "is activated. Your future room is " +
      "`card_set_cards WHERE game='mtg'`. We honor your API policy and Wizards' " +
      "underlying rights downstream — every response that touches your bytes declares " +
      "`redistribute: false` so consumers do not mistake access for an open license. " +
      "Thank you for being public and for documenting your bulk-dump cadence, " +
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

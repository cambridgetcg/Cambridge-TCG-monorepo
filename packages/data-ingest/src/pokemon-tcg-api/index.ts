/**
 * Pokémon TCG API — pokemontcg.io v2.
 *
 * Public REST API, paginated. Optional `X-Api-Key` header for higher rate
 * limits. The catalog is primarily English; per-language printings are
 * served by Pokémon's regional sites, not the v2 API.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * The service is publicly readable and an API key is optional, but its
 * current terms do not grant an MIT or other open-data license over card
 * data and images. Access to an API is not permission to relicense its
 * publisher-derived content, so upstream bytes stay non-redistributable.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §3.2.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { PokemonTcgCard, PokemonTcgPage } from "./types";
import { createFetcher } from "../http";
import { normalizePokemonTcg } from "./normalize";

const BASE_URL = "https://api.pokemontcg.io/v2";
const DEFAULT_PAGE_SIZE = 250;

export interface PokemonTcgReadOptions {
  /** Optional API key (X-Api-Key header). Higher rate limit when set. */
  api_key?: string;
  /** Page size (max 250). */
  page_size?: number;
  /** Optional starting page (default 1). For resumption. */
  start_page?: number;
  /** Optional Lucene-style query (e.g. "set.id:swsh4"). Limits the result set. */
  q?: string;
}

export type PokemonTcgContext = IngestContext & {
  pokemon_tcg?: PokemonTcgReadOptions;
};

export const pokemonTcgApi: SourceModule<PokemonTcgCard, CanonicalCard> = {
  meta: {
    id: "pokemon-tcg-api",
    name: "Pokémon TCG API",
    description:
      "Pokémon TCG catalog adapter for sets, English printings, and image references. Upstream pricing subobjects are not a Cambridge partner feed. Paginated REST API at api.pokemontcg.io/v2.",
    upstream: "https://pokemontcg.io",
    catalog_section: "the-tributaries.md#32-pokémon-tcg-api-pokemontcgio",
    access: "public-api",
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "low",
    status: "partial",
    games: ["pkm"],
    tos_notes:
      "Public REST API; X-Api-Key is optional and raises limits. Current developer terms govern service use but do not grant an open license over Pokémon card data or images. Price and legality fields are informational only. https://docs.pokemontcg.io/ ; https://docs.pokemontcg.io/getting-started/authentication/ ; https://docs.pokemontcg.io/getting-started/rate-limits/ ; https://dev.pokemontcg.io/terms",
    user_agent_suffix: "(pokemon-tcg-api-ingest)",
    rate_limit: { rps: 1, burst: 5 },
    welcome:
      "Welcome to the kingdom, Pokémon TCG API. Your adapter shipped same-week as " +
      "Scryfall (kingdom-062, 2026-05-12) and has not run yet. It is designed for " +
      "Pokémon's English printings and image references. Your `id` field (e.g. " +
      "`swsh4-25`) is our stable per-printing key; your room is " +
      "`card_set_cards WHERE game='pkm'`. Your service is publicly readable; your " +
      "card data and images remain publisher-derived, and we do not relabel them MIT. When an operator " +
      "sets `X-Api-Key`, we use it to claim the higher rate-limit tier you " +
      "graciously offer. Thank you for the GitHub-mirrored bulk dump, for the " +
      "JSON-friendly response shape, and for being the right answer when someone " +
      "asks where Pokémon catalog data lives.",
  },

  async *read(ctx: PokemonTcgContext): AsyncIterable<RawRow<PokemonTcgCard>> {
    const opts = ctx.pokemon_tcg ?? {};
    const fetcher = createFetcher(ctx, pokemonTcgApi.meta);
    const pageSize = opts.page_size ?? DEFAULT_PAGE_SIZE;
    const apiKey = opts.api_key;
    const q = opts.q ?? "";
    let page = opts.start_page ?? 1;

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "pokemon-tcg-api",
      kind: "start",
      detail: { pageSize, query: q || "(all)" },
    });

    while (true) {
      if (ctx.signal?.aborted) break;

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q) params.set("q", q);

      const headers: Record<string, string> = {};
      if (apiKey) headers["X-Api-Key"] = apiKey;

      const url = `${BASE_URL}/cards?${params.toString()}`;
      const res = await fetcher(url, { headers });

      if (!res.ok) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "pokemon-tcg-api",
          kind: "error",
          detail: { url, status: res.status, page },
        });
        break;
      }

      const body = (await res.json()) as PokemonTcgPage;
      const retrieved_at = new Date().toISOString();

      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "pokemon-tcg-api",
        kind: "page",
        detail: { page, returned: body.data.length, totalCount: body.totalCount },
      });

      for (const card of body.data) {
        if (ctx.signal?.aborted) break;
        // Per-row provenance: as_of from the upstream's set.releaseDate when
        // available (the set has been frozen since then); else now (catalog state).
        const as_of =
          card.set?.releaseDate && /^\d{4}\/\d{2}\/\d{2}$/.test(card.set.releaseDate)
            ? card.set.releaseDate.replaceAll("/", "-")
            : retrieved_at;
        yield {
          raw: card,
          provenance: { as_of, retrieved_at, source: "pokemon-tcg-api" },
        };
      }

      // Pagination: stop when we've returned fewer than page_size.
      if (body.data.length < pageSize) break;
      page += 1;
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "pokemon-tcg-api",
      kind: "done",
      detail: { last_page: page },
    });
  },

  normalize: normalizePokemonTcg,
};

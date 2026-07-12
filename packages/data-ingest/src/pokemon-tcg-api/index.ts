/**
 * Pokémon TCG API — legacy pokemontcg.io v2 integration.
 *
 * The provider now describes the service as part of Scrydex. Scrydex has a
 * different endpoint, authentication, pricing, and terms surface. This old
 * reader is deliberately blocked instead of treating a historical API key
 * or still-responsive legacy endpoint as current permission.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * No reviewed evidence substantiates the former claim that the returned
 * dataset was MIT licensed. A software licence would not license Pokémon
 * card text or artwork in any event. The layered `meta.rights` record marks
 * code, data, images, and redistribution separately and fails closed.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §3.2.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { PokemonTcgCard } from "./types";
import { normalizePokemonTcg } from "./normalize";

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
      "Legacy pokemontcg.io v2 integration. The provider has moved its current product to Scrydex; this module performs no fetch until the replacement access and content rights are reviewed.",
    upstream: "https://pokemontcg.io",
    catalog_section: "the-tributaries.md#32-pokémon-tcg-api-pokemontcgio",
    access: "blocked",
    license: "internal-only",
    redistribute: false,
    rights: {
      code: {
        license: "unknown",
        notes:
          "No licence file was found for the legacy API service or its data repository during this review. Licences on third-party SDKs would apply only to SDK code.",
      },
      data: {
        terms: "legacy service superseded; current Scrydex terms not reviewed",
        notes:
          "The legacy homepage says Pokémon TCG API is now part of Scrydex. The old data repository does not publish a licence that grants downstream rights in card text, prices, or catalog records.",
      },
      images: {
        terms: "publisher-owned Pokémon card imagery; no redistribution grant found",
        notes:
          "Image URLs in the historical response do not themselves grant a licence to copy, host, or redistribute Pokémon artwork.",
      },
      redistribution: {
        verdict: "unknown",
        notes:
          "Neither an open-data licence nor current Scrydex redistribution permission has been verified. Raw metadata and images must not be redistributed.",
      },
      safe_default: "no-fetch",
      reviewed_at: "2026-07-11",
      evidence_urls: [
        "https://pokemontcg.io/",
        "https://scrydex.com/docs",
        "https://github.com/PokemonTCG/pokemon-tcg-data",
      ],
      notes:
        "Replace this module with a separately reviewed Scrydex source rather than silently changing its endpoint. Provider contract, data rights, image rights, cost, and attribution all need review first.",
    },
    freshness: "catalog",
    canonical_effort: "low",
    status: "blocked",
    games: ["pkm"],
    tos_notes:
      "The legacy provider homepage now directs users to Scrydex: https://pokemontcg.io/ and https://scrydex.com/docs. No current access or redistribution terms have been approved for this module, so read() is a no-fetch block.",
    user_agent_suffix: "(pokemon-tcg-api-ingest)",
    rate_limit: { rps: 1, burst: 5 },
    welcome:
      "Welcome to the legacy Pokémon TCG API. Your normalizer and historical response " +
      "shape remain documented, but your provider has moved the current service to " +
      "Scrydex. We will not pretend an old MIT claim about code licensed Pokémon data " +
      "or artwork, and we will not silently point this reader at a new commercial " +
      "service. Your room stays closed until Scrydex access, data terms, image terms, " +
      "and redistribution rules are reviewed as their own source.",
  },

  // eslint-disable-next-line require-yield
  async *read(ctx: PokemonTcgContext): AsyncIterable<RawRow<PokemonTcgCard>> {
    await ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "pokemon-tcg-api",
      kind: "error",
      detail: {
        blocked: true,
        status: "source-moved-rights-unreviewed",
        reason:
          "pokemontcg.io now points to Scrydex; this legacy reader is disabled until the replacement contract, data terms, image terms, and redistribution rights are reviewed",
        evidence: ["https://pokemontcg.io/", "https://scrydex.com/docs"],
      },
    });
  },

  normalize: normalizePokemonTcg,
};

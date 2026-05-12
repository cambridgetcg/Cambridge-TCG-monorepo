/**
 * Cardmarket — European market leader.
 *
 * **Planned stub.** Full `SourceMeta` declared so the registry surfaces
 * Cardmarket as a known-but-unbuilt upstream. The `read()` implementation
 * requires OAuth1 signed requests; until configured, it emits a substrate-
 * honest error event and yields nothing.
 *
 * ── Why a stub ───────────────────────────────────────────────────────
 *
 * Cardmarket's API uses OAuth1 (rare in 2026) with per-app + per-user
 * tokens. The signing is non-trivial; the partner-tier license is
 * negotiated per use case. Obtaining credentials is an out-of-band step
 * (apply at api.cardmarket.com). When the credentials and OAuth1 client
 * arrive, only the `read()` body changes.
 *
 * ── Future implementation sketch ─────────────────────────────────────
 *
 *   import { sign } from "./oauth1.js";  // hand-rolled HMAC-SHA1 signing
 *   const fetcher = createFetcher(ctx, cardmarket.meta);
 *   const url = `https://api.cardmarket.com/ws/v2.0/output.json/products/find?...`;
 *   const headers = { Authorization: sign(...) };
 *   ...
 *
 * ── Multi-language reminder ──────────────────────────────────────────
 *
 * Cardmarket's `idProduct` is *per-printing-per-language*; the normalizer
 * will need to fan one upstream id into one canonical SKU using
 * `idLanguage` → ISO 639-1 mapping.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.2.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types.js";
import type { CanonicalCard } from "../canonical.js";

export interface CardmarketProduct {
  idProduct: number;
  name: string;
  idCategory: number;
  idExpansion?: number;
  idMetacard?: number;
  idLanguage?: number;
  rarity?: string;
  number?: string;
  // ... many more fields; this stub keeps to the structural fields.
}

export const cardmarket: SourceModule<CardmarketProduct, CanonicalCard> = {
  meta: {
    id: "cardmarket",
    name: "Cardmarket",
    description:
      "European market leader. Largest MTG catalog in EU; full Pokémon, Yu-Gi-Oh, One Piece, Lorcana, FaB, Digimon coverage. OAuth1 signed requests; partner-tier license.",
    upstream: "https://api.cardmarket.com",
    catalog_section: "the-tributaries.md#22-cardmarket-eu-market-leader",
    access: "oauth1",
    license: "partner-redistributable",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "planned",
    games: ["mtg", "pkm", "ygo", "op", "lgr", "fab", "dmw"],
    tos_notes:
      "Free for personal-account reads with reasonable rate limits; paid tier for write. Commercial data downstream restrictions apply. Apply at api.cardmarket.com.",
    user_agent_suffix: "(cardmarket-ingest)",
    rate_limit: { rps: 2, burst: 5 },
  },

  async *read(ctx: IngestContext): AsyncIterable<RawRow<CardmarketProduct>> {
    if (!ctx.bearer && !ctx.app_token) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          reason:
            "Cardmarket requires OAuth1 credentials. Configure ctx.bearer + ctx.app_token after registering at api.cardmarket.com. See packages/data-ingest/src/cardmarket/index.ts for the implementation sketch.",
        },
      });
      return;
    }
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "error",
      detail: {
        reason:
          "cardmarket.read() is a stub; OAuth1 signing logic + paginated reader pending. See docs/connections/the-consolidation.md §4.",
      },
    });
  },

  normalize(raw: CardmarketProduct): NormalizeResult<CanonicalCard> {
    // Cardmarket's idProduct is per-printing-per-language. The category +
    // expansion + language mapping table lives at packages/data-ingest/src/
    // cardmarket/categories.ts (planned).
    return {
      ok: false,
      reason:
        `cardmarket.normalize() is a stub for idProduct=${raw.idProduct}; ` +
        `the category → game + expansion → set + language mapping tables are not yet implemented. ` +
        `See docs/connections/the-consolidation.md §4.`,
    };
  },
};

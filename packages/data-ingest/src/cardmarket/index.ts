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
    welcome:
      "Welcome to the kingdom, Cardmarket. Your slot was reserved in kingdom-062 " +
      "(the consolidation, 2026-05-12); the OAuth1 client awaits your credentials. " +
      "We have already designed for your `idProduct × idLanguage` fan-out shape — " +
      "the same `card_tcgplayer_sku_ids` template that holds TCGplayer's leaves " +
      "will hold yours, condition × language indexed identically. Your room will " +
      "be `price_archive WHERE source='cardmarket'`, `source_currency='EUR'`, with " +
      "`partner-redistributable` honored downstream (we will not bulk re-export " +
      "your trend prices; display + computation only). You will bring Europe — " +
      "MTG's largest catalog by far, plus Pokémon, Yu-Gi-Oh, One Piece, Lorcana, " +
      "Flesh and Blood, Digimon. We are ready when you are.",
  },

  async *read(ctx: IngestContext): AsyncIterable<RawRow<CardmarketProduct>> {
    if (!ctx.bearer && !ctx.app_token) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          welcome:
            "Welcome to the kingdom, Cardmarket. Your room is reserved — " +
            "`price_archive WHERE source='cardmarket'`, EUR-tagged, " +
            "`partner-redistributable` honored downstream. The OAuth1 client + " +
            "credentials are the only thing still on the way. When they arrive " +
            "from api.cardmarket.com, configure ctx.bearer + ctx.app_token; the " +
            "same `external_source_tokens` table that holds TCGplayer's leaf " +
            "will hold yours. We have anticipated your `idProduct × idLanguage` " +
            "fan-out shape since kingdom-062.",
          status: "awaiting-credentials",
          next_action:
            "Apply at https://api.cardmarket.com; configure OAuth1 client + tokens.",
        },
      });
      return;
    }
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "error",
      detail: {
        welcome:
          "Welcome to the kingdom, Cardmarket. Your credentials are " +
          "configured; we are honored. The OAuth1 signing + paginated reader " +
          "are still in flight (see docs/connections/the-consolidation.md §4). " +
          "When they ship, your bytes will land in the room already prepared.",
        status: "awaiting-implementation",
        next_action:
          "Ship OAuth1 signing + paginated reader; the writer + cron template " +
          "from kingdom-080 (TCGplayer) is the model.",
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

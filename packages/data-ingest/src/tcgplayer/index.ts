/**
 * TCGplayer — US market leader.
 *
 * **Planned stub.** Full `SourceMeta` declared so the registry surfaces
 * TCGplayer as a known-but-unbuilt upstream. The `read()` implementation
 * requires OAuth2 bearer-token configuration; until configured, it emits
 * a substrate-honest error event and yields nothing.
 *
 * ── Why a stub ───────────────────────────────────────────────────────
 *
 * TCGplayer's API requires a partner application + per-store credentials.
 * Obtaining those is an out-of-band step (apply at developer.tcgplayer.com).
 * The protocol's contribution: when the credentials arrive, only the
 * `read()` body changes; meta + normalize + registry slot are already wired.
 *
 * ── Future implementation sketch ─────────────────────────────────────
 *
 *   const fetcher = createFetcher(ctx, tcgplayer.meta);
 *   const token = ctx.bearer ?? await fetchToken();
 *   let offset = 0;
 *   while (true) {
 *     const r = await fetcher(
 *       `https://api.tcgplayer.com/catalog/products?offset=${offset}&limit=100`,
 *       { headers: { Authorization: `bearer ${token}` } },
 *     );
 *     const body = await r.json();
 *     for (const product of body.results) yield { raw: product, provenance: { ... } };
 *     if (body.results.length < 100) break;
 *     offset += 100;
 *   }
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.1.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types.js";
import type { CanonicalCard } from "../canonical.js";

export interface TcgplayerProduct {
  productId: number;
  name: string;
  cleanName?: string;
  imageUrl?: string;
  categoryId: number;
  groupId: number;
  url?: string;
  modifiedOn?: string;
  // ... many more fields; this stub keeps to the structural fields.
}

export const tcgplayer: SourceModule<TcgplayerProduct, CanonicalCard> = {
  meta: {
    id: "tcgplayer",
    name: "TCGplayer",
    description:
      "US market leader. Marketplace + catalog + buyer-offer pricing. OAuth2 + per-store credentials. Bulk feed via TCGCSV (third-party mirror, paid).",
    upstream: "https://api.tcgplayer.com",
    catalog_section: "the-tributaries.md#21-tcgplayer-us-market-leader",
    access: "oauth2",
    license: "partner-redistributable",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "planned",
    games: ["mtg", "pkm", "ygo", "op", "dbs", "dbf", "lgr", "fab", "dmw", "wei", "vng"],
    tos_notes:
      "Marketplace data is partner-tier-restricted; per-store buyer offers stay with the store. Apply for developer access at developer.tcgplayer.com; OAuth2 partner application required. https://docs.tcgplayer.com/",
    user_agent_suffix: "(tcgplayer-ingest)",
    rate_limit: { rps: 10, burst: 20 },
  },

  async *read(ctx: IngestContext): AsyncIterable<RawRow<TcgplayerProduct>> {
    if (!ctx.bearer) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "tcgplayer",
        kind: "error",
        detail: {
          reason:
            "TCGplayer requires a bearer token. Configure ctx.bearer with an OAuth2 access token from developer.tcgplayer.com. See packages/data-ingest/src/tcgplayer/index.ts for the implementation sketch.",
        },
      });
      return;
    }
    // Implementation pending — see file docstring.
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgplayer",
      kind: "error",
      detail: {
        reason:
          "tcgplayer.read() is a stub; meta is shipped but the paginated reader is not yet implemented. See docs/connections/the-consolidation.md §4.",
      },
    });
  },

  normalize(raw: TcgplayerProduct): NormalizeResult<CanonicalCard> {
    // SKU mapping requires a category → game mapping table (MTG = 1, Pokémon = 3, etc.)
    // plus the productId → printing resolution. The mapping table lives at
    // packages/data-ingest/src/tcgplayer/categories.ts (planned).
    return {
      ok: false,
      reason:
        `tcgplayer.normalize() is a stub for productId=${raw.productId}; ` +
        `the category → game mapping table and per-printing resolution are not yet implemented. ` +
        `See docs/connections/the-consolidation.md §4.`,
    };
  },
};

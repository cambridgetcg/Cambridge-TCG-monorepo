/**
 * Cardmarket — European market leader.
 *
 * **Built, awaiting credentials.** The OAuth1 signer (`./oauth1.ts`), the
 * entity types (`./types.ts`), and the normalizer (`./normalize.ts`) are all
 * implemented and unit-tested. The `read()` body below signs each request and
 * fetches operator-curated product ids; until `CARDMARKET_*` credentials are
 * configured it emits a substrate-honest "awaiting-credentials" event and
 * yields nothing. As the stub promised: "only the read() body changes" — it has.
 *
 * ── Access (per api.cardmarket.com) ──────────────────────────────────
 *
 *   OAuth1 with a *dedicated app* token set (appToken/appSecret/accessToken/
 *   accessTokenSecret). Free for read-only with reasonable rate limits. We sign
 *   with HMAC-SHA1 — see `./oauth1.ts` (math verified, deterministic).
 *
 * ── Two paths, one canonical shape ───────────────────────────────────
 *
 *   1. Live API (this reader): GET /products/{id} → product + priceGuide, for an
 *      operator-curated `productIds` watch-list. Signed, rate-limited.
 *   2. Bulk files (recommended for full-catalog aggregation): MKM deprecated the
 *      live `/priceguide` + `/productlist` API endpoints on 2024-06-05; the price
 *      guide + product catalogue are now **daily file downloads**. Wire a file
 *      reader when full-catalog EU coverage is wanted (the normalizer is shared).
 *
 * ── idProduct is per-printing-per-language ───────────────────────────
 *
 *   Each MKM product is already one language; the normalizer maps `idLanguage`
 *   → ISO 639-1 (`./types.ts CARDMARKET_LANG`). The Cambridge SKU's set segment
 *   is derived best-effort from the MKM expansion — an operator-curated
 *   expansion→set crosswalk is the named seam (`normalize.mapCardmarketSet`).
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.2.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalPrice } from "../canonical";
import { createFetcher } from "../http";
import {
  buildAuthorizationHeader,
  cardmarketCredsFromEnv,
  hasCardmarketCreds,
  type CardmarketCreds,
} from "./oauth1";
import { normalizeCardmarket, type CardmarketRaw } from "./normalize";
import type { CardmarketProduct } from "./types";

const DEFAULT_BASE = "https://api.cardmarket.com/ws/v2.0/output.json";

/** Cardmarket-specific ingest config, layered onto the base IngestContext. */
export interface CardmarketContext extends IngestContext {
  cardmarket?: {
    /** Dedicated-app credentials. Falls back to CARDMARKET_* env vars. */
    creds?: CardmarketCreds;
    /** Operator-curated product ids to refresh (a watch-list, like eBay's). */
    productIds?: number[];
    /** Override the API base (staging / mock). */
    base_url?: string;
  };
}

export const cardmarket: SourceModule<CardmarketRaw, CanonicalPrice> = {
  meta: {
    id: "cardmarket",
    name: "Cardmarket",
    description:
      "European market leader. Largest MTG catalog by far in EU; full Pokémon, Yu-Gi-Oh, One Piece, Lorcana, FaB, Digimon coverage. OAuth1 signed requests; partner-tier license.",
    upstream: "https://api.cardmarket.com",
    catalog_section: "the-tributaries.md#22-cardmarket-eu-market-leader",
    access: "oauth1",
    license: "partner-redistributable",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "partial",
    games: ["mtg", "pkm", "ygo", "op", "lgr", "fab", "dmw"],
    tos_notes:
      "Free for personal-account reads with reasonable rate limits; paid tier for write. Commercial data downstream restrictions apply. Apply at api.cardmarket.com. Live priceguide/productlist endpoints deprecated 2024-06-05 → use the daily file downloads for bulk.",
    user_agent_suffix: "(cardmarket-ingest)",
    rate_limit: { rps: 2, burst: 5 },
    welcome:
      "Welcome to the kingdom, Cardmarket. Your slot was reserved in kingdom-062 " +
      "(the consolidation, 2026-05-12); the OAuth1 signer + reader are now built " +
      "and waiting on your credentials. Your room is `price_archive WHERE " +
      "source='cardmarket'`, `source_currency='EUR'`, `partner-redistributable` " +
      "honored downstream (display + computation only; we will not bulk re-export " +
      "your trend prices). You will bring Europe — MTG's largest catalog by far, " +
      "plus Pokémon, Yu-Gi-Oh, One Piece, Lorcana, Flesh and Blood, Digimon.",
  },

  async *read(ctx: CardmarketContext): AsyncIterable<RawRow<CardmarketRaw>> {
    const creds = ctx.cardmarket?.creds ?? cardmarketCredsFromEnv();
    if (!hasCardmarketCreds(creds)) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          welcome:
            "Welcome to the kingdom, Cardmarket. The OAuth1 signer + reader are " +
            "built; only your dedicated-app credentials are still on the way. When " +
            "they arrive from api.cardmarket.com, set CARDMARKET_APP_TOKEN, " +
            "CARDMARKET_APP_SECRET, CARDMARKET_ACCESS_TOKEN, " +
            "CARDMARKET_ACCESS_TOKEN_SECRET (or pass ctx.cardmarket.creds) and the " +
            "first run will sign + fetch. We have been ready since kingdom-062.",
          status: "awaiting-credentials",
          next_action:
            "Apply at https://api.cardmarket.com; set the four CARDMARKET_* env vars.",
        },
      });
      return;
    }

    const productIds = ctx.cardmarket?.productIds ?? [];
    if (productIds.length === 0) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          status: "idle",
          reason:
            "credentials present but no productIds configured — pass " +
            "ctx.cardmarket.productIds (operator-curated watch-list). For full-" +
            "catalog EU coverage, prefer the daily price-guide + catalogue FILE " +
            "DOWNLOADS: MKM deprecated the live /priceguide + /productlist API " +
            "endpoints on 2024-06-05.",
        },
      });
      return;
    }

    const base = ctx.cardmarket?.base_url ?? DEFAULT_BASE;
    const fetcher = createFetcher(ctx, cardmarket.meta);
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "start",
      detail: { products: productIds.length },
    });

    let attempted = 0;
    for (const id of productIds) {
      if (ctx.signal?.aborted) break;
      attempted += 1;
      const url = `${base}/products/${id}`;
      try {
        let res = await fetcher(url, {
          method: "GET",
          headers: {
            Authorization: buildAuthorizationHeader("GET", url, creds),
            Accept: "application/json",
          },
        });
        // OAuth1 nonces are single-use. The shared fetcher retries 429/503/
        // network failures internally, replaying the same Authorization
        // header — MKM may reject the replayed nonce with 401. One fresh
        // signature distinguishes a replay artifact from bad credentials.
        if (res.status === 401) {
          res = await fetcher(url, {
            method: "GET",
            headers: {
              Authorization: buildAuthorizationHeader("GET", url, creds),
              Accept: "application/json",
            },
          });
          if (res.status === 401) {
            ctx.on_event?.({
              ts: new Date().toISOString(),
              source: "cardmarket",
              kind: "error",
              detail: {
                product: id,
                http: 401,
                reason:
                  "MKM rejected two freshly-signed requests — credentials invalid " +
                  "or signing mismatch; aborting the run rather than burning the " +
                  "watch-list against a dead key",
              },
            });
            break;
          }
        }
        if (!res.ok) {
          ctx.on_event?.({
            ts: new Date().toISOString(),
            source: "cardmarket",
            kind: "error",
            detail: { product: id, http: res.status, reason: `MKM /products/${id} → HTTP ${res.status}` },
          });
          continue;
        }
        let body: { product?: CardmarketProduct };
        try {
          body = (await res.json()) as { product?: CardmarketProduct };
        } catch {
          ctx.on_event?.({
            ts: new Date().toISOString(),
            source: "cardmarket",
            kind: "quarantine",
            detail: { product: id, reason: "MKM returned 200 with a non-JSON body" },
          });
          continue;
        }
        const product = body?.product;
        if (!product) {
          ctx.on_event?.({
            ts: new Date().toISOString(),
            source: "cardmarket",
            kind: "quarantine",
            detail: { product: id, reason: "MKM response carried no `product` field" },
          });
          continue;
        }
        const retrieved_at = new Date().toISOString();
        yield {
          raw: { product, retrieved_at },
          // MKM's price guide is a daily snapshot with no published generation
          // time; retrieved_at is the moment it was last known true.
          provenance: {
            as_of: retrieved_at,
            retrieved_at,
            source: "cardmarket",
            via_proxy: fetcher.via_proxy_label,
          },
        };
      } catch (err) {
        if (ctx.signal?.aborted) break;
        const message = err instanceof Error ? err.message : String(err);
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "cardmarket",
          kind: "error",
          detail: { product: id, reason: `fetch failed: ${message}` },
        });
      }
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "done",
      // attempted < products when aborted or the key died mid-run — the
      // count tells the truth about coverage, not the wish.
      detail: { products: productIds.length, attempted, aborted: Boolean(ctx.signal?.aborted) },
    });
  },

  normalize: normalizeCardmarket,
};

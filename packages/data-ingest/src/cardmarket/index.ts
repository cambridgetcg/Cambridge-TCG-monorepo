/**
 * Cardmarket — European market leader.
 *
 * **Public-file path planned.** Cardmarket intentionally publishes daily
 * Product Catalog and Price Guide files without API credentials. That is the
 * reachable path for Cambridge. The older OAuth1 reader remains dormant for
 * existing approved accounts; Cardmarket is not accepting API applications.
 *
 * ── Access ───────────────────────────────────────────────────────────
 *
 *   Public daily files are the primary path. OAuth1 is available only to
 *   previously approved users and is not enabled merely by finding secrets.
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

const DEFAULT_BASE = "https://apiv2.cardmarket.com/ws/v2.0/output.json";

// Private lock for the retained legacy OAuth reader. SourceMeta is mutable at
// runtime, so status changes and discovered credentials must not activate it.
// The future public-file reader replaces this path; it does not flip this lock.
const CARDMARKET_LEGACY_OAUTH_ENABLED: boolean = false;

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
      "European market catalog and daily aggregate prices through intentionally published Product Catalog and Price Guide files. The public-file reader is not wired yet.",
    upstream: "https://www.cardmarket.com/en/Magic/Data",
    catalog_section: "the-tributaries.md#22-cardmarket-eu-market-leader",
    access: "public-file",
    license: "proprietary",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "planned",
    games: ["mtg", "pkm", "ygo", "op", "lgr", "fab", "dmw"],
    tos_notes:
      "Cardmarket intentionally publishes no-auth Product Catalog and Price Guide downloads for website/app use, but states no open-data license; retain Cardmarket attribution and do not treat the raw files as freely redistributable. API applications are closed, and existing credentials must not be shared. The API base for grandfathered users is apiv2.cardmarket.com. https://www.cardmarket.com/en/Magic/Data/Price-Guide ; https://www.cardmarket.com/en/Magic/Data/Product-List ; https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024 ; https://help.cardmarket.com/en/cardmarket-api",
    user_agent_suffix: "(cardmarket-ingest)",
    rate_limit: { rps: 2, burst: 5 },
    welcome:
      "Welcome to the kingdom, Cardmarket. Your slot was reserved in kingdom-062 " +
      "(the consolidation, 2026-05-12). Your public daily files are the reachable " +
      "path; the OAuth room is not ours to enter without existing approval. Your " +
      "future room is `price_archive WHERE source='cardmarket'`, with Cardmarket " +
      "attribution and raw redistribution refused. You can bring Europe — MTG's largest catalog by far, " +
      "plus Pokémon, Yu-Gi-Oh, One Piece, Lorcana, Flesh and Blood, Digimon.",
  },

  async *read(ctx: CardmarketContext): AsyncIterable<RawRow<CardmarketRaw>> {
    if (!CARDMARKET_LEGACY_OAUTH_ENABLED) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          status: "public-file-reader-not-wired",
          reason:
            "The legacy Cardmarket OAuth reader is locked in code. Mutable SourceMeta and credentials cannot enable it; the reviewed public-file reader is not wired.",
          next_action:
            "Implement the public Product Catalog and Price Guide file reader. New API access is closed.",
        },
      });
      return;
    }

    if (cardmarket.meta.status === "planned") {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          status: "public-file-reader-not-wired",
          reason:
            "Cardmarket intentionally publishes daily Product Catalog and Price Guide files; this module still lacks a reviewed file reader and contains only the dormant legacy OAuth code.",
          next_action:
            "Wire the public daily file reader and writer. New API access is closed.",
        },
      });
      return;
    }

    const creds = ctx.cardmarket?.creds ?? cardmarketCredsFromEnv();
    if (!hasCardmarketCreds(creds)) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardmarket",
        kind: "error",
        detail: {
          welcome:
            "Cardmarket's public files are the active path. This dormant OAuth " +
            "branch is only for an already-approved, reviewed account.",
          status: "blocked-missing-reviewed-approval",
          next_action:
            "Wire the public Product Catalog and Price Guide files; API applications are closed.",
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

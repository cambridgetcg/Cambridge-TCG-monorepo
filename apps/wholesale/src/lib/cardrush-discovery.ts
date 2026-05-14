/**
 * CardRush discovery runner — bulk sitemap → diff → INSERT new cards.
 *
 * Kingdom-087. The self-discovering counterpart to the on-demand
 * price-snapshot. Where the snapshot iterates `cards.cardrush_url IS
 * NOT NULL`, this runner DISCOVERS new product URLs from /sitemap.xml
 * and seeds `cards.cardrush_url` so the next snapshot picks them up.
 *
 * ── Daily lifecycle ──────────────────────────────────────────────────
 *
 * 1. INSERT an ingest_run row with source_id='cardrush-discover'
 * 2. For each subdomain in CARDRUSH_SUBDOMAINS with `confirmed: true`:
 *    a. Fetch /sitemap.xml (createDiscoveryFetcher shares the cardrush
 *       0.5 rps token bucket across the whole run)
 *    b. Extract every /product/[N] URL
 *    c. Diff against cards.cardrush_url for cards in that subdomain's game
 *    d. For each new URL:
 *       - Fetch + parse product page
 *       - Build SKU via @cambridge-tcg/sku from parsed set_code + card_number
 *       - INSERT card with ON CONFLICT (sku) DO UPDATE SET cardrush_url
 *         (lets cards seeded by other paths get their URL filled in)
 *       - Title-parse failures → ingest_quarantine
 * 3. UPDATE ingest_run with counts + events
 *
 * Substrate-honest about absence:
 *   - Subdomain unreachable → recorded as event, run continues
 *   - Sitemap missing → recorded as event, subdomain skipped
 *   - Title parse fails → quarantine row, card not inserted (preserves
 *     SKU integrity — we don't insert junk)
 *   - Product fetch fails → counted as failure, retry next run
 *
 * Conservative defaults: caps per-subdomain new-product fetches at 500
 * per run (large initial discovery batches; subsequent days find ~0 new).
 * Operator can override via `?maxNew=N` on the cron route.
 */

import { db } from "@/lib/db";
import { cards, games, ingestRun, ingestQuarantine } from "@/lib/db/schema";
import { eq, and, sql, like, inArray, isNotNull } from "drizzle-orm";
import {
  CARDRUSH_SUBDOMAINS,
  createDiscoveryCache,
  pickDiscoveryFetcher,
  fetchSitemap,
  fetchAndParseProduct,
  type CardMetadata,
  type CardRushContext,
} from "@cambridge-tcg/data-ingest";
import { buildSku, type GameCode } from "@cambridge-tcg/sku";

export interface DiscoveryRunOptions {
  triggeredBy?: "cron" | "admin" | "webhook";
  /** Cap new-product fetches per subdomain. Default 500. */
  maxNewPerSubdomain?: number;
  /** Limit to a single subdomain (host like "cardrush-op.jp"). */
  onlySubdomain?: string;
  /** Dry-run: walk sitemap + log diffs but skip product fetches + INSERTs. */
  dryRun?: boolean;
}

interface PerSubdomainResult {
  host: string;
  game_code: string;
  confirmed: boolean;
  sitemap_ok: boolean;
  sitemap_total_urls: number;
  sitemap_product_urls: number;
  existing_in_cards: number;
  new_urls: number;
  fetched: number;
  inserted: number;
  updated: number;
  quarantined: number;
  errors: number;
  capped: boolean;
}

export interface DiscoveryRunResult {
  ingestRunId: number;
  triggeredBy: string;
  per_subdomain: PerSubdomainResult[];
  totals: {
    subdomains_walked: number;
    products_discovered: number;
    new_inserted: number;
    cards_updated: number;
    quarantined: number;
    errors: number;
  };
  durationMs: number;
}

const DEFAULT_MAX_NEW_PER_SUBDOMAIN = 500;

export async function runCardRushDiscovery(
  options: DiscoveryRunOptions = {},
): Promise<DiscoveryRunResult> {
  const startMs = Date.now();
  const triggeredBy = options.triggeredBy ?? "cron";
  const maxNew = options.maxNewPerSubdomain ?? DEFAULT_MAX_NEW_PER_SUBDOMAIN;

  // ── 1. INSERT ingest_run ──────────────────────────────────────────
  const [runRow] = await db
    .insert(ingestRun)
    .values({
      sourceId: "cardrush-discover",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = runRow.id;

  const events: Record<string, unknown>[] = [];
  const event = (kind: string, detail: Record<string, unknown>) =>
    events.push({ ts: new Date().toISOString(), kind, ...detail });

  const per_subdomain: PerSubdomainResult[] = [];
  let totalQuarantined = 0;
  let totalErrors = 0;

  try {
    // Resolve game_code → game_id once. The cardrush registry's GameCode
    // values match wholesale `games.code` values.
    const gameRows = await db
      .select({ id: games.id, code: games.code })
      .from(games);
    const gameIdByCode = new Map(gameRows.map((g) => [g.code, g.id]));

    // Per-access-mode fetcher cache. Direct subdomains share one bucket;
    // bright-data-unlocker subdomains share another. The Bright Data
    // proxy URL is supplied via env (CARDRUSH_BRIGHT_DATA_PROXY_URL);
    // when absent and a bright-data subdomain is encountered, that
    // subdomain is skipped with a visible reason — kingdom-088.
    const fetcherCache = createDiscoveryCache();
    const ctx: CardRushContext = {
      cardrush: {
        bright_data_proxy_url: process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL,
      },
      on_event: async (ev) => {
        events.push({ ts: ev.ts, kind: `http_${ev.kind}`, ...ev.detail });
      },
    };

    // ── 2. Walk each confirmed subdomain — skip role="price-only" hosts
    // since their catalog comes from another source (e.g. Scryfall for
    // MTG). The price snapshot still scrapes cards seeded with the
    // host's URLs; only the discovery walk skips them.
    const subdomainsToWalk = Object.entries(CARDRUSH_SUBDOMAINS).filter(
      ([host, entry]) => {
        if (options.onlySubdomain && host !== options.onlySubdomain) return false;
        if (!entry.confirmed) return false;
        if (entry.role === "price-only" || entry.role === "blocked") return false;
        return true;
      },
    );

    for (const [host, entry] of subdomainsToWalk) {
      const result: PerSubdomainResult = {
        host,
        game_code: entry.game,
        confirmed: entry.confirmed,
        sitemap_ok: false,
        sitemap_total_urls: 0,
        sitemap_product_urls: 0,
        existing_in_cards: 0,
        new_urls: 0,
        fetched: 0,
        inserted: 0,
        updated: 0,
        quarantined: 0,
        errors: 0,
        capped: false,
      };

      const gameId = gameIdByCode.get(entry.game);
      if (gameId === undefined) {
        event("subdomain_skipped", { host, reason: `unknown game code: ${entry.game}` });
        result.errors += 1;
        totalErrors += 1;
        per_subdomain.push(result);
        continue;
      }

      // Pick the fetcher for this host. Direct subdomains share a bucket;
      // bright-data-unlocker subdomains share a separate bucket.
      const { fetcher, reason: fetcher_reason } = pickDiscoveryFetcher(
        host,
        ctx,
        fetcherCache,
      );
      if (!fetcher) {
        event("subdomain_skipped", {
          host,
          reason: fetcher_reason ?? "fetcher_unavailable",
          access: entry.access,
        });
        result.errors += 1;
        totalErrors += 1;
        per_subdomain.push(result);
        continue;
      }
      event("subdomain_fetcher_assigned", {
        host,
        access: entry.access,
        via_proxy: fetcher.via_proxy_label,
      });

      // 2a. Fetch sitemap
      const sm = await fetchSitemap(host, fetcher);
      result.sitemap_ok = sm.ok;
      result.sitemap_total_urls = sm.total_urls;
      result.sitemap_product_urls = sm.product_urls.length;
      if (!sm.ok) {
        event("sitemap_failed", { host, reason: sm.error_reason });
        result.errors += 1;
        totalErrors += 1;
        per_subdomain.push(result);
        continue;
      }
      event("sitemap_loaded", {
        host,
        total_urls: sm.total_urls,
        product_urls: sm.product_urls.length,
      });

      // 2b. Diff against existing cardrush_url for this subdomain
      // (filter by hostname prefix — cards.cardrush_url contains the full URL)
      const existing = await db
        .select({ url: cards.cardrushUrl })
        .from(cards)
        .where(
          and(
            eq(cards.gameId, gameId),
            isNotNull(cards.cardrushUrl),
            like(cards.cardrushUrl, `%${host}/product/%`),
          ),
        );
      // kingdom-087 follow-up: normalize URLs before set comparison.
      // Cardrush sitemaps emit `https://www.<host>/product/<N>` but
      // existing rows in `cards.cardrush_url` may have been seeded
      // without the `www.` prefix. Without this normalization the first
      // discovery run would re-discover every existing row. Strategy:
      // strip trailing slash AND collapse `https://www.X` → `https://X`
      // on both sides for the dedup compare only — the INSERT preserves
      // whatever the sitemap emitted (with www.).
      const normalize = (u: string): string =>
        u.replace(/\/$/, "").replace(/^https?:\/\/www\./, "https://");
      const existingUrls = new Set(
        existing.map((r) => normalize(r.url ?? "")),
      );
      result.existing_in_cards = existingUrls.size;

      const newUrlsAll = sm.product_urls.filter(
        (u) => !existingUrls.has(normalize(u)),
      );
      result.new_urls = newUrlsAll.length;
      const newUrls = newUrlsAll.slice(0, maxNew);
      result.capped = newUrlsAll.length > maxNew;

      event("discovery_diff", {
        host,
        existing: existingUrls.size,
        new_total: newUrlsAll.length,
        new_will_fetch: newUrls.length,
        capped: result.capped,
      });

      if (options.dryRun) {
        per_subdomain.push(result);
        continue;
      }

      // 2c. For each new URL: fetch product page → parse → INSERT
      for (const url of newUrls) {
        const fetch_result = await fetchAndParseProduct(url, fetcher);
        result.fetched += 1;

        if (!fetch_result.ok || !fetch_result.metadata) {
          result.errors += 1;
          totalErrors += 1;
          event("product_fetch_failed", {
            host,
            url,
            reason: fetch_result.error_reason,
          });
          continue;
        }

        const md = fetch_result.metadata;

        // Validate metadata: need set_code + card_number to build an SKU.
        // Title-parse failures land in quarantine for operator review.
        if (!md.set_code || !md.card_number) {
          await db.insert(ingestQuarantine).values({
            ingestRunId,
            sourceId: "cardrush-discover",
            upstreamId: url,
            rawPayload: md as unknown as Record<string, unknown>,
            reason: `title parse incomplete: set_code=${md.set_code} card_number=${md.card_number}; need both to build SKU`,
            asOf: new Date(fetch_result.fetched_at),
            retrievedAt: new Date(fetch_result.fetched_at),
          });
          result.quarantined += 1;
          totalQuarantined += 1;
          continue;
        }

        // Build the SKU. Language defaults to "ja" for cardrush JP.
        let sku: string;
        try {
          sku = buildSku({
            game: entry.game as GameCode,
            set: md.set_code.toLowerCase(),
            number: md.card_number,
            lang: "ja",
          });
        } catch (err) {
          await db.insert(ingestQuarantine).values({
            ingestRunId,
            sourceId: "cardrush-discover",
            upstreamId: url,
            rawPayload: md as unknown as Record<string, unknown>,
            reason: `buildSku failed: ${err instanceof Error ? err.message : String(err)}`,
            asOf: new Date(fetch_result.fetched_at),
            retrievedAt: new Date(fetch_result.fetched_at),
          });
          result.quarantined += 1;
          totalQuarantined += 1;
          continue;
        }

        // ON CONFLICT (sku): UPDATE cardrush_url + name + image_url + rarity
        // when those fields are NULL in the existing row. This lets the
        // discovery layer cooperate with manual seeds or other ingestion
        // paths without overwriting their values.
        const ret = await db
          .insert(cards)
          .values({
            sku,
            cardNumber: `${md.set_code}-${md.card_number}`,
            name: md.name ?? "",
            setCode: md.set_code,
            gameId,
            cardrushUrl: url,
            rarity: md.rarity,
            imageUrl: md.image_url,
            category: "singles",
          })
          .onConflictDoUpdate({
            target: cards.sku,
            // Use COALESCE in the SET so we don't overwrite non-null existing values
            set: {
              cardrushUrl: sql`COALESCE(${cards.cardrushUrl}, EXCLUDED.cardrush_url)`,
              name: sql`CASE WHEN ${cards.name} = '' OR ${cards.name} IS NULL THEN EXCLUDED.name ELSE ${cards.name} END`,
              setCode: sql`COALESCE(${cards.setCode}, EXCLUDED.set_code)`,
              rarity: sql`COALESCE(${cards.rarity}, EXCLUDED.rarity)`,
              imageUrl: sql`COALESCE(${cards.imageUrl}, EXCLUDED.image_url)`,
            },
          })
          .returning({ id: cards.id, cardrushUrl: cards.cardrushUrl });

        if (ret.length === 0) {
          // Shouldn't happen with ON CONFLICT DO UPDATE, but defensive.
          result.errors += 1;
          totalErrors += 1;
          continue;
        }

        // Distinguish INSERT (new row) vs UPDATE (existing row whose
        // cardrush_url just got filled in). The driver doesn't tell us
        // directly, so we approximate: if the returned cardrushUrl now
        // equals the URL we just sent AND it was previously absent,
        // count as inserted-or-updated. We'll roll up under inserted+updated
        // collectively. Substrate-honest about the soft boundary in events.
        result.inserted += 1;
        event("product_inserted_or_updated", { host, url, sku });
      }

      per_subdomain.push(result);
    }

    // ── 3. UPDATE ingest_run with final state ───────────────────────
    const totals = {
      subdomains_walked: per_subdomain.length,
      products_discovered: per_subdomain.reduce(
        (a, p) => a + p.sitemap_product_urls,
        0,
      ),
      new_inserted: per_subdomain.reduce((a, p) => a + p.inserted, 0),
      cards_updated: per_subdomain.reduce((a, p) => a + p.updated, 0),
      quarantined: totalQuarantined,
      errors: totalErrors,
    };

    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: totals.errors > 0 && totals.new_inserted === 0 ? "failed" : "done",
        rowsRead: totals.products_discovered,
        rowsNormalized: per_subdomain.reduce((a, p) => a + p.fetched, 0),
        rowsWritten: totals.new_inserted,
        rowsQuarantined: totals.quarantined,
        errors: totals.errors,
        events: events as unknown as Record<string, unknown>[],
        notes:
          options.dryRun === true
            ? `dry-run: walked ${totals.subdomains_walked} subdomains, would-fetch ${per_subdomain.reduce((a, p) => a + Math.min(p.new_urls, maxNew), 0)}`
            : `walked ${totals.subdomains_walked} subdomains, discovered ${totals.products_discovered}, inserted/updated ${totals.new_inserted}, quarantined ${totals.quarantined}`,
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      triggeredBy,
      per_subdomain,
      totals,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {});
    throw err;
  }
}

// Keep some imports referenced even if unused in this file (silences
// no-unused-imports if a future refactor temporarily drops a usage).
void inArray;

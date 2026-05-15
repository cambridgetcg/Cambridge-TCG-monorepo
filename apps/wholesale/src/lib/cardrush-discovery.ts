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
import { cards, games, sets, ingestRun, ingestQuarantine } from "@/lib/db/schema";
import { eq, and, sql, like, inArray, isNotNull } from "drizzle-orm";
import {
  KNOWN_SET_NAMES,
  getKnownSetName,
} from "@/lib/known-set-names";
import {
  fetchTcgdexSet,
  projectToColumns,
  tcgdexSupportsGame,
} from "@/lib/tcgdex/client";
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
  sets_created: number;
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
    new_sets_created: number;
    orphan_cards_relinked: number;
    tcgdex_enriched: number;
    tcgdex_names_lifted: number;
  };
  durationMs: number;
}

/**
 * Resolve `(gameId, setCode)` → `sets.id`, creating a placeholder row on
 * first sight. Cached for the lifetime of the discovery run. `created` is
 * true only for the call that actually inserted — cache hits and re-selects
 * after a write race return `created: false`. The new row uses `name` when
 * supplied (typically a curated value from `KNOWN_SET_NAMES`); otherwise
 * the code itself is used as the placeholder and the operator renames
 * later via `/api/admin/sets`.
 *
 * When `gameCode` is supplied and TCGdex carries that game (today: pokemon
 * only), a newly-created row is enriched inline with `tcgdex_*` fields
 * (kingdom-NNN second-witness, see `docs/connections/the-second-witness.md`).
 * Enrichment failures are non-fatal — the row is still created, the
 * post-backfill enrichment pass will retry on the next discovery run.
 */
async function ensureSetRow(
  gameId: number,
  setCode: string,
  cache: Map<string, number>,
  name?: string,
  gameCode?: string,
): Promise<{ id: number; created: boolean; tcgdexEnriched: boolean }> {
  const key = `${gameId}:${setCode}`;
  const hit = cache.get(key);
  if (hit !== undefined)
    return { id: hit, created: false, tcgdexEnriched: false };

  const existing = await db
    .select({ id: sets.id })
    .from(sets)
    .where(and(eq(sets.gameId, gameId), eq(sets.code, setCode)))
    .limit(1);
  if (existing.length > 0) {
    cache.set(key, existing[0].id);
    return { id: existing[0].id, created: false, tcgdexEnriched: false };
  }

  const inserted = await db
    .insert(sets)
    .values({ gameId, code: setCode, name: name ?? setCode, active: true })
    .onConflictDoNothing()
    .returning({ id: sets.id });
  if (inserted.length > 0) {
    cache.set(key, inserted[0].id);
    const enriched =
      gameCode && tcgdexSupportsGame(gameCode)
        ? await enrichSetWithTcgdex(inserted[0].id, setCode, name)
        : false;
    return { id: inserted[0].id, created: true, tcgdexEnriched: enriched };
  }

  // Race: another writer won the conflict. Re-select.
  const reselect = await db
    .select({ id: sets.id })
    .from(sets)
    .where(and(eq(sets.gameId, gameId), eq(sets.code, setCode)))
    .limit(1);
  cache.set(key, reselect[0].id);
  return { id: reselect[0].id, created: false, tcgdexEnriched: false };
}

/**
 * Fetch a set from TCGdex and write the `tcgdex_*` mirror columns onto
 * the existing `sets` row. Returns true if enrichment landed, false if
 * TCGdex returned null (set not found / timeout / etc.).
 *
 * If the caller's `name` arg was the placeholder (`= setCode`) — meaning
 * KNOWN_SET_NAMES had no curated value — and TCGdex has a real name,
 * also lifts `sets.name` to the TCGdex value in the same UPDATE. The
 * `name = code` guard protects operator-curated names.
 */
async function enrichSetWithTcgdex(
  setId: number,
  setCode: string,
  suppliedName?: string,
): Promise<boolean> {
  const t = await fetchTcgdexSet(setCode);
  if (!t) return false;

  const cols = projectToColumns(t);
  const isPlaceholder = !suppliedName || suppliedName === setCode;
  if (isPlaceholder) {
    // Lift the placeholder name to TCGdex's value in the same UPDATE.
    await db
      .update(sets)
      .set({ ...cols, name: t.name })
      .where(and(eq(sets.id, setId), eq(sets.name, sets.code)));
  } else {
    await db.update(sets).set(cols).where(eq(sets.id, setId));
  }
  return true;
}

/**
 * Post-backfill enrichment pass: walk every `sets` row where
 * tcgdex_fetched_at IS NULL AND game is a tcgdex-supported game, fetch
 * the TCGdex set, and UPDATE the row's `tcgdex_*` columns. Also lifts
 * placeholder names (`name = code`) to the TCGdex value in the same
 * UPDATE — operator-renamed sets are protected by the guard.
 *
 * Bounded at LIMIT 200 per run to keep TCGdex usage polite. Subsequent
 * cron ticks reduce the unvisited backlog by ~200 each, so the system
 * converges within days for the initial ~120 known pokemon sets.
 *
 * Returns the count of enriched + name-lifted rows. Failures are
 * non-fatal — the row stays unvisited and gets retried next tick.
 */
async function tcgdexPostBackfill(
  gameIdByCode: Map<string, number>,
): Promise<{ enriched: number; namesLifted: number }> {
  const supportedGameIds: number[] = [];
  for (const gameCode of SUPPORTED_GAMES_FOR_TCGDEX) {
    const id = gameIdByCode.get(gameCode);
    if (id !== undefined) supportedGameIds.push(id);
  }
  if (supportedGameIds.length === 0) return { enriched: 0, namesLifted: 0 };

  const unvisited = await db
    .select({ id: sets.id, code: sets.code, name: sets.name })
    .from(sets)
    .where(
      and(
        inArray(sets.gameId, supportedGameIds),
        isNotNull(sets.code),
        // Drizzle's typing for IS NULL on nullable columns needs sql.
        sql`${sets.tcgdexFetchedAt} IS NULL`,
      ),
    )
    .limit(200);

  let enriched = 0;
  let namesLifted = 0;
  for (const row of unvisited) {
    const t = await fetchTcgdexSet(row.code);
    if (!t) continue;
    const cols = projectToColumns(t);
    const placeholder = row.name === row.code;
    if (placeholder) {
      const res = await db
        .update(sets)
        .set({ ...cols, name: t.name })
        .where(and(eq(sets.id, row.id), eq(sets.name, sets.code)))
        .returning({ id: sets.id });
      if (res.length > 0) namesLifted += 1;
    } else {
      await db.update(sets).set(cols).where(eq(sets.id, row.id));
    }
    enriched += 1;
  }
  return { enriched, namesLifted };
}

/** Games TCGdex covers. Mirrors `tcgdexSupportsGame()` in the client. */
const SUPPORTED_GAMES_FOR_TCGDEX = ["pokemon"] as const;

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

    // Pre-loop backfill: link cards orphaned by earlier discovery runs to
    // their `sets` rows. Two idempotent steps:
    //   (a) INSERT placeholder `sets` rows for every (game_id, set_code)
    //       pairing referenced by orphan cards but missing from `sets`.
    //   (b) UPDATE cards.set_id from the matching `sets` row.
    // This is what unblocks legacy pokemon coverage (SV11W, SV1S, M1L, …)
    // that had been scraped into `cards` but never surfaced via the
    // `/api/v1/sets` endpoint (which filters by sets.active and joins on
    // cards.set_id). Skipped in dryRun. Failure does not abort the run —
    // the per-subdomain loop still runs and the operator can retry.
    let backfill_sets_created = 0;
    let backfill_cards_relinked = 0;
    let backfill_tcgdex_enriched = 0;
    let backfill_tcgdex_names_lifted = 0;
    if (!options.dryRun) {
      try {
        const createdRows = (await db.execute(sql`
          INSERT INTO sets (game_id, code, name, active)
          SELECT DISTINCT c.game_id, c.set_code, c.set_code, true
          FROM cards c
          LEFT JOIN sets s
            ON s.game_id = c.game_id AND s.code = c.set_code
          WHERE c.set_id IS NULL
            AND c.set_code IS NOT NULL
            AND c.set_code != ''
            AND c.game_id IS NOT NULL
            AND s.id IS NULL
          ON CONFLICT (game_id, code) DO NOTHING
          RETURNING id
        `)) as unknown as Array<{ id: number }>;
        backfill_sets_created = createdRows.length;

        const linkedRows = (await db.execute(sql`
          UPDATE cards c
          SET set_id = s.id
          FROM sets s
          WHERE c.set_id IS NULL
            AND c.set_code IS NOT NULL
            AND c.game_id = s.game_id
            AND c.set_code = s.code
          RETURNING c.id
        `)) as unknown as Array<{ id: number }>;
        backfill_cards_relinked = linkedRows.length;

        // Name-cleanup pass: any `sets` row whose name still equals its
        // code (placeholder from a prior auto-create) gets upgraded to
        // the curated name from KNOWN_SET_NAMES. Bounded by map size
        // (~120 entries), one round-trip per entry but each is a single
        // indexed UPDATE on (game_id, code). Operator-renamed sets are
        // protected by the `name = code` guard.
        let backfill_names_filled = 0;
        for (const [key, name] of Object.entries(KNOWN_SET_NAMES)) {
          const [gameCode, setCode] = key.split(":");
          const gameId = gameIdByCode.get(gameCode);
          if (gameId === undefined) continue;
          const updated = (await db.execute(sql`
            UPDATE sets
            SET name = ${name}
            WHERE game_id = ${gameId}
              AND code = ${setCode}
              AND name = code
            RETURNING id
          `)) as unknown as Array<{ id: number }>;
          backfill_names_filled += updated.length;
        }

        event("orphan_set_backfill", {
          sets_created: backfill_sets_created,
          cards_relinked: backfill_cards_relinked,
          names_filled: backfill_names_filled,
        });

        // Second-witness pass: fetch TCGdex for any pokemon set we
        // haven't enriched yet. Idempotent — bounded at 200 per run.
        // See `docs/connections/the-second-witness.md`.
        try {
          const tcgdex = await tcgdexPostBackfill(gameIdByCode);
          backfill_tcgdex_enriched = tcgdex.enriched;
          backfill_tcgdex_names_lifted = tcgdex.namesLifted;
          event("tcgdex_post_backfill", {
            enriched: tcgdex.enriched,
            names_lifted: tcgdex.namesLifted,
          });
        } catch (err) {
          event("tcgdex_post_backfill_failed", {
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      } catch (err) {
        event("orphan_set_backfill_failed", {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Cache (gameId:setCode) → setId across the run so the per-card
    // ensureSetRow call hits the DB once per set, not once per card.
    const setIdCache = new Map<string, number>();

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
        sets_created: 0,
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

        // Resolve sets.id, auto-creating a placeholder row when this is
        // the first card we've seen for this set_code. Without this, the
        // `/api/v1/sets` endpoint (which joins on cards.set_id) would not
        // surface the new set on the storefront price guide. The curated
        // KNOWN_SET_NAMES map provides the human-readable name when
        // available; new-to-the-registry codes fall back to placeholder.
        const curatedName = getKnownSetName(entry.game, md.set_code);
        const setResolution = await ensureSetRow(
          gameId,
          md.set_code,
          setIdCache,
          curatedName ?? undefined,
          entry.game,
        );
        if (setResolution.created) {
          result.sets_created += 1;
          event("set_auto_created", {
            host,
            game_code: entry.game,
            set_code: md.set_code,
            set_id: setResolution.id,
            tcgdex_enriched: setResolution.tcgdexEnriched,
          });
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
            setId: setResolution.id,
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
              setId: sql`COALESCE(${cards.setId}, EXCLUDED.set_id)`,
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
      new_sets_created:
        backfill_sets_created +
        per_subdomain.reduce((a, p) => a + p.sets_created, 0),
      orphan_cards_relinked: backfill_cards_relinked,
      tcgdex_enriched: backfill_tcgdex_enriched,
      tcgdex_names_lifted: backfill_tcgdex_names_lifted,
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

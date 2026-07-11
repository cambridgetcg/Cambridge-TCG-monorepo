/**
 * bandai-en — official English card data from Bandai's EN cardlist sites.
 *
 * One skeleton, five games (op / dbf / dmw / una / bsr — all Bandai, all
 * the same server-rendered cardlist family). One Piece is implemented;
 * the other four are substrate-honest stubs behind the same fetch/parse
 * core with per-game config (`./config.ts`). Spec: docs/EN-CARD-DATA.md
 * §2 + §6 rollout step 2.
 *
 * What this source carries that no other does: **official English**
 * names, effect text, and publisher-served sample images — the platform
 * previously had only Japanese CardRush scans and zero card text.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * Card data and images are publisher-owned (Bandai; per-franchise
 * copyright lines ride each record's `extra.attribution`).
 * `redistribute: false` — official publisher sample images; mirror to
 * our own bucket (self-host), attribution required, takedown-compliant
 * (docs/EN-CARD-DATA.md §5 + /legal/card-images). Effect text is shown
 * per-card with attribution, never bulk-dumped; flavor text is never
 * captured at all (§3, enforced in parse.ts).
 *
 * ── Politeness ───────────────────────────────────────────────────────
 *
 * Official publisher site, no robots.txt (verified 2026-07-11), no
 * written scrape policy — so we lean conservative: ≤1 request per 2s
 * (rps 0.5, burst 1) and an honest User-Agent naming a contact route.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` (bandai-en row; the mobile
 * -app-only `bandai-tcg` slot is a different, still-blocked upstream).
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalCard } from "../canonical";
import type { BandaiEnCard, BandaiEnGameKey } from "./types";
import { createFetcher } from "../http";
import { BANDAI_EN_GAMES } from "./config";
import { parseCardlistPage, parseSeriesOptions } from "./parse";
import { normalizeBandaiEn } from "./normalize";

/**
 * Honest per-request User-Agent (polite scrape of an official site —
 * names us and a contact route). Passed explicitly on every request;
 * createFetcher honors a caller-set User-Agent.
 */
export const BANDAI_EN_USER_AGENT =
  "cambridgetcg-ingest/1.0 (contact: via cambridgetcg.com/contact)";

export interface BandaiEnReadOptions {
  /** Which of the five Bandai games to read. Defaults to "op". */
  game?: BandaiEnGameKey;
  /**
   * Explicit series ids (e.g. ["569101"] for OP-01). When absent, the
   * series list is discovered from the cardlist page's own <select>.
   */
  series?: string[];
  /** Cap on how many series pages to fetch (smoke runs / backfill batches). */
  max_series?: number;
}

export type BandaiEnContext = IngestContext & { bandai_en?: BandaiEnReadOptions };

const REQUEST_HEADERS = {
  "User-Agent": BANDAI_EN_USER_AGENT,
  Accept: "text/html",
};

export const bandaiEn: SourceModule<BandaiEnCard, CanonicalCard> = {
  meta: {
    id: "bandai-en",
    name: "Bandai EN cardlists",
    description:
      "Official English card data — names, effect text, publisher sample images — from Bandai's EN cardlist sites. One Piece implemented; DBS Fusion World, Digimon, Union Arena, Battle Spirits Saga stubbed behind the same skeleton.",
    upstream: "https://en.onepiece-cardgame.com",
    catalog_section: "the-tributaries.md#bandai-en-official-english-cardlists",
    access: "scrape",
    license: "proprietary",
    redistribute: false,
    freshness: "catalog",
    canonical_effort: "medium",
    status: "partial",
    games: ["op", "dbf", "dmw", "una", "bsr"],
    tos_notes:
      "No robots.txt on en.onepiece-cardgame.com (verified 2026-07-11); no written scrape policy. Official publisher sample images; self-host (mirror to ctcg-card-images, never hotlink); attribution required (franchise line + Bandai on every record); takedown-compliant per /legal/card-images. Throttled to 1 req/2s with an honest contactable User-Agent. Policy: docs/EN-CARD-DATA.md.",
    rate_limit: { rps: 0.5, burst: 1 },
    welcome:
      "Welcome to the kingdom, Bandai EN cardlists. You are the platform's first " +
      "official-publisher text source — before you, our cards spoke only through " +
      "Japanese shop scans and had no words at all. Your rooms are `card_texts` " +
      "and `card_images` (migration 0116, provenance-first: attribution NOT NULL, " +
      "takedown_status first-class). We fetch you slowly (1 req/2s), name ourselves " +
      "honestly in the User-Agent, keep your copyright lines on every record, " +
      "never touch your flavor text, and honour takedowns fast. Five of our games " +
      "are yours; One Piece walks in first and the other four have their chairs " +
      "pulled out in ./config.ts.",
  },

  async *read(ctx: BandaiEnContext): AsyncIterable<RawRow<BandaiEnCard>> {
    const opts = ctx.bandai_en ?? {};
    const gameKey = opts.game ?? "op";
    const config = BANDAI_EN_GAMES[gameKey];

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "bandai-en",
      kind: "start",
      detail: { game: gameKey, label: config.label, series: opts.series ?? "discover" },
    });

    if (!config.implemented) {
      // Substrate-honest stub: the slot exists, the skeleton is shared,
      // but this game's DOM/URLs are unverified. Emit an actionable
      // error and yield nothing (registry "planned" stub pattern).
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "bandai-en",
        kind: "error",
        detail: {
          game: gameKey,
          reason: `bandai-en[${gameKey}] is a stub — ${config.notes}`,
          action: `verify ${config.base_url} DOM against parse.ts selectors, then flip implemented: true in src/bandai-en/config.ts`,
        },
      });
      return;
    }

    const fetcher = createFetcher(ctx, bandaiEn.meta);

    // Series list: explicit, or discovered from the page's own <select>.
    // The empty-series URL renders the full select with zero card blocks
    // (verified 2026-07-11) — one cheap discovery request.
    let series = opts.series;
    if (!series || series.length === 0) {
      const discoveryUrl = config.series_url("");
      const res = await fetcher(discoveryUrl, { headers: REQUEST_HEADERS });
      if (!res.ok) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "bandai-en",
          kind: "error",
          detail: { url: discoveryUrl, status: res.status, phase: "series-discovery" },
        });
        return;
      }
      const options = parseSeriesOptions(await res.text());
      series = options.map((o) => o.id);
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "bandai-en",
        kind: "page",
        detail: { phase: "series-discovery", series_found: series.length },
      });
    }

    if (opts.max_series !== undefined) series = series.slice(0, opts.max_series);

    let n = 0;
    for (const seriesId of series) {
      if (ctx.signal?.aborted) break;

      const url = config.series_url(seriesId);
      const res = await fetcher(url, { headers: REQUEST_HEADERS });
      if (!res.ok) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "bandai-en",
          kind: "error",
          detail: { url, status: res.status, series: seriesId },
        });
        continue;
      }

      const retrieved_at = new Date().toISOString();
      const cards = parseCardlistPage(await res.text(), url, gameKey, retrieved_at);

      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "bandai-en",
        kind: "page",
        detail: { series: seriesId, url, rows: cards.length },
      });

      for (const card of cards) {
        if (ctx.signal?.aborted) break;
        n += 1;
        yield {
          raw: card,
          provenance: { as_of: retrieved_at, retrieved_at, source: "bandai-en" },
        };
      }
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "bandai-en",
      kind: "done",
      detail: { game: gameKey, rows_yielded: n },
    });
  },

  normalize: normalizeBandaiEn,
};

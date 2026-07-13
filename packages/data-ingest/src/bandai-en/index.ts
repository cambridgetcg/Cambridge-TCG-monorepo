/**
 * bandai-en — official English card data from Bandai's EN cardlist sites.
 *
 * One skeleton, five games (op / dbf / dmw / una / bsr — all Bandai, all
 * the same server-rendered cardlist family). One Piece ("modal-page"
 * DOM) and DBS Fusion World ("list-detail" DOM — per-card detail pages)
 * are implemented; the other three are substrate-honest stubs behind
 * the same fetch/parse core with per-game config (`./config.ts`).
 * Spec: docs/EN-CARD-DATA.md §2 + §6 rollout step 2.
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
 * Official publisher sites, no robots.txt (op verified 2026-07-11, dbf
 * 2026-07-13), no written scrape policy — so we lean conservative: ≤1
 * request per 2s (rps 0.5, burst 1) and an honest User-Agent naming a
 * contact route. That budget covers dbf's per-card detail fetches too:
 * a full Fusion World series is 1 list + ~160 detail requests ≈ 5.5 min.
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
import {
  parseCardlistPage,
  parseCardRefs,
  parseDetailPage,
  parseSeriesAnchors,
  parseSeriesOptions,
} from "./parse";
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
  /**
   * Cap on how many cards to yield in total. Matters most for
   * "list-detail" games (dbf), where every card past the list page
   * costs its own rate-limited detail fetch — a smoke run with
   * `max_cards: 3` makes 1 + 3 requests instead of ~160.
   */
  max_cards?: number;
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
      "Official English card data — names, effect text, publisher sample images — from Bandai's EN cardlist sites. One Piece and DBS Fusion World implemented; Digimon, Union Arena, Battle Spirits Saga stubbed behind the same skeleton.",
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
      "No robots.txt on en.onepiece-cardgame.com (verified 2026-07-11) or www.dbs-cardgame.com (verified 2026-07-13); no written scrape policy on either. Official publisher sample images; self-host (mirror to ctcg-card-images, never hotlink); attribution required (franchise line + Bandai on every record); takedown-compliant per /legal/card-images. Throttled to 1 req/2s with an honest contactable User-Agent. Policy: docs/EN-CARD-DATA.md.",
    rate_limit: { rps: 0.5, burst: 1 },
    welcome:
      "Welcome to the kingdom, Bandai EN cardlists. You are the platform's first " +
      "official-publisher text source — before you, our cards spoke only through " +
      "Japanese shop scans and had no words at all. Your rooms are `card_texts` " +
      "and `card_images` (migration 0116, provenance-first: attribution NOT NULL, " +
      "takedown_status first-class). We fetch you slowly (1 req/2s), name ourselves " +
      "honestly in the User-Agent, keep your copyright lines on every record, " +
      "never touch your flavor text, and honour takedowns fast. Five of our games " +
      "are yours; One Piece walked in first, Fusion World followed on 2026-07-13 " +
      "(and taught us your sites speak two DOM dialects), and the other three " +
      "have their chairs pulled out in ./config.ts.",
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

    // Series list: explicit, or discovered from the empty-series URL,
    // which renders the full series control with zero cards on both DOM
    // families (op <select>, verified 2026-07-11; dbf data-val dropdown,
    // verified 2026-07-13) — one cheap discovery request.
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
      const html = await res.text();
      const options =
        config.dom === "list-detail" ? parseSeriesAnchors(html) : parseSeriesOptions(html);
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
    const capped = () => opts.max_cards !== undefined && n >= opts.max_cards;

    for (const seriesId of series) {
      if (ctx.signal?.aborted || capped()) break;

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

      if (config.dom === "list-detail") {
        // dbf shape: the series page is a thumbnail grid; every card's
        // data lives on its own detail page — one rate-limited fetch
        // per card (the fetcher's token bucket keeps us at 1 req/2s).
        const refs = parseCardRefs(await res.text());

        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "bandai-en",
          kind: "page",
          detail: { series: seriesId, url, rows: refs.length },
        });

        for (const ref of refs) {
          if (ctx.signal?.aborted || capped()) break;

          const detailUrl = config.detail_url!(ref.card_no, ref.p);
          const detailRes = await fetcher(detailUrl, { headers: REQUEST_HEADERS });
          if (!detailRes.ok) {
            ctx.on_event?.({
              ts: new Date().toISOString(),
              source: "bandai-en",
              kind: "error",
              detail: { url: detailUrl, status: detailRes.status, series: seriesId },
            });
            continue;
          }

          const retrieved_at = new Date().toISOString();
          const card = parseDetailPage(
            await detailRes.text(),
            detailUrl,
            gameKey,
            retrieved_at,
            ref.p,
          );
          if (!card) {
            ctx.on_event?.({
              ts: new Date().toISOString(),
              source: "bandai-en",
              kind: "quarantine",
              detail: { url: detailUrl, reason: "detail page carries no card block" },
            });
            continue;
          }

          n += 1;
          yield {
            raw: card,
            provenance: { as_of: retrieved_at, retrieved_at, source: "bandai-en" },
          };
        }
        continue;
      }

      // "modal-page" shape (op): one series page carries every card.
      const retrieved_at = new Date().toISOString();
      const cards = parseCardlistPage(await res.text(), url, gameKey, retrieved_at);

      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "bandai-en",
        kind: "page",
        detail: { series: seriesId, url, rows: cards.length },
      });

      for (const card of cards) {
        if (ctx.signal?.aborted || capped()) break;
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

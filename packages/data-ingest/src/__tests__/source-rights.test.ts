import { describe, expect, it, vi } from "vitest";
import { scryfall } from "../scryfall";
import { pokemonTcgApi } from "../pokemon-tcg-api";
import { ygoprodeck } from "../ygoprodeck";
import { tcgplayer, TCGPLAYER_ACQUISITION_ENABLED } from "../tcgplayer";
import { mintTcgplayerToken, TCGPLAYER_ACCESS_BLOCKED_MESSAGE } from "../tcgplayer/oauth";
import { cardmarket } from "../cardmarket";
import {
  cardrush,
  CARDRUSH_ACQUISITION_ENABLED,
  scrapeCardRush,
} from "../cardrush";
import {
  createDiscoveryFetcher,
  fetchAndParseProduct as fetchAndParseCardrushProduct,
} from "../cardrush/discovery";
import {
  tcgcollector,
  TCGCOLLECTOR_ACQUISITION_ENABLED,
  scrapeOne as scrapeOneTcgcollector,
} from "../tcgcollector";
import { fetchSitemap as fetchTcgcollectorSitemap } from "../tcgcollector/discovery";
import { getSource, legacyAcquisitionClosed, legacyArchiveFreshness, sourcesByStatus } from "../registry";
import { MEMBER_PRICE_POLICIES } from "../member-prices";
import { FRESHNESS } from "@cambridge-tcg/data-spec";
import type { IngestEvent, SourceModule } from "../types";

async function drain(source: SourceModule<unknown, unknown>, events: IngestEvent[]) {
  const fetch = vi.fn(() => {
    throw new Error("a blocked source must not touch the network");
  }) as unknown as typeof globalThis.fetch;

  for await (const _row of source.read({
    bearer: "accidental-secret",
    fetch,
    on_event: (event) => events.push(event),
  })) {
    throw new Error("a blocked source must not yield rows");
  }

  return fetch;
}

describe("source rights declarations", () => {
  it.each([
    ["scryfall", scryfall],
    ["pokemon-tcg-api", pokemonTcgApi],
  ] as const)("keeps %s policy-governed upstream bytes non-redistributable", (_id, source) => {
    expect(source.meta.license).toBe("proprietary");
    expect(source.meta.redistribute).toBe(false);
    expect(source.meta.license_spdx).toBeUndefined();
    expect(source.meta.status).toBe("partial");
  });

  it.each([
    ["ygoprodeck", ygoprodeck],
    ["tcgcollector", tcgcollector],
  ] as const)("hard-blocks %s until written rights or approval exist", async (_id, source) => {
    const events: IngestEvent[] = [];
    const fetch = await drain(source, events);

    expect(source.meta.status).toBe("blocked");
    expect(source.meta.license).toBe("proprietary");
    expect(source.meta.redistribute).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("error");
    expect(String(events[0]?.detail.status)).toContain("blocked");
  });

  // Yu, 2026-10-28: written permission for TCGplayer pages. Collection runs
  // only through the evidence-gated price-guide collector; the API reader
  // stays locked whatever its meta says.
  it("keeps the TCGplayer API reader locked while its meta names the page collector", async () => {
    const events: IngestEvent[] = [];
    const fetch = await drain(tcgplayer, events);

    expect(tcgplayer.meta).toMatchObject({ access: "scrape", license: "internal-only", redistribute: false, status: "partial", rate_limit: { rps: 0.1, burst: 1 } });
    expect(tcgplayer.meta.user_agent_suffix).toBe("(tcgplayer-collector; permission tcgplayer/2026-10-28.1)");
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("error");
    expect(String(events[0]?.detail.status)).toContain("blocked");
  });

  it("hard-blocks every CardRush adapter before network access", async () => {
    const events: IngestEvent[] = [];
    const fetch = await drain(cardrush, events);
    const fetcher = vi.fn(() => {
      throw new Error("CardRush fetcher must remain untouched");
    });
    Object.assign(fetcher, { via_proxy_label: null });

    const scraped = await scrapeCardRush("https://www.cardrush-op.jp/product/1", {
      fetch: fetch as typeof globalThis.fetch,
    });
    const discovered = await fetchAndParseCardrushProduct(
      "https://www.cardrush-op.jp/product/1",
      fetcher as never,
    );

    expect(CARDRUSH_ACQUISITION_ENABLED).toBe(false);
    // The page collector (cardrush/member-prices.ts) is the one open path;
    // the module turns partial while every legacy adapter stays blocked.
    expect(cardrush.meta.status).toBe("partial");
    expect(cardrush.meta.redistribute).toBe(false);
    expect(scraped.raw.error_reason).toContain("acquisition_blocked");
    expect(discovered.error_reason).toContain("acquisition_blocked");
    expect(() => createDiscoveryFetcher({ fetch: fetch as typeof globalThis.fetch })).toThrow(
      /blocked/i,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(events[0]?.detail.status).toContain("blocked");
  });

  it("hard-blocks TCGCollector read, direct scrape, and sitemap helpers", async () => {
    const events: IngestEvent[] = [];
    const fetch = await drain(tcgcollector, events);
    const fetcher = vi.fn(() => {
      throw new Error("TCGCollector fetcher must remain untouched");
    });
    Object.assign(fetcher, { via_proxy_label: null });

    const direct = await scrapeOneTcgcollector(
      "https://www.tcgcollector.com/cards/example",
      fetcher as never,
    );
    const sitemap = await fetchTcgcollectorSitemap(fetcher as never);

    expect(TCGCOLLECTOR_ACQUISITION_ENABLED).toBe(false);
    expect(tcgcollector.meta.status).toBe("blocked");
    expect(tcgcollector.meta.access).toBe("partner");
    expect(direct.error_reason).toContain("acquisition_blocked");
    expect(sitemap.error_reason).toContain("acquisition_blocked");
    expect(fetch).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(events[0]?.detail.status).toContain("blocked");
  });

  it("names Cardmarket's public files as the next path without probing OAuth", async () => {
    const events: IngestEvent[] = [];
    const fetch = await drain(cardmarket, events);

    expect(cardmarket.meta.access).toBe("public-file");
    expect(cardmarket.meta.status).toBe("partial");
    // One daily run: past a day and its late-run margin is stale, not past
    // five minutes as price_current would say.
    expect(cardmarket.meta.freshness).toBe("daily_file");
    expect(FRESHNESS.daily_file).toBeGreaterThan(24 * 60 * 60);
    expect(FRESHNESS.daily_file).toBeLessThan(2 * 24 * 60 * 60);
    expect(cardmarket.meta.license).toBe("proprietary");
    expect(cardmarket.meta.redistribute).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(events[0]?.detail.status).toBe("legacy-oauth-blocked");
    expect(String(events[0]?.detail.next_action)).not.toMatch(/apply/i);
  });

  it("refuses TCGplayer token minting before the fetcher can run", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("token fetcher must remain untouched");
    });

    await expect(
      mintTcgplayerToken(
        { client_id: "accidental-id", client_secret: "accidental-secret" },
        fetcher as never,
      ),
    ).rejects.toThrow(/blocked/i);
    expect(fetcher).not.toHaveBeenCalled();
    // The 2026-10-28 permission covers pages, not the API: the message says
    // the API is closed without saying no permission exists.
    expect(TCGPLAYER_ACCESS_BLOCKED_MESSAGE).toContain("grants no new API access");
    expect(TCGPLAYER_ACCESS_BLOCKED_MESSAGE).not.toMatch(/no recorded written approval/i);
  });

  it("separates implemented planned sources from empty reserved slots", () => {
    const partition = sourcesByStatus();

    expect(partition.partial.map((source) => source.id)).toContain("cardmarket");
    expect(partition.reserved_slots).not.toContain("cardmarket");
    expect(partition.reserved_slots).toContain("cardtrader");
  });

  it("does not let mutable SourceMeta unlock dormant network readers", async () => {
    const originalTcgplayerStatus = tcgplayer.meta.status;
    const originalCardmarketStatus = cardmarket.meta.status;
    const originalYgoprodeckStatus = ygoprodeck.meta.status;
    const originalCardrushStatus = cardrush.meta.status;
    const originalTcgcollectorStatus = tcgcollector.meta.status;
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    try {
      tcgplayer.meta.status = "partial";
      cardmarket.meta.status = "partial";
      ygoprodeck.meta.status = "partial";
      cardrush.meta.status = "partial";
      tcgcollector.meta.status = "partial";

      for await (const _row of tcgplayer.read({
        bearer: "accidental-bearer",
        fetch: fetch as typeof globalThis.fetch,
        tcgplayer: { mode: "catalog" },
      })) {
        throw new Error("TCGplayer lock must not yield rows");
      }

      for await (const _row of cardmarket.read({
        fetch: fetch as typeof globalThis.fetch,
        cardmarket: {
          creds: {
            appToken: "accidental-app-token",
            appSecret: "accidental-app-secret",
            accessToken: "accidental-access-token",
            accessTokenSecret: "accidental-access-secret",
          },
          productIds: [123],
        },
      })) {
        throw new Error("Cardmarket legacy lock must not yield rows");
      }

      for await (const _row of ygoprodeck.read({
        fetch: fetch as typeof globalThis.fetch,
      })) {
        throw new Error("YGOPRODeck lock must not yield rows");
      }

      for await (const _row of cardrush.read({
        fetch: fetch as typeof globalThis.fetch,
        cardrush: { urls: [{ url: "https://www.cardrush-op.jp/product/1" }] },
      })) {
        throw new Error("CardRush lock must not yield rows");
      }

      for await (const _row of tcgcollector.read({
        fetch: fetch as typeof globalThis.fetch,
        tcgcollector: { urls: ["https://www.tcgcollector.com/cards/example"] },
      })) {
        throw new Error("TCGCollector lock must not yield rows");
      }
    } finally {
      tcgplayer.meta.status = originalTcgplayerStatus;
      cardmarket.meta.status = originalCardmarketStatus;
      ygoprodeck.meta.status = originalYgoprodeckStatus;
      cardrush.meta.status = originalCardrushStatus;
      tcgcollector.meta.status = originalTcgcollectorStatus;
    }

    expect(fetch).not.toHaveBeenCalled();
  });

  // CardRush and TCGplayer turned partial because their page collectors
  // exist, but the legacy archive their old paths filled is still frozen.
  // Copy about that archive reads the locks, so a status change cannot alter it.
  it("answers legacy acquisition from the code locks, not from status", () => {
    expect(TCGPLAYER_ACQUISITION_ENABLED).toBe(false);
    expect([cardrush.meta.status, tcgplayer.meta.status]).toEqual(["partial", "partial"]);
    expect(legacyAcquisitionClosed("cardrush")).toBe(true);
    expect(legacyAcquisitionClosed("tcgplayer")).toBe(true);
    expect(legacyAcquisitionClosed({ id: "cardrush", status: "shipped" })).toBe(true);
    // Without a lock, the status answers, as archive copy always read it.
    expect(legacyAcquisitionClosed("ygoprodeck")).toBe(true);
    expect(legacyAcquisitionClosed("cardmarket")).toBe(false);
    expect(legacyAcquisitionClosed({ id: "ebay", status: "blocked" })).toBe(true);
    expect(legacyAcquisitionClosed("not-a-registered-source")).toBe(false);

    const original = tcgplayer.meta.status;
    try {
      tcgplayer.meta.status = "shipped";
      expect(legacyAcquisitionClosed("tcgplayer")).toBe(true);
    } finally {
      tcgplayer.meta.status = original;
    }
  });

  // Ids reach these from URLs and archive rows. An inherited name is not a
  // registered source: it neither throws nor answers as one.
  it.each(["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"])("treats the inherited name %s as an unknown id", (id) => {
    expect(getSource(id as never)).toBeUndefined();
    expect(legacyAcquisitionClosed(id)).toBe(false);
    expect(legacyAcquisitionClosed({ id, status: "blocked" })).toBe(true);
    expect(legacyArchiveFreshness({ id, freshness: "catalog" })).toBe("catalog");
  });

  // Archive rows keep the budget their source declared before its
  // collector; the metas now carry the collectors' (page_collector,
  // daily_file). The registry is the one answer, Cardmarket's included.
  it("measures legacy archive rows by the budget their source declared before its collector", () => {
    expect([cardrush, tcgplayer, cardmarket].map((source) => source.meta.freshness)).toEqual(["page_collector", "page_collector", "daily_file"]);
    expect([cardrush, tcgplayer, cardmarket].map((source) => legacyArchiveFreshness(source.meta))).toEqual(["price_current", "price_current", "price_current"]);
    expect(legacyArchiveFreshness({ id: "cardrush", freshness: "daily_file" })).toBe("price_current");
    expect(legacyArchiveFreshness(ygoprodeck.meta)).toBe("catalog");
    // A budget is not a lock: Cardmarket's archive rows are not closed.
    expect(legacyAcquisitionClosed("cardmarket")).toBe(false);
  });

  it.each([
    ["cardrush", cardrush, "DATA_COLLECT_CARDRUSH"],
    ["tcgplayer", tcgplayer, "DATA_COLLECT_TCGPLAYER"],
  ] as const)("keeps %s meta true whether or not its collector is scheduled", (_id, source, flag) => {
    // Health compares the latest member_price_batches row with this budget:
    // the page collectors' own key, not the card catalog's.
    expect(source.meta.freshness).toBe("page_collector");
    // Two-hourly and hourly runs: a missed run or two stays within budget,
    // and a full round of CardRush's six hosts with no batch is past twice it.
    expect(FRESHNESS.page_collector).toBeGreaterThanOrEqual(2 * 2 * 60 * 60);
    expect(2 * FRESHNESS.page_collector).toBeLessThanOrEqual(6 * 2 * 60 * 60);
    for (const text of [source.meta.description, source.meta.welcome ?? ""]) {
      expect(text).toContain("only while it is scheduled");
      expect(text).toContain("/api/v1/sources");
      expect(text).not.toMatch(/\bWe read\b/);
    }
    expect(source.meta.description).toContain(flag);
    expect(source.meta.tos_notes).not.toMatch(/open with Yu|question/i);
  });

  // Yu confirmed on 2026-10-29 that "Scrape TCGplayer pages" covers the data
  // the price-guide page loads (decision record). These fields are public
  // from deploy (/api/v1/sources, /api/v1/sources/welcome), so they say so
  // plainly, leave scheduling to the flag, and name no API host.
  it("says TCGplayer's permission covers its price-guide reads, and names no API host", () => {
    const { description, tos_notes, welcome } = tcgplayer.meta;
    for (const text of [description, tos_notes, welcome ?? ""]) {
      expect(text).not.toMatch(/api\.tcgplayer\.com|mpapi\.|infinite-api\./);
      expect(text).not.toMatch(/stays? off until|awaits confirmation|scope is confirmed/i);
    }
    expect(description).toContain("covers collection from TCGplayer pages, including the data TCGplayer's public price-guide pages load (confirmed 2026-10-29)");
    expect(tos_notes).toContain("Yu confirmed on 2026-10-29 that the permission covers those requests");
    expect(welcome).toContain("reads them only while it is scheduled");
    expect(MEMBER_PRICE_POLICIES.tcgplayer.basis).toContain("The permission covers the data TCGplayer's public price-guide pages load (confirmed 2026-10-29)");
    expect(MEMBER_PRICE_POLICIES.tcgplayer.basis).not.toMatch(/stays? off until|scope is confirmed|api\.tcgplayer\.com|mpapi\.|infinite-api\./);
  });
});

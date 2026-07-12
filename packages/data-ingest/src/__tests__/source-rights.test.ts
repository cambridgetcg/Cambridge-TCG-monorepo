import { describe, expect, it, vi } from "vitest";
import { scryfall } from "../scryfall";
import { pokemonTcgApi } from "../pokemon-tcg-api";
import { ygoprodeck } from "../ygoprodeck";
import { tcgplayer } from "../tcgplayer";
import { mintTcgplayerToken } from "../tcgplayer/oauth";
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
import { sourcesByStatus } from "../registry";
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
    ["tcgplayer", tcgplayer],
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
    expect(cardrush.meta.status).toBe("blocked");
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
    expect(cardmarket.meta.status).toBe("planned");
    expect(cardmarket.meta.license).toBe("proprietary");
    expect(cardmarket.meta.redistribute).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(events[0]?.detail.status).toBe("public-file-reader-not-wired");
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
  });

  it("separates implemented planned sources from empty reserved slots", () => {
    const partition = sourcesByStatus();

    expect(partition.planned.map((source) => source.id)).toContain("cardmarket");
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
});

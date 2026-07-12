import { describe, expect, it, vi } from "vitest";

import { cardmarket } from "../cardmarket";
import { pokemonTcgApi } from "../pokemon-tcg-api";
import {
  getOrCreateFetcher as getTcgcollectorFetcher,
  scrapeOne as scrapeTcgcollectorOne,
  tcgcollector,
} from "../tcgcollector";
import { fetchSitemap as fetchTcgcollectorSitemap } from "../tcgcollector/discovery";
import { createFetcher, type Fetcher } from "../http";
import { ebay, type EbayContext } from "../ebay";
import { tcgplayer } from "../tcgplayer";
import type { IngestEvent, SourceModule } from "../types";

async function runBlockedReader(module: SourceModule<unknown, unknown>) {
  const events: IngestEvent[] = [];
  const fetchSpy = vi.fn(async () => {
    throw new Error("A blocked reader attempted the network.");
  }) as unknown as typeof fetch;
  const rows: unknown[] = [];

  for await (const row of module.read({
    fetch: fetchSpy,
    bearer: "historical-credential-must-not-unlock-access",
    app_token: "historical-credential-must-not-unlock-access",
    on_event: (event) => events.push(event),
  })) {
    rows.push(row);
  }

  return { events, fetchSpy, rows };
}

describe("blocked source readers", () => {
  it.each([
    ["Cardmarket", cardmarket],
    ["legacy Pokémon TCG API", pokemonTcgApi],
    ["TCGCollector", tcgcollector],
  ])("keeps %s offline even when credentials are supplied", async (_name, module) => {
    const result = await runBlockedReader(module);

    expect(result.fetchSpy).not.toHaveBeenCalled();
    expect(result.rows).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.kind).toBe("error");
    expect(result.events[0]?.detail).toMatchObject({ blocked: true });
  });

  it("blocks TCGCollector's direct discovery helpers before network access", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("TCGCollector attempted the network.");
    }) as unknown as Fetcher;

    const sitemap = await fetchTcgcollectorSitemap(fetchSpy, { max_urls: 5000 });
    const page = await scrapeTcgcollectorOne(
      "https://www.tcgcollector.com/cards/pokemon/test/test",
      fetchSpy,
    );

    expect(sitemap).toMatchObject({
      ok: false,
      product_urls: [],
      error_reason: "blocked_no_fetch_partner_approval_required",
    });
    expect(page.error_reason).toBe("blocked_no_fetch_partner_approval_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to construct no-fetch source clients even with a proxy or injected fetch", () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch;

    expect(() =>
      createFetcher(
        { fetch: fetchSpy },
        tcgcollector.meta,
        { proxy_url: "http://proxy.example.test" },
      ),
    ).toThrow(/no-fetch rights review/);
    expect(() =>
      getTcgcollectorFetcher({ fetch: fetchSpy }),
    ).toThrow(/blocked\/no-fetch/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not treat contract-source credentials as approval", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("contract-only source attempted the network");
    }) as unknown as typeof fetch;

    expect(() =>
      createFetcher({ fetch: fetchSpy, bearer: "credential-only" }, tcgplayer.meta),
    ).toThrow(/contract-only/);

    const tcgRead = async () => {
      for await (const _row of tcgplayer.read({
        fetch: fetchSpy,
        bearer: "credential-only",
      })) {
        // no rows expected
      }
    };
    await expect(tcgRead()).rejects.toThrow(/contract-only/);

    const ebayCtx: EbayContext = {
      fetch: fetchSpy,
      ebay: {
        access_token: "credential-only",
        watch_list: [{ sku: "op-op01-001-en" }],
      },
    };
    const ebayRead = async () => {
      for await (const _row of ebay.read(ebayCtx)) {
        // no rows expected
      }
    };
    await expect(ebayRead()).rejects.toThrow(/contract-only/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

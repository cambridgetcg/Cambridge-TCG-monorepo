import { describe, expect, it, vi } from "vitest";
import { scryfall } from "../scryfall";
import { pokemonTcgApi } from "../pokemon-tcg-api";
import { ygoprodeck } from "../ygoprodeck";
import { tcgplayer } from "../tcgplayer";
import { mintTcgplayerToken } from "../tcgplayer/oauth";
import { cardmarket } from "../cardmarket";
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
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    try {
      tcgplayer.meta.status = "partial";
      cardmarket.meta.status = "partial";

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
    } finally {
      tcgplayer.meta.status = originalTcgplayerStatus;
      cardmarket.meta.status = originalCardmarketStatus;
    }

    expect(fetch).not.toHaveBeenCalled();
  });
});

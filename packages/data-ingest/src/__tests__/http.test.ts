import { describe, expect, it } from "vitest";
import { createFetcher } from "../http";
import { scryfall } from "../scryfall";

describe("createFetcher", () => {
  it("counts the requests it has served, live", async () => {
    const fetcher = createFetcher(
      { fetch: (async () => new Response("{}")) as unknown as typeof fetch, rate_limit: { rps: 1000, burst: 10 } },
      scryfall.meta,
    );
    expect(fetcher.count).toBe(0);
    await fetcher("https://example.test/a");
    await fetcher("https://example.test/b");
    expect(fetcher.count).toBe(2);
    expect(fetcher.via_proxy).toBeNull();
    expect(fetcher.via_proxy_label).toBeNull();
  });
});

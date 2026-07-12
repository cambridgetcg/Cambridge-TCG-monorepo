import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchPrices: vi.fn(),
  fetchSetsDetailed: vi.fn(),
  fetchAggregatorCoverage: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/wholesale/client", () => mocks);

import { GET as getGame } from "@/app/api/v1/prices/games/[game]/route";
import { GET as getSet } from "@/app/api/v1/prices/games/[game]/sets/[set]/route";
import { GET as getCard } from "@/app/api/v1/prices/games/[game]/sets/[set]/cards/[number]/route";
import { GET as getCoverage } from "@/app/api/v1/coverage/route";
import { loadGameState, loadSetState, loadCardState } from "./state";

describe("price catalog membership boundary", () => {
  it("keeps every JSON reading position data-independent", async () => {
    const responses = await Promise.all([
      getGame(new Request("https://example.test"), { params: Promise.resolve({ game: "caller-game" }) }),
      getSet(new Request("https://example.test"), { params: Promise.resolve({ game: "caller-game", set: "caller-set" }) }),
      getCard(new Request("https://example.test"), { params: Promise.resolve({ game: "caller-game", set: "caller-set", number: "caller-number" }) }),
      getCoverage(),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
    expect(mocks.fetchSetsDetailed).not.toHaveBeenCalled();
    expect(mocks.fetchAggregatorCoverage).not.toHaveBeenCalled();
  });

  it("keeps compatibility composers fail closed", async () => {
    expect(await loadGameState("caller")).toBe("unavailable");
    expect(await loadSetState("caller", "set")).toBe("unavailable");
    expect(await loadCardState("caller", "set", "number")).toBe("unavailable");
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
  });

  it("removes catalog reads from the public search and card page", () => {
    for (const path of [
      "src/app/prices/search/page.tsx",
      "src/app/prices/[game]/[set]/[number]/page.tsx",
    ]) {
      const source = readFileSync(`${process.cwd()}/${path}`, "utf8");
      expect(source, path).not.toMatch(/fetchPrices|loadCardState|query\(/);
      expect(source, path).toContain("paused");
    }
  });
});

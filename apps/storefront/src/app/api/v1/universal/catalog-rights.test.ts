import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));

import { GET as getGames } from "./games/route";
import { GET as getGame } from "./game/[token]/route";
import { GET as getSets } from "./sets/[game]/route";
import { GET as getSet } from "./set/[code]/route";
import { GET as getCard } from "./card/[sku]/route";
import { GET as getTemporalCard } from "@/app/api/at/[date]/card/[sku]/route";
import { GET as identifyHash } from "@/app/api/v1/federation/identify/[hash]/route";
import { GET as identifyHashAtDate } from "@/app/api/v1/federation/at/[date]/[hash]/route";
import { buildUniversalCard, resolveContentHash } from "@/lib/universal/card";

describe("universal catalog collection rights boundary", () => {
  it("withholds the game collection without querying mixed catalog membership", async () => {
    const response = await getGames();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(body).toMatchObject({
      "@source_license": ["internal-only"],
      record_license: "NOASSERTION",
      publication_status: "withheld-untraced-lineage",
      catalog_membership_included: false,
      aggregates_included: false,
      collection_complete: false,
      count: null,
      games: [],
      empty_state: null,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("echoes a game token only as caller-supplied structure", async () => {
    const response = await getGame(
      new NextRequest("https://example.test/api/v1/universal/game/optcg"),
      { params: Promise.resolve({ token: "OPTcg" }) },
    );
    const body = await response.json();

    expect(body).toMatchObject({
      target_natural_token: "optcg",
      token_origin: "caller-supplied",
      catalog_membership_asserted: false,
      set_count: null,
      declared_card_count: null,
      imported_card_count: null,
      recent_sets: [],
      recent_sets_complete: false,
      record_license: "NOASSERTION",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("withholds set membership, names, counts, dates, and images", async () => {
    const response = await getSets(
      new NextRequest("https://example.test/api/v1/universal/sets/optcg"),
      { params: Promise.resolve({ game: "optcg" }) },
    );
    const body = await response.json();

    expect(body).toMatchObject({
      record_license: "NOASSERTION",
      catalog_membership_included: false,
      aggregates_included: false,
      collection_complete: false,
      count: null,
      sets: [],
      of_game: {
        target_natural_token: "optcg",
        token_origin: "caller-supplied",
        catalog_membership_asserted: false,
      },
    });
    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps singleton, temporal, and hash routes data-independent", async () => {
    const calls = [
      getSet(new Request("https://example.test"), {
        params: Promise.resolve({ code: "caller-set" }),
      }),
      getCard(new Request("https://example.test"), {
        params: Promise.resolve({ sku: "caller-sku" }),
      }),
      getTemporalCard(new Request("https://example.test"), {
        params: Promise.resolve({ date: "2026-01-01", sku: "caller-sku" }),
      }),
      identifyHash(new Request("https://example.test"), {
        params: Promise.resolve({ hash: "caller-hash" }),
      }),
      identifyHashAtDate(new Request("https://example.test"), {
        params: Promise.resolve({ date: "2026-01-01", hash: "caller-hash" }),
      }),
    ];

    const responses = await Promise.all(calls);
    for (const response of responses) {
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body.record_license).toBe("NOASSERTION");
      expect(body.catalog_membership_asserted ?? body.catalog_membership_included).toBe(false);
    }
    expect(await buildUniversalCard("caller-sku")).toBeNull();
    expect(await resolveContentHash("caller-hash")).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSource } from "@cambridge-tcg/data-ingest";
import type { AggregatorCoverageResponse } from "@/lib/wholesale/client";

// The legacy price_archive copy on these pages was decided from
// meta.status === "blocked". CardRush and TCGplayer turned partial on
// 2026-10-28 because their page collectors exist, while the archive their
// legacy paths filled stays frozen. The pages now read the legacy locks;
// these tests hold them to the wording they rendered before that change.

const wholesale = vi.hoisted(() => ({
  fetchGames: vi.fn(),
  fetchPrices: vi.fn(),
  fetchSets: vi.fn(),
  fetchAggregatorCoverage: vi.fn(),
}));
vi.mock("@/lib/wholesale/client", () => wholesale);
vi.mock("@/lib/fx/rates", () => ({ fetchRates: async () => ({}) }));
vi.mock("@/lib/fx/currency-server", () => ({ getDisplayCurrency: async () => "GBP" }));
vi.mock("@/components/CurrencySelector", () => ({
  CurrencySelector: () => <div>Currency selector</div>,
  RateTablePanel: () => <div>Recorded exchange rates</div>,
  CurrencyWhyLink: () => <a href="/methodology/currency">Currency methodology</a>,
}));
vi.mock("@/lib/ui", () => ({
  Audience: () => null,
  Provenance: ({ kind, source, cadence }: { kind: string; source: string; cadence?: string }) => (
    <span data-provenance={`${kind}|${source}|${cadence ?? ""}`} />
  ),
  WhyLink: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
}));

import CoverageMapPage from "./coverage/page";
import PriceGuidePerGamePage from "./[game]/page";
import SetPriceGuidePage from "./[game]/[set]/page";

function coverage(source: string): AggregatorCoverageResponse {
  return {
    summary: {
      total_observations: 12,
      distinct_cards: 4,
      distinct_games: 1,
      distinct_sources: 1,
      unassigned_observations: 0,
      earliest_snapshot: "2026-06-01",
      latest_snapshot: "2026-07-11",
      days_of_coverage: 41,
    },
    by_game_source: [{
      game_code: "op", game_slug: "one-piece", game_name: "One Piece", source,
      observations: 12, distinct_cards: 4, earliest_snapshot: "2026-06-01", latest_snapshot: "2026-07-11",
      days_of_coverage: 41, freshest_age_hours: 2600,
    }],
    by_game: [{
      game_code: "op", game_slug: "one-piece", game_name: "One Piece", sources: [source],
      observations: 12, distinct_cards: 4, distinct_cards_max: 4, earliest_snapshot: "2026-06-01", latest_snapshot: "2026-07-11",
    }],
    by_source: [{ source, games: ["op"], observations: 12, distinct_cards: 4, earliest_snapshot: "2026-06-01", latest_snapshot: "2026-07-11" }],
    filter: { source: null, game: null, since: null },
    queried_at: "2026-10-28T12:00:00.000Z",
  };
}

beforeEach(() => {
  for (const fn of Object.values(wholesale)) fn.mockReset();
  wholesale.fetchGames.mockResolvedValue([]);
  wholesale.fetchPrices.mockResolvedValue({ items: [], total: 0 });
  wholesale.fetchSets.mockResolvedValue([{ code: "OP99", name: "Fixture Set", game_code: "op", card_count: 120, release_date: "2026-11-01" }]);
});

describe("legacy archive copy", () => {
  it("reads the locks while CardRush and TCGplayer are partial for their page collectors", () => {
    expect(getSource("cardrush")?.meta.status).toBe("partial");
    expect(getSource("tcgplayer")?.meta.status).toBe("partial");
  });

  it("/prices/coverage keeps saying the CardRush archive is not refreshing", async () => {
    wholesale.fetchAggregatorCoverage.mockResolvedValue(coverage("cardrush"));
    const html = renderToStaticMarkup(await CoverageMapPage());
    expect(html).toContain('data-provenance="snapshot|legacy price_archive|acquisition disabled"');
    expect(html).toContain("Sources: cardrush. cardrush acquisition is disabled by source policy; this archive is not being refreshed.");
    // The footer says why no source adds rows, whatever its status.
    expect(html).toContain("the legacy paths that filled it stay locked, whatever a source’s registry status");
    expect(html).not.toContain("a source whose registry status is blocked will not add rows");
  });

  it("/prices/coverage says nothing of the kind for a source whose acquisition is open", async () => {
    wholesale.fetchAggregatorCoverage.mockResolvedValue(coverage("ebay"));
    const html = renderToStaticMarkup(await CoverageMapPage());
    expect(html).toContain('data-provenance="snapshot|legacy price_archive|"');
    expect(html).toContain("Sources: ebay.</p>");
    expect(html).not.toContain("acquisition is disabled");
  });

  it("/prices/[game] keeps the disabled cadence, the CardRush badge and the not-refreshing footer", async () => {
    wholesale.fetchAggregatorCoverage.mockResolvedValue(coverage("cardrush"));
    const html = renderToStaticMarkup(await PriceGuidePerGamePage({ params: Promise.resolve({ game: "one-piece" }) }));
    expect(html).toContain('data-provenance="snapshot|legacy cardrush archive|acquisition disabled"');
    // The badge names the legacy lock; the permission of 2026-10-28 exists.
    expect(html).toContain('title="Registered host. The legacy acquisition that filled this archive stays disabled; the CardRush page collector permitted on 2026-10-28 writes elsewhere and runs only while it is scheduled"');
    expect(html).toContain(">CardRush legacy acquisition disabled</span>");
    expect(html).not.toContain("pending a formal partnership");
    expect(html).toContain("Latest stored snapshot 2026-07-11 · acquisition disabled by source policy; this archive is not refreshing.");
  });

  it("/prices/[game] renders an open source's archive without the disabled copy", async () => {
    wholesale.fetchAggregatorCoverage.mockResolvedValue(coverage("ebay"));
    const html = renderToStaticMarkup(await PriceGuidePerGamePage({ params: Promise.resolve({ game: "one-piece" }) }));
    expect(html).toContain('data-provenance="snapshot|legacy ebay archive|"');
    expect(html).toContain("Latest stored snapshot 2026-07-11.");
    expect(html).not.toContain("this archive is not refreshing");
    // The badge is about CardRush's own lock, not the archive's sources.
    expect(html).toContain(">CardRush legacy acquisition disabled</span>");
  });

  it("/prices/[game]/[set] keeps naming the CardRush lock when no cards are held", async () => {
    const html = renderToStaticMarkup(await SetPriceGuidePage({
      params: Promise.resolve({ game: "one-piece", set: "op99" }),
      searchParams: Promise.resolve({}),
    }));
    expect(html).toContain("No acquisition job is scheduled for this set: CardRush acquisition is disabled by source policy. See");
  });
});

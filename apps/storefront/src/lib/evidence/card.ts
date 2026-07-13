import type { SourceMeta } from "@cambridge-tcg/data-ingest";
import { COLLECTOR_OBSERVATION_PUBLICATION } from "@/lib/collector-observations/types";
import type { UnifiedMarketView } from "@/lib/market/unified";
import { soldCompsPausedData } from "@/lib/sold-comps/query";

export type EvidenceSourceState = "observed_withheld" | "blocked" | "planned";

export interface EvidenceSource {
  id: string;
  name: string;
  state: EvidenceSourceState;
  license: string;
  reason: string;
}

export interface CommunityEvidenceSummary {
  state: "paused";
  publication_status: "paused";
  buckets: [];
  as_of: null;
  reason: string;
  resumes_when: readonly string[];
  rights: "NOASSERTION";
  source_rights: "internal-only";
}

export interface CardEvidenceModel {
  sku: string;
  aggregate_rights: "NOASSERTION";
  reference: {
    amount_gbp: number | null;
    observed_at: string | null;
    kind: "computed_reference";
    is_offer: false;
    rights: "NOASSERTION";
  };
  market: {
    best_ask_gbp: number | null;
    best_bid_gbp: number | null;
    ask_count: number;
    bid_count: number;
    kind: "live_collector_offers";
    rights: "NOASSERTION";
  };
  completed_sales: ReturnType<typeof soldCompsPausedData> & {
    state: "paused";
    rights: "NOASSERTION";
    source_rights: "internal-only";
  };
  community_observations: CommunityEvidenceSummary;
  source_states: EvidenceSource[];
  links: {
    everything: string;
    sold_comps: string;
    sources: string;
    methodology: string;
  };
}

function sourceState(source: SourceMeta): EvidenceSourceState | null {
  if (source.id === "cardrush") return "observed_withheld";
  if (source.status === "blocked") return "blocked";
  if (source.status === "planned") return "planned";
  return null;
}

/**
 * Keep the source ledger small and claim-specific. These are the three
 * pricing rivers a collector is most likely to mistake for one another;
 * their access and reuse states are deliberately different.
 */
export function evidenceSourcesForGame(
  game: string | null,
  sources: readonly SourceMeta[],
): EvidenceSource[] {
  const wanted = new Set(["cardrush", "tcgplayer", "cardmarket"]);
  return sources
    .filter((source) => wanted.has(source.id))
    .filter(
      (source) =>
        game === null ||
        source.games.length === 0 ||
        (source.games as readonly string[]).includes(game),
    )
    .flatMap((source) => {
      const state = sourceState(source);
      if (state === null) return [];
      const reason =
        state === "observed_withheld"
          ? "Used as internal lineage where available; raw values and source URLs are not republished."
          : state === "blocked"
            ? "No collection or display: the required permission or access is not available."
            : "A source slot exists, but no live collection path is being claimed.";
      return [{ id: source.id, name: source.name, state, license: source.license, reason }];
    });
}

export function buildCardEvidence(input: {
  sku: string;
  game: string | null;
  referenceAmountGbp: number | null;
  referenceObservedAt: string | null;
  market: UnifiedMarketView | null;
  sources: readonly SourceMeta[];
}): CardEvidenceModel {
  const { sku, market } = input;
  return {
    sku,
    aggregate_rights: "NOASSERTION",
    reference: {
      amount_gbp: input.referenceAmountGbp,
      observed_at: input.referenceAmountGbp === null ? null : input.referenceObservedAt,
      kind: "computed_reference",
      is_offer: false,
      rights: "NOASSERTION",
    },
    market: {
      best_ask_gbp: market?.best_ask ?? null,
      best_bid_gbp: market?.best_bid ?? null,
      ask_count: market?.asks.reduce((total, level) => total + level.order_count, 0) ?? 0,
      bid_count: market?.bids.reduce((total, level) => total + level.order_count, 0) ?? 0,
      kind: "live_collector_offers",
      rights: "NOASSERTION",
    },
    completed_sales: {
      ...soldCompsPausedData(sku),
      state: "paused",
      rights: "NOASSERTION",
      source_rights: "internal-only",
    },
    community_observations: {
      ...COLLECTOR_OBSERVATION_PUBLICATION,
      state: "paused",
      publication_status: "paused",
      buckets: [],
      as_of: null,
    },
    source_states: evidenceSourcesForGame(input.game, input.sources),
    links: {
      everything: `/api/v1/cards/${encodeURIComponent(sku)}/everything`,
      sold_comps: `/api/v1/sold-comps/${encodeURIComponent(sku)}`,
      sources: "/api/v1/sources",
      methodology: "/methodology/data-intentions",
    },
  };
}

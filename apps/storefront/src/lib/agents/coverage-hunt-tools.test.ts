import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import {
  createCoverageHuntCase,
  listActiveCoverageHuntCases,
  persistCoverageHuntTurn,
} from "@/lib/coverage-hunt/db";
import { coverageHuntContribute, coverageHuntList } from "./coverage-hunt-tools";
import type { AgentActor } from "./auth";
import type { CoverageHuntCase } from "@/lib/coverage-hunt/types";

vi.mock("@/lib/wholesale/client", () => ({ fetchAggregatorCoverage: vi.fn() }));
vi.mock("./play-tools", () => ({
  ToolError: class ToolError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));
vi.mock("@cambridge-tcg/data-ingest", () => ({
  listSourceMeta: vi.fn(() => [{
    id: "cardrush", name: "CardRush", description: "", upstream: "https://example.test",
    catalog_section: "x", access: "scrape", license: "internal-only", redistribute: false,
    freshness: "price_current", canonical_effort: "high", status: "partial", games: ["op"], tos_notes: "",
  }]),
}));
vi.mock("@/lib/coverage-hunt/db", () => ({
  createCoverageHuntCase: vi.fn(),
  getCoverageHuntCase: vi.fn(),
  listActiveCoverageHuntCases: vi.fn(),
  listCoverageHuntCasesForAgent: vi.fn(),
  persistCoverageHuntTurn: vi.fn(),
  restCoverageHuntCaseIfExpired: vi.fn(),
}));

const actor: AgentActor = {
  kind: "agent",
  agentId: "11111111-1111-4111-8111-111111111111",
  agentPublicHandle: "gentle-scout",
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  registeredVia: "operator",
  keyId: "33333333-3333-4333-8333-333333333333",
  rateLimitTier: "free",
};

const coverage = {
  summary: { total_observations: 0, distinct_cards: 0, distinct_games: 0, distinct_sources: 0, unassigned_observations: 0, earliest_snapshot: null, latest_snapshot: "2026-07-11", days_of_coverage: 0 },
  by_game_source: [], by_game: [], by_source: [],
  filter: { source: null, game: null, since: null },
  queried_at: "2026-07-12T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAggregatorCoverage).mockResolvedValue(coverage);
  vi.mocked(listActiveCoverageHuntCases).mockResolvedValue([]);
});

describe("Coverage Hunt agent tools", () => {
  it("lists current candidates without creating a case", async () => {
    const result = await coverageHuntList(actor, {});
    expect(result.board.returned_candidate_count).toBe(1);
    expect(createCoverageHuntCase).not.toHaveBeenCalled();
  });

  it("distinguishes a registered actor from an erased identity link", async () => {
    vi.mocked(listActiveCoverageHuntCases).mockResolvedValue([{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      candidate: {
        id: "ch_000000000000000000000000",
        fingerprint: `sha256:${"0".repeat(64)}`,
        kind: "declared_observed_disagreement",
        target: { game_code: "op", source_id: "cardrush" },
        metrics: {},
        observed_at: "2026-07-12T10:00:00.000Z",
        why_candidate: "Declared and observed coverage differ.",
      },
      status: "mirroring",
      created_at: "2026-07-12T10:00:00.000Z",
      expires_at: "2026-07-15T10:00:00.000Z",
      turns: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          case_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "scout",
          actor: {
            agent_id: "44444444-4444-4444-8444-444444444444",
            public_handle: "moss-scout",
          },
          client_request_id: "scout-1",
          submission: {
            role: "scout",
            claim: "insufficient",
            lanes: { facts: [], self_claims: [], inferences: [], unknowns: ["Unknown."] },
            evidence: [],
            suggested_correction: null,
            boundary: "Public evidence only.",
          },
          submitted_at: "2026-07-12T10:01:00.000Z",
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          case_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "checker",
          actor: { agent_id: null, public_handle: null },
          client_request_id: "checker-1",
          submission: {
            role: "checker",
            verdict: "insufficient",
            lens: "Scope match.",
            what_would_change_my_mind: "A matching public denominator.",
            lanes: { facts: [], self_claims: [], inferences: [], unknowns: ["Unknown."] },
            evidence_selected: [],
            scout_wording_effect: "The gap wording made absence salient.",
            boundary: "Visible evidence only.",
          },
          submitted_at: "2026-07-12T10:02:00.000Z",
        },
      ],
      resolution: null,
      resolution_reason: null,
      resolved_at: null,
    } satisfies CoverageHuntCase]);

    const result = await coverageHuntList(actor, {});
    expect(result.open_cases[0].turns[0].actor).toEqual({
      status: "registered",
      public_handle: "moss-scout",
      label: "agent:moss-scout",
    });
    expect(result.open_cases[0].turns[1].actor).toEqual({
      status: "deleted",
      public_handle: null,
      label: null,
    });
    expect(result.open_cases[0].turns[1]).not.toHaveProperty("agent");
  });

  it("does not open a case for a malformed scout submission", async () => {
    await expect(coverageHuntContribute(actor, {
      candidate_id: "ch_000000000000000000000000",
      client_request_id: "try-1",
      submission: { role: "checker" },
    })).rejects.toThrow(/wrong_turn|submission|unknown field|role/i);
    expect(createCoverageHuntCase).not.toHaveBeenCalled();
  });

  it("requires exactly one candidate or case pointer", async () => {
    await expect(coverageHuntContribute(actor, {
      client_request_id: "try-2",
      submission: {},
    })).rejects.toThrow("exactly one");
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
  });
});

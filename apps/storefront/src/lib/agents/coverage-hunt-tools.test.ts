import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import {
  getCoverageHuntCase,
  listActiveCoverageHuntCases,
  listCoverageHuntCasesForAgent,
  persistCoverageHuntScoutTurn,
  persistCoverageHuntTurn,
} from "@/lib/coverage-hunt/db";
import {
  coverageHuntContribute,
  coverageHuntList,
  coverageHuntMyCases,
  coverageHuntView,
} from "./coverage-hunt-tools";
import type { AgentActor } from "./auth";
import type {
  CoverageHuntCase,
  ScoutSubmission,
} from "@/lib/coverage-hunt/types";
import { CoverageHuntError } from "@/lib/coverage-hunt/validation";

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
  getCoverageHuntCase: vi.fn(),
  listActiveCoverageHuntCases: vi.fn(),
  listCoverageHuntCasesForAgent: vi.fn(),
  persistCoverageHuntScoutTurn: vi.fn(),
  persistCoverageHuntTurn: vi.fn(),
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

const scoutSubmission: ScoutSubmission = {
  role: "scout",
  claim: "insufficient",
  lanes: {
    facts: [],
    self_claims: [],
    inferences: [],
    unknowns: ["The public denominator is unknown."],
  },
  evidence: [],
  suggested_correction: null,
  boundary: "Public evidence only.",
};

function huntCase(overrides: Partial<CoverageHuntCase> = {}): CoverageHuntCase {
  return {
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
    status: "open",
    created_at: "2026-07-12T10:00:00.000Z",
    expires_at: "2026-07-15T10:00:00.000Z",
    turns: [],
    resolution: null,
    resolution_reason: null,
    resolved_at: null,
    ...overrides,
  };
}

function expectRights(result: { license?: unknown; rights_note?: unknown }) {
  expect(result.license).toBe("NOASSERTION");
  expect(result.rights_note).toMatch(/board shape.*CC0/i);
  expect(result.rights_note).toMatch(/submissions.*NOASSERTION/i);
  expect(result.rights_note).toMatch(/citation grants no rights/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAggregatorCoverage).mockResolvedValue(coverage);
  vi.mocked(getCoverageHuntCase).mockResolvedValue(null);
  vi.mocked(listActiveCoverageHuntCases).mockResolvedValue([]);
  vi.mocked(listCoverageHuntCasesForAgent).mockResolvedValue([]);
});

describe("Coverage Hunt agent tools", () => {
  it("lists current candidates without creating a case", async () => {
    const result = await coverageHuntList(actor, {});
    expect(result.board.returned_candidate_count).toBe(1);
    expectRights(result);
    expect(persistCoverageHuntScoutTurn).not.toHaveBeenCalled();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
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

  it("keeps list, view, and my_cases on read-only persistence calls", async () => {
    const state = huntCase();
    vi.mocked(listActiveCoverageHuntCases).mockResolvedValue([state]);
    vi.mocked(getCoverageHuntCase).mockResolvedValue(state);
    vi.mocked(listCoverageHuntCasesForAgent).mockResolvedValue([state]);

    const listed = await coverageHuntList(actor, {});
    const viewed = await coverageHuntView(actor, { case_id: state.id });
    const mine = await coverageHuntMyCases(actor, {});

    expectRights(listed);
    expectRights(viewed);
    expectRights(mine);
    expect(persistCoverageHuntScoutTurn).not.toHaveBeenCalled();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
  });

  it("does not open a case for a malformed scout submission", async () => {
    await expect(coverageHuntContribute(actor, {
      candidate_id: "ch_000000000000000000000000",
      client_request_id: "try-1",
      submission: { role: "checker" },
    })).rejects.toThrow(/wrong_turn|submission|unknown field|role/i);
    expect(persistCoverageHuntScoutTurn).not.toHaveBeenCalled();
  });

  it("opens and scouts through one atomic persistence call", async () => {
    const listed = await coverageHuntList(actor, {});
    const candidateId = listed.board.candidates[0]!.candidate.id;
    const turn = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      case_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "scout" as const,
      actor: { agent_id: actor.agentId, public_handle: actor.agentPublicHandle },
      client_request_id: "atomic-scout-1",
      submission: scoutSubmission,
      submitted_at: "2026-07-12T10:01:00.000Z",
    };
    const state = huntCase({ status: "checking", turns: [turn] });
    vi.mocked(persistCoverageHuntScoutTurn).mockResolvedValue({
      ok: true,
      case: state,
      turn,
      idempotent: false,
    });

    const result = await coverageHuntContribute(actor, {
      candidate_id: candidateId,
      client_request_id: turn.client_request_id,
      submission: scoutSubmission,
    });

    expect(persistCoverageHuntScoutTurn).toHaveBeenCalledOnce();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
    expectRights(result);
  });

  it("surfaces a rejected first scout without a separate case-creation call", async () => {
    const listed = await coverageHuntList(actor, {});
    const candidateId = listed.board.candidates[0]!.candidate.id;
    vi.mocked(persistCoverageHuntScoutTurn).mockRejectedValue(
      new CoverageHuntError("daily_limit", "daily scout limit reached"),
    );

    await expect(coverageHuntContribute(actor, {
      candidate_id: candidateId,
      client_request_id: "daily-limit-1",
      submission: scoutSubmission,
    })).rejects.toMatchObject({ status: 429 });
    expect(persistCoverageHuntScoutTurn).toHaveBeenCalledOnce();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
  });

  it("requires exactly one candidate or case pointer", async () => {
    await expect(coverageHuntContribute(actor, {
      client_request_id: "try-2",
      submission: {},
    })).rejects.toThrow("exactly one");
    expect(persistCoverageHuntScoutTurn).not.toHaveBeenCalled();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
  });
});

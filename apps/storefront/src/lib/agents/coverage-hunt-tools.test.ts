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
  secondsUntilNextUtcDay,
} from "./coverage-hunt-tools";
import { ToolError } from "./tool-error";
import type { AgentActor } from "./auth";
import type {
  CoverageHuntCase,
  ScoutSubmission,
} from "@/lib/coverage-hunt/types";
import { CoverageHuntError } from "@/lib/coverage-hunt/validation";

vi.mock("@/lib/wholesale/client", () => ({ fetchAggregatorCoverage: vi.fn() }));
// A partial source with no legacy lock, so its declared game with no archive
// row is an invitation. CardRush's lock keeps it off the board (board.ts).
vi.mock("@cambridge-tcg/data-ingest", () => ({
  listSourceMeta: vi.fn(() => [{
    id: "cardmarket", name: "Cardmarket", description: "", upstream: "https://example.test",
    catalog_section: "x", access: "public-file", license: "proprietary", redistribute: false,
    freshness: "daily_file", canonical_effort: "medium", status: "partial", games: ["op"], tos_notes: "",
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
  keyExpiresAt: null,
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

/** The ToolError a call threw: its status, message and refusal. */
async function refusedWith(call: () => Promise<unknown>) {
  const error = await call().then(
    () => {
      throw new Error("expected a ToolError");
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ToolError);
  return error as ToolError;
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
    expect(vi.mocked(persistCoverageHuntScoutTurn).mock.calls[0]![0]).toMatchObject({
      actor_key_id: actor.keyId,
    });
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
    expectRights(result);
  });

  it("surfaces a rejected first scout without a separate case-creation call", async () => {
    const listed = await coverageHuntList(actor, {});
    const candidateId = listed.board.candidates[0]!.candidate.id;
    vi.mocked(persistCoverageHuntScoutTurn).mockRejectedValue(
      new CoverageHuntError("daily_limit", "daily scout limit reached"),
    );

    const error = await refusedWith(() => coverageHuntContribute(actor, {
      candidate_id: candidateId,
      client_request_id: "daily-limit-1",
      submission: scoutSubmission,
    }));
    expect(error.status).toBe(429);
    expect(error.message).toBe("daily_limit: daily scout limit reached");
    // The wait until 00:00 UTC, in the refusal and its retry action.
    const wait = error.refusal.retry_after_seconds!;
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(86_400);
    expect(error.refusal).toMatchObject({
      reason_code: "daily_limit",
      retryable: true,
      effect: "not_applied",
      next_actions: [{ action: "retry", after_seconds: wait, optional: true }],
    });
    expect(error.refusal).not.toHaveProperty("side_effects");
    expect(persistCoverageHuntScoutTurn).toHaveBeenCalledOnce();
    expect(persistCoverageHuntTurn).not.toHaveBeenCalled();
  });

  it("answers a contribution from a key revoked or expired mid-flight with a 403", async () => {
    vi.mocked(getCoverageHuntCase).mockResolvedValueOnce(huntCase());
    vi.mocked(persistCoverageHuntTurn).mockRejectedValueOnce(
      new CoverageHuntError("key_not_live", "This key is no longer live."),
    );

    const error = await refusedWith(() => coverageHuntContribute(actor, {
      case_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      client_request_id: "after-revoke-1",
      submission: scoutSubmission,
    }));
    expect(error).toMatchObject({ status: 403, message: "This key is no longer live." });
    expect(error.refusal).toMatchObject({ reason_code: "key_not_live", retryable: false, effect: "not_applied" });
    expect(vi.mocked(persistCoverageHuntTurn).mock.calls[0]![0]).toMatchObject({
      actor_key_id: actor.keyId,
    });
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

describe("Coverage Hunt refusals", () => {
  const CASE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("says a turn on a case past its limit was not applied, and that the call marked the case and wrote a chronicle row", async () => {
    vi.mocked(getCoverageHuntCase).mockResolvedValueOnce(huntCase({ status: "checking" }));
    // What the store returns from the branch that rested the case and
    // committed that (coverage-hunt/db.ts).
    vi.mocked(persistCoverageHuntTurn).mockResolvedValueOnce({
      ok: false,
      case: huntCase({ status: "resting" }),
      code: "case_expired",
      message: "case reached its 72-hour boundary and is resting",
    });

    const error = await refusedWith(() => coverageHuntContribute(actor, {
      case_id: CASE,
      client_request_id: "late-1",
      submission: scoutSubmission,
    }));
    // The message and status are what they were.
    expect(error).toMatchObject({ status: 409, message: "case reached its 72-hour boundary and is resting" });
    expect(error.refusal).toMatchObject({ reason_code: "case_expired", effect: "not_applied", retryable: false, terminal: false });
    expect(error.refusal.side_effects?.map((entry) => entry.change)).toEqual(["case_marked_resting", "chronicle_row_added"]);
    expect(error.refusal.side_effects?.[0].text).toContain(CASE);
    expect(error.refusal.next_actions[0]).toMatchObject({ action: "call_tool", tool: "coverage.hunt.view", arguments: { case_id: CASE } });
  });

  it("names the case the store found for a candidate when a scout finds it past its limit", async () => {
    const listed = await coverageHuntList(actor, {});
    const candidateId = listed.board.candidates[0]!.candidate.id;
    vi.mocked(persistCoverageHuntScoutTurn).mockResolvedValueOnce({
      ok: false,
      case: huntCase({ status: "resting" }),
      code: "case_expired",
      message: "case reached its 72-hour boundary and is resting",
    });
    const error = await refusedWith(() => coverageHuntContribute(actor, {
      candidate_id: candidateId,
      client_request_id: "late-scout-1",
      submission: scoutSubmission,
    }));
    expect(error.refusal.side_effects?.[0]).toMatchObject({ change: "case_marked_resting" });
    expect(error.refusal.next_actions[0]).toMatchObject({ tool: "coverage.hunt.view", arguments: { case_id: CASE } });
  });

  it("types every error the store throws, keeping each status and message; none of them changed anything", async () => {
    const cases: Array<[CoverageHuntError, number, string]> = [
      [new CoverageHuntError("invalid_input", "submission.lens: must not be empty"), 400, "invalid_input"],
      [new CoverageHuntError("evidence_not_found", "evidence_selected references unknown scout label: x"), 400, "evidence_not_found"],
      [new CoverageHuntError("wrong_turn", "case is ready_for_human; it is not waiting for an agent turn"), 409, "wrong_turn"],
      [new CoverageHuntError("agent_already_participated", "each case requires three distinct agents"), 409, "agent_already_participated"],
      [new CoverageHuntError("case_expired", "case reached its 72-hour boundary and must rest"), 409, "case_expired"],
      [new CoverageHuntError("case_terminal", "case is resting; no more turns are accepted"), 409, "case_terminal"],
      [new CoverageHuntError("not_ready_for_human", "case is open"), 400, "not_ready_for_human"],
    ];
    for (const [thrown, status, code] of cases) {
      vi.mocked(getCoverageHuntCase).mockResolvedValueOnce(huntCase());
      vi.mocked(persistCoverageHuntTurn).mockRejectedValueOnce(thrown);
      const error = await refusedWith(() => coverageHuntContribute(actor, {
        case_id: CASE,
        client_request_id: `try-${code}`,
        submission: scoutSubmission,
      }));
      expect(error.status, code).toBe(status);
      expect(error.message, code).toBe(`${thrown.code}: ${thrown.message}`);
      expect(error.refusal.reason_code, code).toBe(code);
      expect(error.refusal.effect, code).toBe("not_applied");
      // A thrown store error rolled its transaction back.
      expect(error.refusal, code).not.toHaveProperty("side_effects");
    }
  });

  it("points a refusal about the case at that case", async () => {
    vi.mocked(getCoverageHuntCase).mockResolvedValueOnce(huntCase());
    vi.mocked(persistCoverageHuntTurn).mockRejectedValueOnce(new CoverageHuntError("evidence_not_found", "unknown label"));
    const error = await refusedWith(() => coverageHuntContribute(actor, { case_id: CASE, client_request_id: "e-1", submission: {} }));
    expect(error.refusal.next_actions).toEqual([
      expect.objectContaining({ action: "call_tool", tool: "coverage.hunt.view", arguments: { case_id: CASE } }),
    ]);
  });

  it("types the handler's own refusals: arguments, not found, an unavailable source, missing tables", async () => {
    const argument = await refusedWith(() => coverageHuntContribute(actor, { client_request_id: "x", submission: {} }));
    expect([argument.status, argument.refusal.reason_code]).toEqual([400, "invalid_input"]);

    const noCase = await refusedWith(() => coverageHuntView(actor, { case_id: CASE }));
    expect([noCase.status, noCase.refusal.reason_code]).toEqual([404, "case_not_found"]);

    const noCandidate = await refusedWith(() => coverageHuntContribute(actor, {
      candidate_id: "ch_ffffffffffffffffffffffff",
      client_request_id: "x",
      submission: scoutSubmission,
    }));
    expect([noCandidate.status, noCandidate.refusal.reason_code]).toEqual([404, "candidate_not_found"]);

    vi.mocked(fetchAggregatorCoverage).mockResolvedValueOnce(null);
    const noSource = await refusedWith(() => coverageHuntList(actor, {}));
    expect([noSource.status, noSource.refusal.reason_code, noSource.refusal.retryable]).toEqual([503, "source_unavailable", true]);

    vi.mocked(listCoverageHuntCasesForAgent).mockRejectedValueOnce(
      Object.assign(new Error("relation does not exist"), { code: "42P01" }),
    );
    const noTables = await refusedWith(() => coverageHuntMyCases(actor, {}));
    expect([noTables.status, noTables.refusal.reason_code]).toEqual([503, "storage_not_ready"]);

    for (const params of [{ limit: 0 }, { status: "asleep" }]) {
      const bad = await refusedWith(() => coverageHuntMyCases(actor, params));
      expect(bad.refusal.reason_code).toBe("invalid_input");
    }
  });

  it("counts the daily limit's wait to the next 00:00 UTC", () => {
    expect(secondsUntilNextUtcDay(new Date("2026-11-13T23:59:30.000Z"))).toBe(30);
    expect(secondsUntilNextUtcDay(new Date("2026-11-13T00:00:00.000Z"))).toBe(86_400);
    expect(secondsUntilNextUtcDay(new Date("2026-12-31T12:00:00.500Z"))).toBe(43_200);
  });
});

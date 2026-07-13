import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CompatQueryFn,
  CompatQueryResult,
} from "@cambridge-tcg/db/compat";
import type {
  CoverageCandidateSnapshot,
  ScoutSubmission,
} from "./types";
import { createCoverageCandidate } from "./candidates";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => db);

import {
  getCoverageHuntCase,
  listActiveCoverageHuntCases,
  listCoverageHuntCasesForAgent,
  persistCoverageHuntScoutTurn,
} from "./db";

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

const candidate: CoverageCandidateSnapshot = createCoverageCandidate({
  kind: "declared_observed_disagreement",
  target: { game_code: "op", source_id: "cardrush" },
  metrics: { observations: 0 },
  observed_at: "2026-07-12T10:00:00.000Z",
  why_candidate: "Declared and observed coverage differ.",
});

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

function rows(values: Record<string, unknown>[]): CompatQueryResult {
  return { rows: values, rowCount: values.length };
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    candidate_id: candidate.id,
    candidate_fingerprint: candidate.fingerprint,
    candidate_kind: candidate.kind,
    candidate_snapshot: candidate,
    status: "open",
    created_at: "2026-07-12T10:00:00.000Z",
    expires_at: "2026-07-15T10:00:00.000Z",
    resolution: null,
    resolution_reason: null,
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Coverage Hunt read purity", () => {
  it("projects expiry for get/list/my_cases using SELECTs only", async () => {
    const now = new Date("2026-07-16T10:00:00.000Z");

    db.query
      // getCoverageHuntCase
      .mockResolvedValueOnce(rows([caseRow()]))
      .mockResolvedValueOnce(rows([]))
      // listActiveCoverageHuntCases: simulate an expiry race after the id read.
      .mockResolvedValueOnce(rows([{ id: CASE_ID }]))
      .mockResolvedValueOnce(rows([caseRow()]))
      .mockResolvedValueOnce(rows([]))
      // listCoverageHuntCasesForAgent
      .mockResolvedValueOnce(rows([{ id: CASE_ID, updated_at: now.toISOString() }]))
      .mockResolvedValueOnce(rows([caseRow()]))
      .mockResolvedValueOnce(rows([]));

    const viewed = await getCoverageHuntCase(CASE_ID, now);
    const active = await listActiveCoverageHuntCases(12, now);
    const mine = await listCoverageHuntCasesForAgent(
      AGENT_ID,
      { status: "resting", limit: 20 },
      now,
    );

    expect(viewed?.status).toBe("resting");
    expect(active).toEqual([]);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.status).toBe("resting");
    expect(db.transaction).not.toHaveBeenCalled();
    for (const [sql] of db.query.mock.calls) {
      expect(String(sql)).toMatch(/^\s*SELECT\b/i);
      expect(String(sql)).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    }
    expect(String(db.query.mock.calls[2]?.[0])).toContain("expires_at > $1");
    expect(String(db.query.mock.calls[5]?.[0])).toContain("THEN 'resting'");
  });
});

describe("Coverage Hunt first-scout atomicity", () => {
  it("rolls the candidate and opened chronicle back when the daily limit rejects the scout", async () => {
    const committed = { cases: 0, turns: 0, chronicle: 0 };
    const attempted = { cases: 0, turns: 0, chronicle: 0 };
    const sequence: string[] = [];

    db.transaction.mockImplementation(
      async (work: (q: CompatQueryFn) => Promise<unknown>) => {
        const pending = { cases: 0, turns: 0, chronicle: 0 };
        let insertedCase: Record<string, unknown> | null = null;
        const q: CompatQueryFn = async (sql, params = []) => {
          if (/pg_advisory_xact_lock/i.test(sql)) {
            sequence.push("agent-lock");
            return rows([{ pg_advisory_xact_lock: null }]);
          }
          if (/INSERT INTO coverage_hunt_cases/i.test(sql)) {
            sequence.push("case-insert");
            attempted.cases += 1;
            pending.cases += 1;
            insertedCase = caseRow({
              id: params[0],
              candidate_id: params[1],
              candidate_fingerprint: params[2],
              candidate_kind: params[3],
              candidate_snapshot: params[4],
              created_at: params[5],
              expires_at: params[6],
            });
            return rows([{ id: params[0] }]);
          }
          if (/INSERT INTO coverage_hunt_chronicle/i.test(sql)) {
            attempted.chronicle += 1;
            pending.chronicle += 1;
            return rows([]);
          }
          if (/INSERT INTO coverage_hunt_turns/i.test(sql)) {
            attempted.turns += 1;
            pending.turns += 1;
            return rows([]);
          }
          if (/SELECT case_id\s+FROM coverage_hunt_turns/i.test(sql)) {
            return rows([]);
          }
          if (/FROM coverage_hunt_cases\s+WHERE id = \$1 FOR UPDATE/i.test(sql)) {
            if (!insertedCase) throw new Error("test case was not inserted");
            return rows([insertedCase]);
          }
          if (/FROM coverage_hunt_turns t/i.test(sql)) return rows([]);
          if (/SELECT count\(\*\)::int AS n/i.test(sql)) return rows([{ n: 5 }]);
          throw new Error(`unexpected Coverage Hunt SQL: ${sql}`);
        };

        const result = await work(q);
        committed.cases += pending.cases;
        committed.turns += pending.turns;
        committed.chronicle += pending.chronicle;
        return result;
      },
    );

    await expect(persistCoverageHuntScoutTurn({
      candidate,
      actor: {
        agent_id: AGENT_ID,
        operator_user_id: "22222222-2222-4222-8222-222222222222",
        public_handle: "gentle-scout",
      },
      client_request_id: "daily-limit-1",
      submission: scoutSubmission,
      now: new Date("2026-07-12T10:00:00.000Z"),
    })).rejects.toMatchObject({ code: "daily_limit" });

    expect(attempted).toEqual({ cases: 1, turns: 0, chronicle: 1 });
    expect(committed).toEqual({ cases: 0, turns: 0, chronicle: 0 });
    expect(sequence.slice(0, 2)).toEqual(["agent-lock", "case-insert"]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query).not.toHaveBeenCalled();
  });
});

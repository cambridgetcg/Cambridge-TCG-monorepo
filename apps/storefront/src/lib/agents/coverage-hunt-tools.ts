/** Bearer-authenticated agent tools for the bounded Coverage Hunt. */

import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import type { AgentActor } from "./auth";
import { caseRestedSideEffects, type ToolRefusalCode } from "./refusals";
import { ToolError } from "./tool-error";
import {
  getCoverageHuntCase,
  listActiveCoverageHuntCases,
  listCoverageHuntCasesForAgent,
  persistCoverageHuntScoutTurn,
  persistCoverageHuntTurn,
} from "@/lib/coverage-hunt/db";
import {
  COVERAGE_CANDIDATE_KINDS,
  COVERAGE_HUNT_STATUSES,
  type CoverageCandidateKind,
  type CoverageHuntCase,
  type CoverageHuntStatus,
  type CoverageHuntSubmission,
} from "@/lib/coverage-hunt/types";
import {
  CoverageHuntError,
  validateSubmission,
  type CoverageHuntErrorCode,
} from "@/lib/coverage-hunt/validation";
import {
  buildCoverageHuntBoard,
  COVERAGE_HUNT_BOARD_LIMIT,
} from "@/lib/coverage-hunt/board";
import { roleForStatus } from "@/lib/coverage-hunt/state-machine";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";

const COVERAGE_HUNT_RIGHTS = {
  license: "NOASSERTION" as const,
  rights_note:
    "Cambridge's board shape and explanations may be available separately under CC0. Proprietary game mappings and upstream materials retain their own rights. Agent submissions and citations remain NOASSERTION; a citation grants no rights.",
};

function asHuntActor(actor: AgentActor) {
  return {
    agent_id: actor.agentId,
    operator_user_id: actor.operatorUserId,
    public_handle: actor.agentPublicHandle,
  };
}

function boundedLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ToolError(`limit must be an integer from 1 to ${max}`, 400, "invalid_input");
  }
  return value;
}

function optionalGame(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new ToolError("game must be a 1-64 character identifier", 400, "invalid_input");
  }
  return value;
}

function optionalKind(value: unknown): CoverageCandidateKind | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !(COVERAGE_CANDIDATE_KINDS as readonly string[]).includes(value)
  ) {
    throw new ToolError(`kind must be one of: ${COVERAGE_CANDIDATE_KINDS.join(", ")}`, 400, "invalid_input");
  }
  return value as CoverageCandidateKind;
}

function optionalStatus(value: unknown): CoverageHuntStatus | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !(COVERAGE_HUNT_STATUSES as readonly string[]).includes(value)
  ) {
    throw new ToolError(`status must be one of: ${COVERAGE_HUNT_STATUSES.join(", ")}`, 400, "invalid_input");
  }
  return value as CoverageHuntStatus;
}

function publicCase(state: CoverageHuntCase, viewerAgentId?: string) {
  const ownTurn = viewerAgentId
    ? state.turns.find((turn) => turn.actor.agent_id === viewerAgentId)
    : undefined;
  return {
    case_id: state.id,
    candidate: state.candidate,
    status: state.status,
    next_role: roleForStatus(state.status),
    created_at: state.created_at,
    expires_at: state.expires_at,
    turns: state.turns.map((turn) => ({
      role: turn.role,
      actor: turn.actor.public_handle
        ? {
            status: "registered" as const,
            public_handle: turn.actor.public_handle,
            label: `agent:${turn.actor.public_handle}`,
          }
        : {
            status: "deleted" as const,
            public_handle: null,
            label: null,
          },
      submission: turn.submission,
      submitted_at: turn.submitted_at,
    })),
    turns_completed: state.turns.length,
    your_role: ownTurn?.role ?? null,
    resolution: state.resolution,
    resolution_reason: state.resolution_reason,
    resolved_at: state.resolved_at,
    authoritative_effect: "none" as const,
    apply_transition_exists: false as const,
  };
}

/** Each Coverage Hunt error's HTTP status and reason code. The code words
 *  are Coverage Hunt's own; the statuses are those the gate sent before
 *  2026-11-13. A thrown CoverageHuntError always rolls its transaction back,
 *  so none of these changed anything (not_applied). */
const HUNT_ERRORS: Record<CoverageHuntErrorCode, { status: number; code: ToolRefusalCode }> = {
  invalid_input: { status: 400, code: "invalid_input" },
  evidence_not_found: { status: 400, code: "evidence_not_found" },
  not_ready_for_human: { status: 400, code: "not_ready_for_human" },
  wrong_turn: { status: 409, code: "wrong_turn" },
  agent_already_participated: { status: 409, code: "agent_already_participated" },
  case_expired: { status: 409, code: "case_expired" },
  case_terminal: { status: 409, code: "case_terminal" },
  daily_limit: { status: 429, code: "daily_limit" },
  key_not_live: { status: 403, code: "key_not_live" },
};

/** Seconds from `now` until the next 00:00 UTC, when the daily scout count
 *  starts again. The store counts by the database's clock, this by the
 *  app's, so it can be a few seconds out. */
export function secondsUntilNextUtcDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function toToolError(error: unknown, context: { caseId?: string } = {}): never {
  if (error instanceof ToolError) throw error;
  if (error instanceof CoverageHuntError) {
    const mapped = HUNT_ERRORS[error.code];
    // key_not_live: the key was revoked, or had expired, before this
    // contribution's write transaction could lock it; nothing was written.
    // Its message has always been the store's alone.
    const message = error.code === "key_not_live" ? error.message : `${error.code}: ${error.message}`;
    throw new ToolError(message, mapped.status, mapped.code, {
      caseId: context.caseId,
      ...(error.code === "daily_limit" ? { retryAfterSeconds: secondsUntilNextUtcDay() } : {}),
    });
  }
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "42P01") {
      throw new ToolError(
        "Coverage Hunt persistence is not ready because migration 0120 has not been applied. No case or turn was accepted.",
        503,
        "storage_not_ready",
      );
    }
    current = candidate.cause;
  }
  throw error;
}

async function currentBoard(input: {
  game?: string;
  kind?: CoverageCandidateKind;
  limit: number;
}) {
  const coverage = await fetchAggregatorCoverage({ game: input.game });
  if (!coverage) throw new ToolError("coverage source unavailable; no candidate was invented", 503, "source_unavailable");
  return buildCoverageHuntBoard(coverage, listSourceMeta(), input);
}

async function currentCandidateById(candidateId: string) {
  const coverage = await fetchAggregatorCoverage();
  if (!coverage) throw new ToolError("coverage source unavailable; no candidate was invented", 503, "source_unavailable");
  const sources = listSourceMeta();
  const games = new Set<string>(["unassigned"]);
  for (const source of sources) {
    for (const game of source.games) games.add(game);
  }
  for (const row of coverage.by_game_source) games.add(row.game_code);
  // A game has fewer registered sources than the board's 24-item cap. Walk
  // game slices so a candidate shown through ?game= is also claimable even
  // when it falls outside the first page of the unfiltered board.
  for (const game of games) {
    const board = buildCoverageHuntBoard(coverage, sources, {
      game,
      limit: COVERAGE_HUNT_BOARD_LIMIT,
    });
    const candidate = board.candidates.find((item) => item.candidate.id === candidateId)?.candidate;
    if (candidate) return candidate;
  }
  return null;
}

export async function coverageHuntList(
  actor: AgentActor,
  params: { game?: unknown; kind?: unknown; limit?: unknown },
) {
  try {
    const game = optionalGame(params.game);
    const kind = optionalKind(params.kind);
    const limit = boundedLimit(params.limit, 12, COVERAGE_HUNT_BOARD_LIMIT);
    const [board, active] = await Promise.all([
      currentBoard({ game, kind, limit }),
      listActiveCoverageHuntCases(limit),
    ]);
    return {
      ...COVERAGE_HUNT_RIGHTS,
      board,
      open_cases: active
        .filter((state) => !state.turns.some((turn) => turn.actor.agent_id === actor.agentId))
        .map((state) => publicCase(state)),
      note:
        "Choose a candidate to scout, or an open case whose next role you have not already taken. Walking past creates nothing and costs nothing.",
    };
  } catch (error) {
    toToolError(error);
  }
}

export async function coverageHuntView(
  actor: AgentActor,
  params: { case_id?: unknown },
) {
  try {
    if (typeof params.case_id !== "string") throw new ToolError("case_id is required", 400, "invalid_input");
    const state = await getCoverageHuntCase(params.case_id);
    if (!state) throw new ToolError("coverage hunt case not found", 404, "case_not_found");
    return {
      ...COVERAGE_HUNT_RIGHTS,
      case: publicCase(state, actor.agentId),
    };
  } catch (error) {
    toToolError(error);
  }
}

export async function coverageHuntContribute(
  actor: AgentActor,
  params: {
    candidate_id?: unknown;
    case_id?: unknown;
    client_request_id?: unknown;
    submission?: unknown;
  },
) {
  // The case a next action can name: the one the caller sent, then the one
  // the store found for its candidate.
  let caseId = typeof params.case_id === "string" ? params.case_id : undefined;
  try {
    const candidateId = typeof params.candidate_id === "string" ? params.candidate_id : undefined;
    const requestedCaseId = caseId;
    if ((candidateId ? 1 : 0) + (requestedCaseId ? 1 : 0) !== 1) {
      throw new ToolError("provide exactly one of candidate_id or case_id", 400, "invalid_input");
    }
    if (typeof params.client_request_id !== "string") {
      throw new ToolError("client_request_id is required", 400, "invalid_input");
    }

    let result: Awaited<ReturnType<typeof persistCoverageHuntTurn>>;
    if (candidateId) {
      // Validate the scout shape before opening anything. A malformed first
      // turn must not leave behind an empty case as a side effect.
      validateSubmission("scout", params.submission);
      const candidate = await currentCandidateById(candidateId);
      if (!candidate) throw new ToolError("candidate is not on the current bounded board", 404, "candidate_not_found");
      result = await persistCoverageHuntScoutTurn({
        candidate,
        actor: asHuntActor(actor),
        actor_key_id: actor.keyId,
        client_request_id: params.client_request_id,
        submission: params.submission as CoverageHuntSubmission,
      });
    } else {
      const found = await getCoverageHuntCase(requestedCaseId!);
      if (!found) throw new ToolError("coverage hunt case not found", 404, "case_not_found");
      result = await persistCoverageHuntTurn({
        case_id: found.id,
        actor: asHuntActor(actor),
        actor_key_id: actor.keyId,
        client_request_id: params.client_request_id,
        submission: params.submission as CoverageHuntSubmission,
      });
    }
    if (!result.ok) {
      // The store returns ok: false only from the branch that found the case
      // past its 72-hour limit, marked it resting and wrote a chronicle row,
      // and then commits both (coverage-hunt/db.ts). So the turn was not
      // applied, and this call changed the case anyway.
      caseId = result.case.id;
      throw new ToolError(result.message, 409, "case_expired", {
        caseId,
        sideEffects: caseRestedSideEffects(result.case.id),
      });
    }
    return {
      ...COVERAGE_HUNT_RIGHTS,
      accepted: true,
      idempotent: result.idempotent,
      role: result.turn.role,
      case: publicCase(result.case, actor.agentId),
      receipt: {
        case_id: result.case.id,
        client_request_id: result.turn.client_request_id,
        submitted_at: result.turn.submitted_at,
      },
    };
  } catch (error) {
    toToolError(error, { caseId });
  }
}

export async function coverageHuntMyCases(
  actor: AgentActor,
  params: { status?: unknown; limit?: unknown },
) {
  try {
    const status = optionalStatus(params.status);
    const limit = boundedLimit(params.limit, 20, 100);
    const cases = await listCoverageHuntCasesForAgent(actor.agentId, { status, limit });
    return {
      ...COVERAGE_HUNT_RIGHTS,
      cases: cases.map((state) => publicCase(state, actor.agentId)),
    };
  } catch (error) {
    toToolError(error);
  }
}

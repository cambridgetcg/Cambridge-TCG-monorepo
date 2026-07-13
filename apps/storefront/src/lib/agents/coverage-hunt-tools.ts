/** Bearer-authenticated agent tools for the bounded Coverage Hunt. */

import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import type { AgentActor } from "./auth";
import { ToolError } from "./play-tools";
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
    throw new ToolError(`limit must be an integer from 1 to ${max}`);
  }
  return value;
}

function optionalGame(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new ToolError("game must be a 1-64 character identifier");
  }
  return value;
}

function optionalKind(value: unknown): CoverageCandidateKind | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !(COVERAGE_CANDIDATE_KINDS as readonly string[]).includes(value)
  ) {
    throw new ToolError(`kind must be one of: ${COVERAGE_CANDIDATE_KINDS.join(", ")}`);
  }
  return value as CoverageCandidateKind;
}

function optionalStatus(value: unknown): CoverageHuntStatus | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !(COVERAGE_HUNT_STATUSES as readonly string[]).includes(value)
  ) {
    throw new ToolError(`status must be one of: ${COVERAGE_HUNT_STATUSES.join(", ")}`);
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

function toToolError(error: unknown): never {
  if (error instanceof ToolError) throw error;
  if (error instanceof CoverageHuntError) {
    const status =
      error.code === "daily_limit"
        ? 429
        : error.code === "case_expired" ||
            error.code === "case_terminal" ||
            error.code === "wrong_turn" ||
            error.code === "agent_already_participated"
          ? 409
          : 400;
    throw new ToolError(`${error.code}: ${error.message}`, status);
  }
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "42P01") {
      throw new ToolError(
        "Coverage Hunt persistence is not ready because migration 0120 has not been applied. No case or turn was accepted.",
        503,
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
  if (!coverage) throw new ToolError("coverage source unavailable; no candidate was invented", 503);
  return buildCoverageHuntBoard(coverage, listSourceMeta(), input);
}

async function currentCandidateById(candidateId: string) {
  const coverage = await fetchAggregatorCoverage();
  if (!coverage) throw new ToolError("coverage source unavailable; no candidate was invented", 503);
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
    if (typeof params.case_id !== "string") throw new ToolError("case_id is required");
    const state = await getCoverageHuntCase(params.case_id);
    if (!state) throw new ToolError("coverage hunt case not found", 404);
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
  try {
    const candidateId = typeof params.candidate_id === "string" ? params.candidate_id : undefined;
    const requestedCaseId = typeof params.case_id === "string" ? params.case_id : undefined;
    if ((candidateId ? 1 : 0) + (requestedCaseId ? 1 : 0) !== 1) {
      throw new ToolError("provide exactly one of candidate_id or case_id");
    }
    if (typeof params.client_request_id !== "string") {
      throw new ToolError("client_request_id is required");
    }

    let result: Awaited<ReturnType<typeof persistCoverageHuntTurn>>;
    if (candidateId) {
      // Validate the scout shape before opening anything. A malformed first
      // turn must not leave behind an empty case as a side effect.
      validateSubmission("scout", params.submission);
      const candidate = await currentCandidateById(candidateId);
      if (!candidate) throw new ToolError("candidate is not on the current bounded board", 404);
      result = await persistCoverageHuntScoutTurn({
        candidate,
        actor: asHuntActor(actor),
        client_request_id: params.client_request_id,
        submission: params.submission as CoverageHuntSubmission,
      });
    } else {
      const found = await getCoverageHuntCase(requestedCaseId!);
      if (!found) throw new ToolError("coverage hunt case not found", 404);
      result = await persistCoverageHuntTurn({
        case_id: found.id,
        actor: asHuntActor(actor),
        client_request_id: params.client_request_id,
        submission: params.submission as CoverageHuntSubmission,
      });
    }
    if (!result.ok) throw new ToolError(result.message, 409);
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
    toToolError(error);
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

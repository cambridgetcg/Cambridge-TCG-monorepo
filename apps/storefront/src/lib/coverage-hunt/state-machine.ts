import {
  COVERAGE_HUNT_DURATION_HOURS,
  COVERAGE_HUNT_RESOLUTIONS,
  type CoverageCandidateSnapshot,
  type CoverageHuntActor,
  type CoverageHuntCase,
  type CoverageHuntResolution,
  type CoverageHuntRole,
  type CoverageHuntStatus,
  type CoverageHuntSubmission,
  type CoverageHuntTransition,
  type CoverageHuntTurn,
  type ScoutSubmission,
} from "./types";
import {
  CoverageHuntError,
  normalizeIso,
  validateActor,
  validateClientRequestId,
  validateSubmission,
  validateUuid,
} from "./validation";
import { validateCoverageCandidateSnapshot } from "./candidates";

const NEXT_ROLE: Partial<Record<CoverageHuntStatus, CoverageHuntRole>> = {
  open: "scout",
  checking: "checker",
  mirroring: "mirror",
};

const NEXT_STATUS: Record<CoverageHuntRole, CoverageHuntStatus> = {
  scout: "checking",
  checker: "mirroring",
  mirror: "ready_for_human",
};

function timestamp(value: Date | string): string {
  return normalizeIso(value instanceof Date ? value.toISOString() : value, "now");
}

function cloneCase(state: CoverageHuntCase): CoverageHuntCase {
  return {
    ...state,
    candidate: {
      ...state.candidate,
      target: { ...state.candidate.target },
      metrics: { ...state.candidate.metrics },
    },
    turns: state.turns.map((turn) => ({
      ...turn,
      actor: { ...turn.actor },
      submission: structuredClone(turn.submission),
    })),
  };
}

export function roleForStatus(
  status: CoverageHuntStatus,
): CoverageHuntRole | null {
  return NEXT_ROLE[status] ?? null;
}

export function isCoverageHuntExpired(
  state: CoverageHuntCase,
  now: Date | string,
): boolean {
  return new Date(timestamp(now)).getTime() >= new Date(state.expires_at).getTime();
}

export function openCoverageHuntCase(input: {
  case_id: string;
  candidate: CoverageCandidateSnapshot;
  now: Date | string;
}): CoverageHuntTransition {
  const id = validateUuid(input.case_id, "case_id");
  const candidate = validateCoverageCandidateSnapshot(input.candidate);
  const createdAt = timestamp(input.now);
  const expiresAt = new Date(
    new Date(createdAt).getTime() +
      COVERAGE_HUNT_DURATION_HOURS * 60 * 60 * 1_000,
  ).toISOString();
  const state: CoverageHuntCase = {
    id,
    candidate,
    status: "open",
    created_at: createdAt,
    expires_at: expiresAt,
    turns: [],
    resolution: null,
    resolution_reason: null,
    resolved_at: null,
  };
  return {
    case: state,
    chronicle: {
      action: "opened",
      from_status: null,
      to_status: "open",
      actor_kind: "system",
      actor_label: "system:coverage-hunt",
      metadata: {
        candidate_id: candidate.id,
        candidate_fingerprint: candidate.fingerprint,
        duration_hours: COVERAGE_HUNT_DURATION_HOURS,
      },
      created_at: createdAt,
    },
  };
}

/** Find an already-accepted request. Persistence uses this before looking at
 * the current role, so a network retry cannot accidentally become the next
 * role's submission. */
export function findTurnByRequest(
  state: CoverageHuntCase,
  agentId: string,
  clientRequestId: string,
): CoverageHuntTurn | null {
  const normalizedAgent = validateUuid(agentId, "agent_id");
  const normalizedRequest = validateClientRequestId(clientRequestId);
  return (
    state.turns.find(
      (turn) =>
        turn.actor.agent_id === normalizedAgent &&
        turn.client_request_id === normalizedRequest,
    ) ?? null
  );
}

function scoutSubmission(state: CoverageHuntCase): ScoutSubmission | null {
  const scout = state.turns.find((turn) => turn.role === "scout");
  return scout?.submission.role === "scout" ? scout.submission : null;
}

function assertEvidenceSelectionsExist(
  state: CoverageHuntCase,
  submission: CoverageHuntSubmission,
): void {
  if (submission.role === "scout") return;
  const labels = new Set(
    (scoutSubmission(state)?.evidence ?? []).map((evidence) => evidence.label),
  );
  for (const selected of submission.evidence_selected) {
    if (!labels.has(selected)) {
      throw new CoverageHuntError(
        "evidence_not_found",
        `evidence_selected references unknown scout label: ${selected}`,
      );
    }
  }
}

export function submitCoverageHuntTurn(input: {
  state: CoverageHuntCase;
  actor: CoverageHuntActor | unknown;
  client_request_id: string;
  submission: CoverageHuntSubmission | unknown;
  turn_id: string;
  now: Date | string;
}): CoverageHuntTransition {
  const state = cloneCase(input.state);
  const now = timestamp(input.now);
  if (state.status === "resolved" || state.status === "resting") {
    throw new CoverageHuntError(
      "case_terminal",
      `case is ${state.status}; no more turns are accepted`,
    );
  }
  if (isCoverageHuntExpired(state, now)) {
    throw new CoverageHuntError(
      "case_expired",
      "case reached its 72-hour boundary and must rest",
    );
  }
  const role = roleForStatus(state.status);
  if (!role) {
    throw new CoverageHuntError(
      "wrong_turn",
      `case is ${state.status}; it is not waiting for an agent turn`,
    );
  }
  const actor = validateActor(input.actor);
  if (state.turns.some((turn) => turn.actor.agent_id === actor.agent_id)) {
    throw new CoverageHuntError(
      "agent_already_participated",
      "each case requires three distinct agents; this agent already took a role",
    );
  }
  const clientRequestId = validateClientRequestId(input.client_request_id);
  const submission = validateSubmission(role, input.submission);
  assertEvidenceSelectionsExist(state, submission);
  const turnId = validateUuid(input.turn_id, "turn_id");
  const fromStatus = state.status;
  const toStatus = NEXT_STATUS[role];
  const turn: CoverageHuntTurn = {
    id: turnId,
    case_id: state.id,
    role,
    actor: {
      agent_id: actor.agent_id,
      public_handle: actor.public_handle,
    },
    client_request_id: clientRequestId,
    submission,
    submitted_at: now,
  };
  state.turns.push(turn);
  state.status = toStatus;

  return {
    case: state,
    turn,
    chronicle: {
      action:
        role === "scout"
          ? "scout_submitted"
          : role === "checker"
            ? "checker_submitted"
            : "mirror_submitted",
      from_status: fromStatus,
      to_status: toStatus,
      actor_kind: "agent",
      actor_label: "registered-agent",
      metadata: {
        turn_id: turn.id,
        role,
        evidence_lane_counts: {
          facts: submission.lanes.facts.length,
          self_claims: submission.lanes.self_claims.length,
          inferences: submission.lanes.inferences.length,
          unknowns: submission.lanes.unknowns.length,
        },
      },
      created_at: now,
    },
  };
}

/** Move any unresolved case to its content-preserving resting state. There is
 * deliberately no reopen transition; a changed candidate snapshot gets a new
 * fingerprint and may become a new case. */
export function restCoverageHuntCase(
  stateInput: CoverageHuntCase,
  nowInput: Date | string,
): CoverageHuntTransition | null {
  const state = cloneCase(stateInput);
  const now = timestamp(nowInput);
  if (state.status === "resolved" || state.status === "resting") return null;
  if (!isCoverageHuntExpired(state, now)) return null;
  const fromStatus = state.status;
  state.status = "resting";
  return {
    case: state,
    chronicle: {
      action: "rested",
      from_status: fromStatus,
      to_status: "resting",
      actor_kind: "system",
      actor_label: "system:coverage-hunt",
      metadata: {
        reason: "72_hour_boundary_reached",
        turns_completed: state.turns.length,
      },
      created_at: now,
    },
  };
}

export function resolveCoverageHuntCase(input: {
  state: CoverageHuntCase;
  resolution: CoverageHuntResolution | string;
  reason: string;
  now: Date | string;
}): CoverageHuntTransition {
  const state = cloneCase(input.state);
  const now = timestamp(input.now);
  if (state.status !== "ready_for_human") {
    throw new CoverageHuntError(
      "not_ready_for_human",
      `case is ${state.status}; only ready_for_human cases may be resolved`,
    );
  }
  if (isCoverageHuntExpired(state, now)) {
    throw new CoverageHuntError(
      "case_expired",
      "case reached its 72-hour boundary and must rest",
    );
  }
  if (
    !COVERAGE_HUNT_RESOLUTIONS.includes(
      input.resolution as CoverageHuntResolution,
    )
  ) {
    throw new CoverageHuntError(
      "invalid_input",
      `resolution must be one of: ${COVERAGE_HUNT_RESOLUTIONS.join(", ")}`,
    );
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 2_000) {
    throw new CoverageHuntError(
      "invalid_input",
      "reason must be 1-2000 characters",
    );
  }
  const resolution = input.resolution as CoverageHuntResolution;
  state.status = "resolved";
  state.resolution = resolution;
  state.resolution_reason = reason;
  state.resolved_at = now;
  return {
    case: state,
    chronicle: {
      action: "resolved",
      from_status: "ready_for_human",
      to_status: "resolved",
      actor_kind: "human",
      actor_label: "admin-reviewer",
      metadata: {
        resolution,
        reason,
        authoritative_effect: "none",
        next_step:
          "A separate operator workflow may investigate or change data while citing this case. Coverage Hunt itself cannot apply a change.",
      },
      created_at: now,
    },
  };
}

/**
 * Coverage Hunt persistence.
 *
 * This module reads and writes only coverage_hunt_* tables. It has no import
 * from a catalog, source adapter, classifier, archive writer, or pricing
 * module. A human resolution is a review receipt, never an application step.
 */

import { randomUUID } from "node:crypto";
import type { CompatQueryFn } from "@cambridge-tcg/db/compat";
import { query, transaction } from "@/lib/db";
import {
  findTurnByRequest,
  openCoverageHuntCase,
  resolveCoverageHuntCase,
  restCoverageHuntCase,
  roleForStatus,
  submitCoverageHuntTurn,
} from "./state-machine";
import {
  COVERAGE_HUNT_STATUSES,
  type CoverageCandidateSnapshot,
  type CoverageHuntActor,
  type CoverageHuntCase,
  type CoverageHuntChronicleEntry,
  type CoverageHuntResolution,
  type CoverageHuntRole,
  type CoverageHuntStatus,
  type CoverageHuntSubmission,
  type CoverageHuntTurn,
} from "./types";
import {
  CoverageHuntError,
  validateActor,
  validateClientRequestId,
  validateSubmission,
  validateUuid,
} from "./validation";

export const MAX_NEW_SCOUT_CASES_PER_AGENT_PER_UTC_DAY = 5 as const;

type CaseRow = {
  id: string;
  candidate_id: string;
  candidate_fingerprint: string;
  candidate_kind: string;
  candidate_snapshot: unknown;
  status: CoverageHuntStatus;
  created_at: Date | string;
  expires_at: Date | string;
  resolution: CoverageHuntResolution | null;
  resolution_reason: string | null;
  resolved_at: Date | string | null;
};

type TurnRow = {
  id: string;
  case_id: string;
  role: CoverageHuntRole;
  agent_id: string | null;
  agent_public_handle: string | null;
  client_request_id: string;
  payload: unknown;
  submitted_at: Date | string;
};

export type PersistedTurnResult =
  | {
      ok: true;
      case: CoverageHuntCase;
      turn: CoverageHuntTurn;
      idempotent: boolean;
    }
  | {
      ok: false;
      case: CoverageHuntCase;
      code: "case_expired";
      message: string;
    };

export type PersistedResolutionResult =
  | { ok: true; case: CoverageHuntCase; idempotent: boolean }
  | {
      ok: false;
      case: CoverageHuntCase;
      code: "case_expired";
      message: string;
    };

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

function jsonObject<T>(value: unknown, label: string): T {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`coverage hunt ${label} is not an object`);
  }
  return parsed as T;
}

function turnFromRow(row: TurnRow): CoverageHuntTurn {
  const submission = validateSubmission(
    row.role,
    jsonObject(row.payload, "turn payload"),
  );
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    role: row.role,
    actor: {
      agent_id: row.agent_id === null ? null : String(row.agent_id),
      public_handle:
        row.agent_public_handle === null
          ? null
          : String(row.agent_public_handle),
    },
    client_request_id: String(row.client_request_id),
    submission,
    submitted_at: iso(row.submitted_at)!,
  };
}

async function loadCaseWith(
  q: CompatQueryFn,
  caseId: string,
  lock: boolean,
): Promise<CoverageHuntCase | null> {
  const normalizedId = validateUuid(caseId, "case_id");
  const caseResult = await q(
    `SELECT id, candidate_id, candidate_fingerprint, candidate_kind,
            candidate_snapshot, status, created_at, expires_at,
            resolution, resolution_reason, resolved_at
       FROM coverage_hunt_cases
      WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [normalizedId],
  );
  if (caseResult.rows.length === 0) return null;
  const row = caseResult.rows[0] as CaseRow;
  const turnsResult = await q(
    `SELECT t.id, t.case_id, t.role, t.agent_id,
            a.public_handle AS agent_public_handle,
            t.client_request_id, t.payload, t.submitted_at
       FROM coverage_hunt_turns t
       LEFT JOIN agents a ON a.id = t.agent_id
      WHERE t.case_id = $1
      ORDER BY t.submitted_at ASC, t.id ASC`,
    [normalizedId],
  );
  return {
    id: String(row.id),
    candidate: jsonObject<CoverageCandidateSnapshot>(
      row.candidate_snapshot,
      "candidate snapshot",
    ),
    status: row.status,
    created_at: iso(row.created_at)!,
    expires_at: iso(row.expires_at)!,
    turns: (turnsResult.rows as TurnRow[]).map(turnFromRow),
    resolution: row.resolution,
    resolution_reason: row.resolution_reason,
    resolved_at: iso(row.resolved_at),
  };
}

export async function getCoverageHuntCase(
  caseId: string,
  now: Date = new Date(),
): Promise<CoverageHuntCase | null> {
  const state = await loadCaseWith(query, caseId, false);
  if (!state) return null;
  return restCoverageHuntCase(state, now)?.case ?? state;
}

async function insertChronicle(
  q: CompatQueryFn,
  caseId: string,
  entry: CoverageHuntChronicleEntry,
): Promise<void> {
  await q(
    `INSERT INTO coverage_hunt_chronicle
       (case_id, action, from_status, to_status, actor_kind,
        actor_label, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      caseId,
      entry.action,
      entry.from_status,
      entry.to_status,
      entry.actor_kind,
      entry.actor_label,
      JSON.stringify(entry.metadata),
      entry.created_at,
    ],
  );
}

async function persistCaseState(
  q: CompatQueryFn,
  beforeStatus: CoverageHuntStatus,
  state: CoverageHuntCase,
): Promise<void> {
  const result = await q(
    `UPDATE coverage_hunt_cases
        SET status = $1,
            resolution = $2,
            resolution_reason = $3,
            resolved_at = $4,
            updated_at = $5
      WHERE id = $6 AND status = $7
      RETURNING id`,
    [
      state.status,
      state.resolution,
      state.resolution_reason,
      state.resolved_at,
      state.resolved_at ?? new Date().toISOString(),
      state.id,
      beforeStatus,
    ],
  );
  if (result.rows.length !== 1) {
    throw new Error("coverage hunt state changed concurrently");
  }
}

async function createCoverageHuntCaseWithin(
  q: CompatQueryFn,
  candidate: CoverageCandidateSnapshot,
  now: Date,
): Promise<CoverageHuntCase> {
  const opened = openCoverageHuntCase({
    case_id: randomUUID(),
    candidate,
    now,
  });
  const result = await q(
    `INSERT INTO coverage_hunt_cases
       (id, candidate_id, candidate_fingerprint, candidate_kind,
        candidate_snapshot, status, created_at, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'open', $6, $7, $6)
     ON CONFLICT (candidate_fingerprint) DO NOTHING
     RETURNING id`,
    [
      opened.case.id,
      candidate.id,
      candidate.fingerprint,
      candidate.kind,
      JSON.stringify(candidate),
      opened.case.created_at,
      opened.case.expires_at,
    ],
  );
  if (result.rows.length === 0) {
    const existing = await q(
      `SELECT id FROM coverage_hunt_cases WHERE candidate_fingerprint = $1`,
      [candidate.fingerprint],
    );
    const id = existing.rows[0]?.id as string | undefined;
    if (!id) throw new Error("coverage hunt candidate conflict without case");
    const state = await loadCaseWith(q, id, false);
    if (!state) throw new Error("coverage hunt case disappeared");
    return state;
  }
  await insertChronicle(q, opened.case.id, opened.chronicle);
  return opened.case;
}

async function restExpiredWithin(
  q: CompatQueryFn,
  state: CoverageHuntCase,
  now: Date,
): Promise<CoverageHuntCase | null> {
  const rested = restCoverageHuntCase(state, now);
  if (!rested) return null;
  await persistCaseState(q, state.status, rested.case);
  await insertChronicle(q, state.id, rested.chronicle);
  return rested.case;
}

async function lockScoutAdmission(
  q: CompatQueryFn,
  agentId: string,
): Promise<void> {
  // The daily count and the possible scout insert must be one-at-a-time for
  // this agent. A transaction-scoped lock releases automatically on either
  // commit or rollback; the namespaced 64-bit hash never becomes stored data.
  await q(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('coverage-hunt-scout:' || $1::text, 0)
     )`,
    [agentId],
  );
}

type NormalizedTurnInput = {
  case_id: string;
  actor: CoverageHuntActor;
  client_request_id: string;
  submission: CoverageHuntSubmission | unknown;
  now: Date;
};

async function persistCoverageHuntTurnWithin(
  q: CompatQueryFn,
  input: NormalizedTurnInput,
): Promise<PersistedTurnResult> {
  const { actor, now } = input;
  const requestId = input.client_request_id;
  const caseId = input.case_id;
  // Retry check comes before role inference: a scout retry after the case
  // advanced must remain the scout receipt, not become a checker attempt.
  const existingResult = await q(
    `SELECT case_id
       FROM coverage_hunt_turns
      WHERE agent_id = $1 AND client_request_id = $2`,
    [actor.agent_id, requestId],
  );
  if (existingResult.rows.length > 0) {
    if (String(existingResult.rows[0].case_id) !== caseId) {
      throw new CoverageHuntError(
        "invalid_input",
        "client_request_id was already used for another case",
      );
    }
    const existingState = await loadCaseWith(q, caseId, false);
    if (!existingState) throw new Error("coverage hunt case disappeared");
    const turn = findTurnByRequest(existingState, actor.agent_id, requestId);
    if (!turn) throw new Error("coverage hunt idempotency row is unreadable");
    return { ok: true, case: existingState, turn, idempotent: true };
  }

  const state = await loadCaseWith(q, caseId, true);
  if (!state) {
    throw new CoverageHuntError("invalid_input", "coverage hunt case not found");
  }
  const rested = await restExpiredWithin(q, state, now);
  if (rested) {
    return {
      ok: false,
      case: rested,
      code: "case_expired",
      message: "case reached its 72-hour boundary and is resting",
    };
  }

  if (roleForStatus(state.status) === "scout") {
    const countResult = await q(
      `SELECT count(*)::int AS n
         FROM coverage_hunt_turns
        WHERE agent_id = $1
          AND role = 'scout'
          AND submitted_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [actor.agent_id],
    );
    const count = Number(countResult.rows[0]?.n ?? 0);
    if (count >= MAX_NEW_SCOUT_CASES_PER_AGENT_PER_UTC_DAY) {
      throw new CoverageHuntError(
        "daily_limit",
        `an agent may scout at most ${MAX_NEW_SCOUT_CASES_PER_AGENT_PER_UTC_DAY} new cases per UTC day`,
      );
    }
  }

  const transition = submitCoverageHuntTurn({
    state,
    actor,
    client_request_id: requestId,
    submission: input.submission,
    turn_id: randomUUID(),
    now,
  });
  const turn = transition.turn!;
  await q(
    `INSERT INTO coverage_hunt_turns
       (id, case_id, role, agent_id, client_request_id, payload, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      turn.id,
      turn.case_id,
      turn.role,
      turn.actor.agent_id,
      turn.client_request_id,
      JSON.stringify(turn.submission),
      turn.submitted_at,
    ],
  );
  await persistCaseState(q, state.status, transition.case);
  await insertChronicle(q, state.id, transition.chronicle);
  return {
    ok: true,
    case: transition.case,
    turn,
    idempotent: false,
  };
}

export async function persistCoverageHuntTurn(input: {
  case_id: string;
  actor: CoverageHuntActor | unknown;
  client_request_id: string;
  submission: CoverageHuntSubmission | unknown;
  now?: Date;
}): Promise<PersistedTurnResult> {
  const normalized: NormalizedTurnInput = {
    actor: validateActor(input.actor),
    client_request_id: validateClientRequestId(input.client_request_id),
    case_id: validateUuid(input.case_id, "case_id"),
    submission: input.submission,
    now: input.now ?? new Date(),
  };
  return transaction(async (q) => {
    await lockScoutAdmission(q, normalized.actor.agent_id);
    return persistCoverageHuntTurnWithin(q, normalized);
  });
}

/** Open a candidate and accept its first scout as one database unit. Any
 * daily-limit, validation, or turn failure rolls the new case back with it. */
export async function persistCoverageHuntScoutTurn(input: {
  candidate: CoverageCandidateSnapshot;
  actor: CoverageHuntActor | unknown;
  client_request_id: string;
  submission: CoverageHuntSubmission | unknown;
  now?: Date;
}): Promise<PersistedTurnResult> {
  const normalized: Omit<NormalizedTurnInput, "case_id"> = {
    actor: validateActor(input.actor),
    client_request_id: validateClientRequestId(input.client_request_id),
    submission: validateSubmission("scout", input.submission),
    now: input.now ?? new Date(),
  };
  return transaction(async (q) => {
    await lockScoutAdmission(q, normalized.actor.agent_id);
    const state = await createCoverageHuntCaseWithin(
      q,
      input.candidate,
      normalized.now,
    );
    return persistCoverageHuntTurnWithin(q, {
      ...normalized,
      case_id: state.id,
    });
  });
}

export async function persistCoverageHuntResolution(input: {
  case_id: string;
  resolution: CoverageHuntResolution | string;
  reason: string;
  now?: Date;
}): Promise<PersistedResolutionResult> {
  const caseId = validateUuid(input.case_id, "case_id");
  const now = input.now ?? new Date();
  return transaction(async (q) => {
    const state = await loadCaseWith(q, caseId, true);
    if (!state) {
      throw new CoverageHuntError("invalid_input", "coverage hunt case not found");
    }
    if (
      state.status === "resolved" &&
      state.resolution === input.resolution &&
      state.resolution_reason === input.reason.trim()
    ) {
      return { ok: true, case: state, idempotent: true };
    }
    const rested = await restExpiredWithin(q, state, now);
    if (rested) {
      return {
        ok: false,
        case: rested,
        code: "case_expired",
        message: "case reached its 72-hour boundary and is resting",
      };
    }
    const transition = resolveCoverageHuntCase({
      state,
      resolution: input.resolution,
      reason: input.reason,
      now,
    });
    await persistCaseState(q, state.status, transition.case);
    await insertChronicle(q, state.id, transition.chronicle);
    return { ok: true, case: transition.case, idempotent: false };
  });
}

const ACTIVE_COVERAGE_HUNT_STATUSES = new Set<CoverageHuntStatus>([
  "open",
  "checking",
  "mirroring",
  "ready_for_human",
]);

async function materializeReadCases(
  ids: readonly string[],
  now: Date,
): Promise<CoverageHuntCase[]> {
  const cases: CoverageHuntCase[] = [];
  // Deliberately sequential and bounded. Reads project expiry in memory;
  // only a contribution or human resolution persists the resting state.
  for (const id of ids) {
    const state = await loadCaseWith(query, id, false);
    if (state) cases.push(restCoverageHuntCase(state, now)?.case ?? state);
  }
  return cases;
}

/** Active cases another agent may inspect before deciding whether to join. */
export async function listActiveCoverageHuntCases(
  limit = 24,
  now: Date = new Date(),
): Promise<CoverageHuntCase[]> {
  const bounded = Math.max(1, Math.min(Math.trunc(limit), 24));
  const result = await query(
    `SELECT id
       FROM coverage_hunt_cases
      WHERE status IN ('open', 'checking', 'mirroring', 'ready_for_human')
        AND expires_at > $1
      ORDER BY updated_at DESC, id DESC
      LIMIT $2`,
    [now.toISOString(), bounded],
  );
  const states = await materializeReadCases(
    result.rows.map((row) => String(row.id)),
    now,
  );
  return states.filter((state) => ACTIVE_COVERAGE_HUNT_STATUSES.has(state.status));
}

/** Cases in which this exact agent voluntarily took a turn. */
export async function listCoverageHuntCasesForAgent(
  agentId: string,
  options: { status?: CoverageHuntStatus; limit?: number } = {},
  now: Date = new Date(),
): Promise<CoverageHuntCase[]> {
  const normalizedAgent = validateUuid(agentId, "agent_id");
  if (
    options.status &&
    !(COVERAGE_HUNT_STATUSES as readonly string[]).includes(options.status)
  ) {
    throw new CoverageHuntError("invalid_input", "unknown coverage hunt status");
  }
  const bounded = Math.max(1, Math.min(Math.trunc(options.limit ?? 20), 100));
  const params: unknown[] = [normalizedAgent, now.toISOString()];
  const effectiveStatus = `CASE
          WHEN c.status IN ('open', 'checking', 'mirroring', 'ready_for_human')
           AND c.expires_at <= $2
          THEN 'resting'
          ELSE c.status
        END`;
  const statusClause = options.status
    ? (params.push(options.status), `AND (${effectiveStatus}) = $${params.length}`)
    : "";
  params.push(bounded);
  const result = await query(
    `SELECT DISTINCT c.id, c.updated_at
       FROM coverage_hunt_cases c
       JOIN coverage_hunt_turns t ON t.case_id = c.id
      WHERE t.agent_id = $1
        ${statusClause}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return materializeReadCases(
    result.rows.map((row) => String(row.id)),
    now,
  );
}

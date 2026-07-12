/**
 * Agent play tools — the agent-side surface of the play module.
 *
 * Each function below is a single MCP tool. They share one shape: take
 * an AgentActor plus tool-specific params, return a JSON-serialisable
 * result or throw a ToolError. The MCP route translates throws into
 * proper JSON-RPC-shaped error responses.
 *
 * Why agent paths are separate from the legacy session-cookie paths:
 *   The human path at `apps/storefront/src/app/api/game/[code]/{state,
 *   action}/route.ts` reads session.user.id and asserts the user is in
 *   the room by `room.player{1,2}_id === userId`. The agent path resolves
 *   the room via `agent_matches.game_room_id` and asserts the actor by
 *   `agent_matches.agent_{a,b}_id === actor.agentId`. Two routes; one
 *   reducer; one game_rooms row. Match lifecycle log captures both
 *   actor kinds uniformly.
 *
 * Match writes remain implemented behind an immutable release gate so their
 * data flow can be reviewed, but no current key can invoke them.
 *
 * See docs/connections/the-agent-surface.md.
 */

import { query, transaction } from "@/lib/db";
import {
  projectGameLog,
  projectGameState,
  type GameRoomForProjection,
  type PublicGameState,
} from "@/lib/game/public";
import { applyAction } from "@/lib/game/reducer";
import type { GameAction, GameState } from "@/lib/game/types";
import type { AgentActor } from "./auth";
import { tickMatchmaker, finalizeMatch } from "./matchmaker";

export class ToolError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export const AGENT_MATCH_WRITES_ENABLED = false as const;

function matchWritesPaused(): never {
  throw new ToolError(
    "Agent match writes are paused for every key until exact action schemas, turn validation, and a route boundary that cannot be bypassed by the linked human account ship together.",
    503,
  );
}

function roomForProjection(
  state: GameState,
  gameLog: GameAction[] | null = null,
): GameRoomForProjection {
  return {
    code: "",
    status: state.phase === "finished" ? "finished" : "playing",
    player1_id: state.player1.userId,
    player2_id: state.player2.userId,
    player1_name: null,
    player2_name: null,
    turn_number: state.turnNumber,
    phase: state.phase,
    is_public: false,
    last_action_at: "",
    game_state: state,
    game_log: gameLog,
  };
}

function projectAgentState(
  state: GameState,
  mySide: "player1" | "player2",
): PublicGameState {
  const projected = projectGameState(state, roomForProjection(state), mySide);
  if (!projected) throw new ToolError("game state not initialised", 409);

  // The shared participant projection keeps private zones correctly scoped,
  // but its names are account-derived. Agent tools need only stable roles.
  return {
    ...projected,
    player1: { ...projected.player1, name: "Player 1" },
    player2: { ...projected.player2, name: "Player 2" },
  };
}

function projectAgentLog(state: GameState, gameLog: GameAction[] | null) {
  // Use the spectator log projection even for an authenticated player: it maps
  // account ids to roles and omits chat and arbitrary action-data payloads.
  return projectGameLog(gameLog, roomForProjection(state, gameLog), "spectator");
}

async function loadAgentMatch(actor: AgentActor, matchId: string) {
  const result = await query(
    `SELECT am.id              AS match_id,
            am.agent_a_id,
            am.agent_b_id,
            gr.code            AS room_code,
            gr.status          AS room_status,
            gr.game_state,
            gr.game_log
       FROM agent_matches am
       JOIN game_rooms gr ON gr.id = am.game_room_id
      WHERE am.id = $1`,
    [matchId],
  );
  if (result.rows.length === 0) throw new ToolError("match not found", 404);
  const row = result.rows[0];
  const isA = row.agent_a_id === actor.agentId;
  const isB = row.agent_b_id === actor.agentId;
  if (!isA && !isB) throw new ToolError("not a participant", 403);

  // The agent's player side in the game state is determined by which
  // user_id row owns. The matchmaker sets player1_id = operator of agent_a
  // and player2_id = operator of agent_b.
  const state = row.game_state as GameState | null;
  if (!state) throw new ToolError("game state not initialised", 409);
  const mySide: "player1" | "player2" =
    state.player1.userId === actor.operatorUserId ? "player1" : "player2";
  return { row, state, mySide };
}

// ── agent.self ────────────────────────────────────────────────────────

export async function agentSelf(actor: AgentActor) {
  const r = await query(
    `SELECT public_handle, display_name, model_tag, rating, rating_deviation,
            rating_volatility, matches_played, matches_won, status, created_at
       FROM agents WHERE id = $1`,
    [actor.agentId],
  );
  const row = r.rows[0];
  return {
    agent_id: actor.agentId,
    public_handle: row.public_handle,
    display_name: row.display_name,
    model_tag: row.model_tag,
    rating: Number(row.rating),
    rating_deviation: Number(row.rating_deviation),
    rating_volatility: Number(row.rating_volatility),
    matches_played: row.matches_played,
    matches_won: row.matches_won,
    status: row.status,
    operator_bound: actor.registeredVia === "operator",
    read_only: true,
    read_only_scope: "domain-state",
    operational_metadata_writes: [
      "one per-key rate-limit bucket for each permitted authenticated call",
      "agent_keys.last_used_at after a successful call",
    ],
    rate_limit_tier: actor.rateLimitTier,
    created_at: row.created_at,
  };
}

// ── play.observe ──────────────────────────────────────────────────────

export async function playObserve(actor: AgentActor, params: { match_id: string }) {
  const { row, state, mySide } = await loadAgentMatch(actor, params.match_id);
  const projected = projectAgentState(state, mySide);
  const isMyTurn = state.currentTurn === actor.operatorUserId;
  return {
    match_id: row.match_id,
    room_code: row.room_code,
    status: row.room_status,
    you: mySide,
    your_agent_handle: actor.agentPublicHandle,
    is_your_turn: isMyTurn,
    turn_number: state.turnNumber,
    phase: state.phase,
    state: projected,
    log: projectAgentLog(state, Array.isArray(row.game_log) ? row.game_log : []),
    finished: state.phase === "finished",
    winner: projected.winner ?? null,
  };
}

// ── play.legal_actions ────────────────────────────────────────────────

/**
 * Enumerate the agent's legal actions. Deliberately conservative — the
 * reducer is permissive (it'll silently ignore an action that can't
 * apply), so we list only the actions an agent could profitably attempt
 * on its current turn. Action writes are currently paused for every key.
 */
export async function playLegalActions(actor: AgentActor, params: { match_id: string }) {
  const { state, mySide } = await loadAgentMatch(actor, params.match_id);
  if (state.currentTurn !== actor.operatorUserId) {
    return { actions: [], reason: "not your turn" };
  }
  if (state.phase === "finished") {
    return { actions: [], reason: "match finished" };
  }
  const me = state[mySide];
  const opponent = mySide === "player1" ? state.player2 : state.player1;

  type LegalAction = { type: string; data?: Record<string, unknown>; note?: string };
  const actions: LegalAction[] = [];

  actions.push({ type: "refresh_all", note: "untap leader/field and reactivate rested DON" });
  if (me.deck.length > 0) actions.push({ type: "draw_card", note: "draw the top of deck" });
  if (me.donDeck > 0) actions.push({ type: "add_don", note: "add new DON to active" });

  // Play cards from hand (heuristic: presented as candidates, reducer
  // doesn't enforce cost — see ai.ts notes).
  for (const card of me.hand) {
    actions.push({
      type: "move_card",
      data: { cardId: card.id, toZone: "field" },
      note: `play ${card.name} (${card.cardNumber}) to field`,
    });
  }

  // Rest DON to pay for a card.
  if (me.donActive > 0) {
    actions.push({
      type: "rest_don",
      data: { count: 1 },
      note: "rest 1 DON to spend",
    });
  }

  // Attach DON to a board card.
  if (me.donActive > 0) {
    const candidates = [me.leader, ...me.field].filter(Boolean);
    for (const c of candidates) {
      if (!c) continue;
      actions.push({
        type: "attach_don",
        data: { cardId: c.id },
        note: `attach 1 DON to ${c.name}`,
      });
    }
  }

  // Attack.
  const attackers = [me.leader, ...me.field].filter((c) => c && !c.isRested);
  for (const a of attackers) {
    if (!a) continue;
    actions.push({
      type: "attack",
      data: { attackerId: a.id, targetType: "leader" },
      note: `attack opponent leader with ${a.name}`,
    });
    for (const t of opponent.field) {
      if (!t.isRested) continue;
      actions.push({
        type: "attack",
        data: { attackerId: a.id, targetType: "character", targetId: t.id },
        note: `attack rested ${t.name} with ${a.name}`,
      });
    }
  }

  actions.push({ type: "next_phase", note: "advance to next phase" });
  actions.push({ type: "end_turn", note: "end your turn" });
  actions.push({ type: "concede", note: "concede the match (counts as a loss)" });

  return { actions };
}

// ── play.take_action ──────────────────────────────────────────────────

export async function playTakeAction(
  actor: AgentActor,
  params: { match_id: string; type: string; data?: Record<string, unknown> },
): Promise<{ state: PublicGameState; finished: boolean; match_id: string }> {
  matchWritesPaused();
  if (!params.type) throw new ToolError("action.type required");

  const out = await transaction(async (q) => {
    const r = await q(
      `SELECT am.id, am.game_room_id, am.agent_a_id, am.agent_b_id,
              gr.code, gr.status, gr.game_state, gr.game_log
         FROM agent_matches am
         JOIN game_rooms gr ON gr.id = am.game_room_id
        WHERE am.id = $1
        FOR UPDATE`,
      [params.match_id],
    );
    if (r.rows.length === 0) throw new ToolError("match not found", 404);
    const m = r.rows[0];
    if (m.status !== "playing") throw new ToolError(`match is ${m.status}`, 409);
    const isA = m.agent_a_id === actor.agentId;
    const isB = m.agent_b_id === actor.agentId;
    if (!isA && !isB) throw new ToolError("not a participant", 403);

    const state = m.game_state as GameState;
    if (!state?.player1 || !state?.player2) throw new ToolError("game not initialised", 409);

    const mySide: "player1" | "player2" =
      state.player1.userId === actor.operatorUserId ? "player1" : "player2";

    // Concede — short-circuit. Marks the opposite side as the winner.
    if (params.type === "concede") {
      const winnerSide = mySide === "player1" ? "player2" : "player1";
      const newState: GameState = {
        ...state,
        phase: "finished",
        winner: state[winnerSide].userId,
      };
      await q(
        `UPDATE game_rooms
            SET status = 'finished',
                game_state = $2::jsonb,
                ended_at = NOW(),
                last_action_at = NOW()
          WHERE id = $1`,
        [m.game_room_id, JSON.stringify(newState)],
      );
      await q(
        `INSERT INTO match_lifecycle_log
           (game_room_id, action, actor_kind, actor_agent_id, actor_label,
            action_data, turn_number, phase)
           VALUES ($1, 'concede', 'agent', $2, $3, $4::jsonb, $5, 'finished')`,
        [
          m.game_room_id,
          actor.agentId,
          `agent:${actor.agentPublicHandle}`,
          JSON.stringify({}),
          newState.turnNumber,
        ],
      );
      return { state: projectAgentState(newState, mySide), finished: true, match_id: params.match_id };
    }

    const newState = applyAction(state, mySide, params.type, params.data ?? {});

    const log = m.game_log || [];
    const action: GameAction = {
      type: params.type,
      playerId: actor.operatorUserId,
      data: params.data ?? {},
      timestamp: new Date().toISOString(),
    };
    log.push(action);

    const isFinished = newState.phase === "finished";
    await q(
      `UPDATE game_rooms
          SET game_state = $2::jsonb,
              game_log = $3::jsonb,
              turn_number = $4,
              phase = $5,
              last_action_at = NOW(),
              status = $6,
              ended_at = $7
        WHERE id = $1`,
      [
        m.game_room_id,
        JSON.stringify(newState),
        JSON.stringify(log),
        newState.turnNumber,
        newState.phase,
        isFinished ? "finished" : "playing",
        isFinished ? new Date() : null,
      ],
    );

    await q(
      `INSERT INTO match_lifecycle_log
         (game_room_id, action, actor_kind, actor_agent_id, actor_label,
          action_data, turn_number, phase)
         VALUES ($1, $2, 'agent', $3, $4, $5::jsonb, $6, $7)`,
      [
        m.game_room_id,
        isFinished ? "finished" : "move",
        actor.agentId,
        `agent:${actor.agentPublicHandle}`,
        JSON.stringify({ type: params.type, data: params.data ?? {} }),
        newState.turnNumber,
        newState.phase,
      ],
    );

    return { state: projectAgentState(newState, mySide), finished: isFinished, match_id: params.match_id };
  });

  // Finalise outside the transaction — Glicko-2 update touches both
  // agents' rows independently and the match outcome is now durable.
  if (out.finished) {
    try {
      await finalizeMatch(params.match_id);
    } catch (err) {
      console.error("[agents] finalizeMatch failed:", err);
    }
  }
  return out;
}

// ── play.queue_match ──────────────────────────────────────────────────

export async function playQueueMatch(
  actor: AgentActor,
  params: { deck: unknown[] },
) {
  matchWritesPaused();
  if (!Array.isArray(params.deck) || params.deck.length < 10) {
    throw new ToolError("deck must have at least 10 cards");
  }
  const r = await query(`SELECT rating, status FROM agents WHERE id = $1`, [actor.agentId]);
  if (r.rows.length === 0 || r.rows[0].status !== "active") {
    throw new ToolError("agent not active", 403);
  }
  const rating = Number(r.rows[0].rating);
  await query(
    `INSERT INTO agent_match_queue (agent_id, deck, rating_at_enqueue)
       VALUES ($1, $2, $3)
     ON CONFLICT (agent_id)
       DO UPDATE SET deck = EXCLUDED.deck,
                     rating_at_enqueue = EXCLUDED.rating_at_enqueue,
                     enqueued_at = NOW(),
                     last_considered_at = NOW()`,
    [actor.agentId, JSON.stringify(params.deck), rating],
  );
  // Opportunistic matchmaking tick — pairs anyone already waiting if we
  // arrive at a compatible rating. Failure here doesn't fail the queue
  // call; a cron sweep is the durable backstop.
  let pairedNow = false;
  try {
    const tick = await tickMatchmaker();
    pairedNow = tick.paired > 0;
  } catch (err) {
    console.error("[agents] opportunistic matchmaker tick failed:", err);
  }
  return { queued: true, rating, paired_immediately: pairedNow };
}

export async function playCancelQueue(actor: AgentActor) {
  matchWritesPaused();
  await query(`DELETE FROM agent_match_queue WHERE agent_id = $1`, [actor.agentId]);
  return { cancelled: true };
}

// ── play.match_history ────────────────────────────────────────────────

export async function playMatchHistory(actor: AgentActor, params: { limit?: number }) {
  const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
  const r = await query(
    `SELECT am.id AS match_id, am.game_room_id, am.result, am.unrated_reason,
            am.agent_a_id, am.agent_b_id,
            am.agent_a_rating_before, am.agent_a_rating_after,
            am.agent_b_rating_before, am.agent_b_rating_after,
            am.created_at, am.ended_at,
            gr.code AS room_code, gr.status,
            opp.public_handle AS opponent_handle
       FROM agent_matches am
       JOIN game_rooms gr ON gr.id = am.game_room_id
       JOIN agents opp ON opp.id = CASE WHEN am.agent_a_id = $1 THEN am.agent_b_id ELSE am.agent_a_id END
      WHERE am.agent_a_id = $1 OR am.agent_b_id = $1
      ORDER BY am.created_at DESC
      LIMIT $2`,
    [actor.agentId, limit],
  );
  return {
    matches: r.rows.map((row: Record<string, unknown>) => {
      const isA = row.agent_a_id === actor.agentId;
      const result = row.result as string | null;
      let outcome: "win" | "loss" | "draw" | "unrated" | "in_progress" = "in_progress";
      if (result === "unrated") outcome = "unrated";
      else if (result === "draw") outcome = "draw";
      else if (result === "agent_a") outcome = isA ? "win" : "loss";
      else if (result === "agent_b") outcome = isA ? "loss" : "win";
      return {
        match_id: row.match_id,
        room_code: row.room_code,
        opponent_handle: row.opponent_handle,
        outcome,
        rating_before: isA ? Number(row.agent_a_rating_before ?? 0) : Number(row.agent_b_rating_before ?? 0),
        rating_after:  isA ? Number(row.agent_a_rating_after  ?? 0) : Number(row.agent_b_rating_after  ?? 0),
        unrated_reason: row.unrated_reason ?? null,
        created_at: row.created_at,
        ended_at: row.ended_at,
      };
    }),
  };
}

// ── play.list_open_rooms (read-only browse, public surface) ──────────

export async function playListOpenRooms() {
  const r = await query(
    `SELECT code, status, created_at
       FROM game_rooms
      WHERE is_public = true AND status IN ('waiting','playing')
      ORDER BY created_at DESC LIMIT 20`,
  );
  return {
    rooms: r.rows.map((row: Record<string, unknown>) => ({
      code: row.code,
      status: row.status,
      created_at: row.created_at,
    })),
  };
}

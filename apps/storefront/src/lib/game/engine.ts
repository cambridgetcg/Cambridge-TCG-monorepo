// OPTCG Game Engine — manages game state, turns, and actions

import { query } from "@/lib/db";
import type { GameState, GameAction } from "./types";
import { applyAction } from "./reducer";
import {
  refereeAttachDon,
  refereeAttack,
  refereeBeginTurn,
  refereeDefend,
  refereeEndTurn,
  refereeMulligan,
  refereePlay,
  type Seat,
} from "./referee";

// ── Room Management ──

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createRoom(
  userId: string,
  userName: string,
  isPublic: boolean = false,
  rulesMode: "tabletop" | "referee" = "tabletop",
) {
  // Retry once on the (rare) UNIQUE(code) collision instead of 500ing.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    try {
      const result = await query(
        `INSERT INTO game_rooms (code, player1_id, player1_name, is_public, rules_mode)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [code, userId, userName, isPublic, rulesMode]
      );
      return result.rows[0];
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function joinRoom(code: string, userId: string, userName: string) {
  // Rejoin is idempotent: a player already in the room gets it back
  // regardless of status (closing the tab and re-entering the code works).
  const existing = await query(`SELECT * FROM game_rooms WHERE code=$1`, [code]);
  const row = existing.rows[0];
  if (row && (row.player1_id === userId || row.player2_id === userId)) return row;

  if (!row || row.status !== "waiting") return { error: "Room not found or already started." };

  const result = await query(
    `UPDATE game_rooms SET player2_id=$2, player2_name=$3, status='playing', last_action_at=NOW()
     WHERE code=$1 AND status='waiting' RETURNING *`,
    [code, userId, userName]
  );
  return result.rows[0] || { error: "Room no longer available." };
}

export async function getRoom(code: string) {
  const result = await query(`SELECT * FROM game_rooms WHERE code=$1`, [code]);
  return result.rows[0] || null;
}

export async function listPublicRooms() {
  // Rooms idle for 2+ hours are hidden so the list never advertises dead games.
  const result = await query(
    `SELECT code, status, is_public AS "isPublic", created_at AS "createdAt"
     FROM game_rooms
     WHERE is_public=true AND status IN ('waiting','playing')
       AND COALESCE(last_action_at, created_at) > NOW() - interval '2 hours'
     ORDER BY created_at DESC LIMIT 20`
  );
  return result.rows;
}

// ── Game Setup ──
// initializeGame moved to engine-setup.ts (pure, browser-safe) so the
// practice board can import it without this module's DB dependency.
export { initializeGame } from "./engine-setup";

// ── Game Actions ──

export async function performAction(roomCode: string, userId: string, action: GameAction) {
  const room = await getRoom(roomCode);
  if (!room || room.status !== "playing") return { error: "Game not active." };

  const currentState: GameState = room.game_state;
  if (!currentState.player1 || !currentState.player2) return { error: "Game not initialized." };

  const isP1 = currentState.player1.userId === userId;
  const isP2 = currentState.player2.userId === userId;
  if (!isP1 && !isP2) return { error: "You're not in this game." };

  // Optimistic concurrency: every mutating branch below appends exactly one
  // entry to game_log, so its length is the room's action version. Each
  // UPDATE re-checks it — two near-simultaneous actions both reading the
  // same snapshot would otherwise silently erase each other's write (the
  // same lost-update class the setup route's atomic merge fixed).
  const version = (room.game_log || []).length;
  if (version >= 500) {
    return { error: "This game log reached its safety limit. Start a new room." };
  }
  const conflict = { error: "Another action landed at the same time — refresh and try again." };

  // Concede shortcuts the normal reducer flow because it ends the game.
  if (action.type === "concede") {
    currentState.phase = "finished";
    currentState.winner = isP1 ? currentState.player2.userId : currentState.player1.userId;
    const log = room.game_log || [];
    log.push({ ...action, timestamp: new Date().toISOString() });
    const result = await query(
      `UPDATE game_rooms SET status='finished', game_state=$2, game_log=$3, phase='finished', ended_at=NOW(), last_action_at=NOW()
       WHERE code=$1 AND jsonb_array_length(game_log)=$4`,
      [roomCode, JSON.stringify(currentState), JSON.stringify(log), version],
    );
    if (result.rowCount === 0) return conflict;
    return { state: currentState, conceded: userId };
  }

  // Chat is log-only — no state mutation.
  if (action.type === "chat") {
    const log = room.game_log || [];
    log.push({ ...action, timestamp: new Date().toISOString() });
    const result = await query(
      `UPDATE game_rooms SET game_log=$2, last_action_at=NOW()
       WHERE code=$1 AND jsonb_array_length(game_log)=$3`,
      [roomCode, JSON.stringify(log), version],
    );
    if (result.rowCount === 0) return conflict;
    return { state: currentState };
  }

  const seat: Seat = isP1 ? "player1" : "player2";
  let state: GameState;

  if (room.rules_mode === "referee") {
    // Refereed room: the server enforces the official rules — the same
    // seat-generic referee the practice engine uses. Manual tabletop
    // actions are not part of this vocabulary.
    const d = action.data as Record<string, unknown>;
    const step = (() => {
      switch (action.type) {
        case "mulligan":
          return refereeMulligan(currentState, seat, Boolean(d.redraw));
        case "play_card":
          return refereePlay(currentState, seat, String(d.cardId ?? ""));
        case "attach_don":
          return refereeAttachDon(currentState, seat, String(d.cardId ?? ""));
        case "attack":
          return refereeAttack(currentState, seat, {
            attackerId: String(d.attackerId ?? ""),
            targetType: d.targetType === "character" ? "character" : "leader",
            targetId: typeof d.targetId === "string" ? d.targetId : undefined,
          });
        case "defend":
          return refereeDefend(currentState, seat, {
            blockerId: typeof d.blockerId === "string" ? d.blockerId : null,
            counterCardIds: Array.isArray(d.counterCardIds)
              ? (d.counterCardIds as string[])
              : [],
          });
        case "begin_turn":
          return refereeBeginTurn(currentState, seat);
        case "end_turn":
          return refereeEndTurn(currentState, seat);
        default:
          return {
            state: currentState,
            narration: [],
            rejected: {
              ok: false as const,
              code: "not_in_referee_vocabulary",
              reason:
                "This table is refereed — manual tabletop moves aren't available here. Legal moves: play_card, attach_don, attack, defend, begin_turn, end_turn, concede, chat.",
            },
          };
      }
    })();
    if (step.rejected && !step.rejected.ok) {
      return { error: step.rejected.reason, code: step.rejected.code };
    }
    state = step.state;
    // Narration rides the log so both clients (and spectators, and any
    // replay) see the same referee voice.
    if (step.narration.length > 0) {
      action = {
        ...action,
        data: { ...action.data, narration: step.narration },
      };
    }
  } else {
    state = applyAction(currentState, seat, action.type, action.data);
  }

  // Save action to log
  const log = room.game_log || [];
  log.push({ ...action, timestamp: new Date().toISOString() });

  // Save state. A natural finish (attack on a 0-life leader) closes the
  // room row too, so the lobby never advertises finished games.
  if (state.phase === "finished") {
    const result = await query(
      `UPDATE game_rooms SET game_state=$2, game_log=$3, turn_number=$4, phase=$5, status='finished', ended_at=NOW(), last_action_at=NOW()
       WHERE code=$1 AND jsonb_array_length(game_log)=$6`,
      [roomCode, JSON.stringify(state), JSON.stringify(log), state.turnNumber, state.phase, version],
    );
    if (result.rowCount === 0) return conflict;
  } else {
    const result = await query(
      `UPDATE game_rooms SET game_state=$2, game_log=$3, turn_number=$4, phase=$5, last_action_at=NOW()
       WHERE code=$1 AND jsonb_array_length(game_log)=$6`,
      [roomCode, JSON.stringify(state), JSON.stringify(log), state.turnNumber, state.phase, version],
    );
    if (result.rowCount === 0) return conflict;
  }

  return { state };
}

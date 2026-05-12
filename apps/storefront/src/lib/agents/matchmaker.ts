/**
 * Agent matchmaker — pairs queued agents and starts rated matches.
 *
 * Run on a cron tick (every minute, say) and on each successful
 * `play.queue_match` call. Idempotent: a single tick either pairs zero
 * agents or pairs N≥2 of them and creates ⌊N/2⌋ matches.
 *
 * Pairing rules (in order of strictness — collusion guards come first):
 *
 *   1. Same-operator block. Two agents that share `operated_by_user_id`
 *      never pair for a rated match (anti-collusion rule §1).
 *   2. Repeat-pairing cap. Two agents that have played ≥5 rated matches
 *      against each other in the last 24h don't pair (anti-collusion §2).
 *   3. Rating band. Pair agents whose ratings are within a band that
 *      starts narrow and widens with wait time. Widening keeps small
 *      ladders functional even when the population is sparse.
 *
 * When a pair is found, the matcher:
 *   - Deletes both rows from agent_match_queue (atomically, in a
 *     transaction with FOR UPDATE SKIP LOCKED).
 *   - Creates a game_rooms row with status='playing' and the initial
 *     GameState produced by initializeGame (the shared engine helper).
 *   - Creates an agent_matches row stamping pre-match Glicko-2 numbers.
 *   - Writes a 'started' entry to match_lifecycle_log.
 *
 * Match end (when GameState.phase === 'finished') is handled separately
 * — see `finalizeMatch` below — and is triggered by the take_action
 * handler when it sees a finished state.
 */

import { query, transaction } from "@/lib/db";
import { initializeGame } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { updatePair, type GlickoState, type Outcome } from "./glicko2";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface QueuedAgent {
  agent_id: string;
  operated_by_user_id: string;
  rating_at_enqueue: number;
  enqueued_at: Date;
  deck: unknown[];
  public_handle: string;
  display_name: string;
}

/**
 * Compute the rating band width given wait time. Starts narrow, doubles
 * every 30 seconds, caps at ±500 (effectively no band — pair anyone).
 */
function bandWidth(waitMs: number): number {
  const seconds = waitMs / 1000;
  const doublings = Math.floor(seconds / 30);
  return Math.min(50 * Math.pow(2, doublings), 500);
}

async function recentPairCount(a: string, b: string): Promise<number> {
  const r = await query(
    `SELECT count(*)::int AS n
       FROM agent_matches
      WHERE created_at > NOW() - interval '24 hours'
        AND (
          (agent_a_id = $1 AND agent_b_id = $2) OR
          (agent_a_id = $2 AND agent_b_id = $1)
        )
        AND (result IS NULL OR result <> 'unrated')`,
    [a, b],
  );
  return (r.rows[0]?.n as number) ?? 0;
}

export async function tickMatchmaker(): Promise<{ paired: number; pairs: string[] }> {
  const q = await query(
    `SELECT q.agent_id, q.rating_at_enqueue, q.enqueued_at, q.deck,
            a.operated_by_user_id, a.public_handle, a.display_name, a.status
       FROM agent_match_queue q
       JOIN agents a ON a.id = q.agent_id
      WHERE a.status = 'active'
      ORDER BY q.enqueued_at ASC`,
  );
  const queue: QueuedAgent[] = q.rows.map((r: Record<string, unknown>) => ({
    agent_id: r.agent_id as string,
    operated_by_user_id: r.operated_by_user_id as string,
    rating_at_enqueue: Number(r.rating_at_enqueue),
    enqueued_at: new Date(r.enqueued_at as string),
    deck: r.deck as unknown[],
    public_handle: r.public_handle as string,
    display_name: r.display_name as string,
  }));

  const paired: string[] = [];
  const used = new Set<string>();

  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    if (used.has(a.agent_id)) continue;
    const waitMsA = Date.now() - a.enqueued_at.getTime();
    const bandA = bandWidth(waitMsA);

    for (let j = i + 1; j < queue.length; j++) {
      const b = queue[j];
      if (used.has(b.agent_id)) continue;
      if (b.operated_by_user_id === a.operated_by_user_id) continue;
      const waitMsB = Date.now() - b.enqueued_at.getTime();
      const band = Math.max(bandA, bandWidth(waitMsB));
      if (Math.abs(a.rating_at_enqueue - b.rating_at_enqueue) > band) continue;

      // Recent-pair cap (anti-collusion §2). Skips this candidate; keeps looking.
      const recent = await recentPairCount(a.agent_id, b.agent_id);
      if (recent >= 5) continue;

      // Try to atomically claim both rows + create the match.
      const matchId = await tryStartMatch(a, b);
      if (matchId) {
        used.add(a.agent_id);
        used.add(b.agent_id);
        paired.push(matchId);
        break;
      }
    }
  }

  return { paired: paired.length, pairs: paired };
}

async function tryStartMatch(a: QueuedAgent, b: QueuedAgent): Promise<string | null> {
  try {
    return await transaction(async (qx) => {
      // Claim both queue rows with SKIP LOCKED so concurrent matchmakers
      // never double-pair the same agent.
      const claim = await qx(
        `DELETE FROM agent_match_queue
              WHERE agent_id IN ($1, $2)
                AND agent_id IN (
                  SELECT agent_id FROM agent_match_queue
                   WHERE agent_id IN ($1, $2)
                   FOR UPDATE SKIP LOCKED
                )
          RETURNING agent_id`,
        [a.agent_id, b.agent_id],
      );
      if (claim.rows.length !== 2) {
        // Someone else got one of them first; back out.
        return null;
      }

      // Load fresh ratings for the agent_matches snapshot.
      const cur = await qx(
        `SELECT id, rating, rating_deviation, rating_volatility
           FROM agents WHERE id IN ($1, $2)`,
        [a.agent_id, b.agent_id],
      );
      const cmap = new Map<string, { rating: number; rd: number; vol: number }>();
      for (const row of cur.rows) {
        cmap.set(row.id, {
          rating: Number(row.rating),
          rd: Number(row.rating_deviation),
          vol: Number(row.rating_volatility),
        });
      }
      const aCur = cmap.get(a.agent_id)!;
      const bCur = cmap.get(b.agent_id)!;

      // Build the initial GameState. The agents' operator user_ids stand
      // in for "player ids" inside the game state — this is the bridge
      // between agent-space and the gameplay engine which is user-id-shaped.
      const initialState: GameState = initializeGame(
        a.operated_by_user_id,
        `agent:${a.public_handle}`,
        a.deck as Parameters<typeof initializeGame>[2],
        b.operated_by_user_id,
        `agent:${b.public_handle}`,
        b.deck as Parameters<typeof initializeGame>[5],
      );

      // Create the room (status playing immediately — no waiting room for agents).
      const code = generateRoomCode();
      const room = await qx(
        `INSERT INTO game_rooms (code, status, player1_id, player2_id,
                                 player1_name, player2_name, game_state,
                                 current_turn, turn_number, phase, is_public,
                                 last_action_at)
              VALUES ($1, 'playing', $2, $3, $4, $5, $6::jsonb,
                      $7, $8, $9, false, NOW())
           RETURNING id`,
        [
          code,
          a.operated_by_user_id,
          b.operated_by_user_id,
          `agent:${a.public_handle}`,
          `agent:${b.public_handle}`,
          JSON.stringify(initialState),
          initialState.currentTurn,
          initialState.turnNumber,
          initialState.phase,
        ],
      );
      const roomId = room.rows[0].id as string;

      const match = await qx(
        `INSERT INTO agent_matches (
            game_room_id, agent_a_id, agent_b_id,
            agent_a_rating_before, agent_a_rd_before, agent_a_vol_before,
            agent_b_rating_before, agent_b_rd_before, agent_b_vol_before
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          roomId,
          a.agent_id,
          b.agent_id,
          aCur.rating, aCur.rd, aCur.vol,
          bCur.rating, bCur.rd, bCur.vol,
        ],
      );
      const matchId = match.rows[0].id as string;

      await qx(
        `INSERT INTO match_lifecycle_log
           (game_room_id, action, actor_kind, actor_label, action_data,
            turn_number, phase)
           VALUES ($1, 'started', 'system', 'system:matchmaker', $2::jsonb, $3, $4)`,
        [
          roomId,
          JSON.stringify({
            agent_a: a.public_handle,
            agent_b: b.public_handle,
            match_id: matchId,
          }),
          initialState.turnNumber,
          initialState.phase,
        ],
      );

      return matchId;
    });
  } catch (err) {
    console.error("[matchmaker] tryStartMatch failed:", err);
    return null;
  }
}

/**
 * Apply the rated outcome of a finished match. Idempotent — calling
 * twice on the same match is a no-op (result column gates the second
 * call).
 *
 * Called from the take_action handler when it detects `phase === 'finished'`,
 * and also from a sweep that catches matches where take_action raced
 * with a crash and the rating step never ran.
 */
export async function finalizeMatch(matchId: string): Promise<{ rated: boolean; reason?: string }> {
  return await transaction(async (qx) => {
    const r = await qx(
      `SELECT am.id, am.game_room_id, am.agent_a_id, am.agent_b_id, am.result,
              am.agent_a_rating_before, am.agent_a_rd_before, am.agent_a_vol_before,
              am.agent_b_rating_before, am.agent_b_rd_before, am.agent_b_vol_before,
              gr.game_state, gr.status,
              aa.operated_by_user_id AS a_operator,
              ab.operated_by_user_id AS b_operator
         FROM agent_matches am
         JOIN game_rooms gr ON gr.id = am.game_room_id
         JOIN agents aa ON aa.id = am.agent_a_id
         JOIN agents ab ON ab.id = am.agent_b_id
        WHERE am.id = $1
        FOR UPDATE`,
      [matchId],
    );
    if (r.rows.length === 0) return { rated: false, reason: "match not found" };
    const m = r.rows[0];
    if (m.result) return { rated: false, reason: "already finalised" };
    if (m.status !== "finished") return { rated: false, reason: "match not finished" };

    const state = m.game_state as GameState;
    let outcome: Outcome;
    if (!state.winner) {
      outcome = "draw";
    } else if (state.winner === m.a_operator) {
      outcome = "a_wins";
    } else if (state.winner === m.b_operator) {
      outcome = "b_wins";
    } else {
      outcome = "draw";
    }

    // Anti-collusion §1: same operator should never have been paired,
    // but if a future flow somehow lets it happen (admin-created match),
    // mark unrated.
    if (m.a_operator === m.b_operator) {
      await qx(
        `UPDATE agent_matches
            SET result = 'unrated',
                unrated_reason = 'same_operator',
                ended_at = NOW()
          WHERE id = $1`,
        [matchId],
      );
      return { rated: false, reason: "same operator" };
    }

    const aBefore: GlickoState = {
      rating: Number(m.agent_a_rating_before),
      rd: Number(m.agent_a_rd_before),
      vol: Number(m.agent_a_vol_before),
    };
    const bBefore: GlickoState = {
      rating: Number(m.agent_b_rating_before),
      rd: Number(m.agent_b_rd_before),
      vol: Number(m.agent_b_vol_before),
    };
    const { a: aAfter, b: bAfter } = updatePair(aBefore, bBefore, outcome);

    const resultEnum =
      outcome === "a_wins" ? "agent_a" : outcome === "b_wins" ? "agent_b" : "draw";

    await qx(
      `UPDATE agent_matches
          SET result = $2,
              agent_a_rating_after = $3, agent_a_rd_after = $4, agent_a_vol_after = $5,
              agent_b_rating_after = $6, agent_b_rd_after = $7, agent_b_vol_after = $8,
              ended_at = NOW()
        WHERE id = $1`,
      [
        matchId,
        resultEnum,
        aAfter.rating, aAfter.rd, aAfter.vol,
        bAfter.rating, bAfter.rd, bAfter.vol,
      ],
    );

    await qx(
      `UPDATE agents
          SET rating = $2, rating_deviation = $3, rating_volatility = $4,
              matches_played = matches_played + 1,
              matches_won = matches_won + $5,
              updated_at = NOW()
        WHERE id = $1`,
      [m.agent_a_id, aAfter.rating, aAfter.rd, aAfter.vol, outcome === "a_wins" ? 1 : 0],
    );
    await qx(
      `UPDATE agents
          SET rating = $2, rating_deviation = $3, rating_volatility = $4,
              matches_played = matches_played + 1,
              matches_won = matches_won + $5,
              updated_at = NOW()
        WHERE id = $1`,
      [m.agent_b_id, bAfter.rating, bAfter.rd, bAfter.vol, outcome === "b_wins" ? 1 : 0],
    );

    return { rated: true };
  });
}

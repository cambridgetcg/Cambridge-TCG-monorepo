/**
 * /api/v1/play/practice — the stateless practice-battle referee.
 *
 * Xenia for agent players: the guest carries the game state (their own
 * luggage); the house referees every move by the official Comprehensive
 * Rules and lays the table — each response enumerates the legal moves
 * with the damage math previewed. The server stores NOTHING: no row, no
 * identity, no reward. The PVE seal (pve-availability.ts) is untouched
 * because there is nothing durable here to seal.
 *
 * Honest perimeter: a stateless referee cannot notarize. A guest who
 * edits the state they carry is only rearranging their own practice
 * table — results carry no standing anywhere. When durable matches
 * return (server-side rules validation complete), they will run on the
 * sealed, persisted path — not this one.
 *
 *   POST {op:"new", starter_id, level_id, goes_first?: "you"|"opponent"|"toss"}
 *   POST {op:"move", game, move}     — move shapes: see legal_actions
 *   GET  — self-description
 *
 * The engine is the same pure reducer the browser board runs; the rules
 * citations live in docs/research/optcg-rules-alignment.md.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  enumerateLegalActions,
  attack,
  attachDon,
  endTurn,
  playCard,
  resolveDefense,
  resolveMulligans,
  startPracticeSetup,
  PLAYER_ID,
  type PracticeGame,
} from "@/lib/game/practice";
import {
  buildPracticeDeck,
  practiceStarters,
  type StarterCardDetails,
} from "@/lib/play/practice-decks";
import { resolveStarter } from "@/lib/play/starter-resolve";
import { getAdventureLevel, ADVENTURE_LEVELS } from "@/lib/play/adventure-levels";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
} as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status, headers: CORS });
}

/** Server-side art + rules-text enrichment via the same legal collections
 *  the starters API serves. Failure degrades to text faces, never blocks. */
async function detailsFor(starterId: string): Promise<StarterCardDetails> {
  const empty: StarterCardDetails = { images: {}, texts: {}, artists: {} };
  try {
    const resolved = await resolveStarter(starterId);
    if (!resolved) return empty;
    const details: StarterCardDetails = { images: {}, texts: {}, artists: {} };
    for (const c of [resolved.leader, ...resolved.cards]) {
      details.images[c.card_number] = c.image_url ?? null;
      details.artists[c.card_number] = c.artist ?? null;
      if (c.effect_text && c.text_attribution) {
        details.texts[c.card_number] = {
          text: c.effect_text,
          attribution: c.text_attribution,
        };
      }
    }
    return details;
  } catch {
    return empty;
  }
}

function respond(
  game: PracticeGame,
  newLogFrom: number,
  extras: Record<string, unknown> = {},
) {
  const finished = game.state.phase === "finished";
  return NextResponse.json(
    {
      "@kind": "practice_match_step",
      game,
      new_log: game.log.slice(newLogFrom),
      legal_actions: enumerateLegalActions(game),
      finished,
      winner: finished
        ? game.state.winner === PLAYER_ID
          ? "you"
          : "opponent"
        : null,
      stateless_referee: {
        note: "Nothing is stored server-side. You carry the game — including the AI seat's hidden hand, deck order, and life cards, which statelessness cannot conceal from their own custodian. Peeking only spoils your own practice. The referee applies the official rules to each move and lists your legal options. Practice results carry no standing — durable matches remain paused until server-side rules validation completes.",
        rules: "docs/research/optcg-rules-alignment.md (Comprehensive Rules v1.2.0, 2026-01-16)",
      },
      _links: {
        canonical: "/api/v1/play/practice",
        guide: "/api/v1/guides/play-a-practice-match",
        siblings: "/api/v1/play/index.json",
        methodology: "/methodology/play-module",
      },
      ...extras,
    },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("invalid_json", "Request body must be valid JSON.");
  }

  if (body.op === "new") {
    const starterId = String(body.starter_id ?? "");
    const starters = practiceStarters();
    if (!starters.some((s) => s.id === starterId)) {
      return err(
        "unknown_starter",
        `starter_id must be one of: ${starters.map((s) => s.id).join(", ")}`,
      );
    }
    const levelId = Number(body.level_id ?? 1);
    const level = getAdventureLevel(levelId);
    if (!level) {
      return err("unknown_level", `level_id must be 1-${ADVENTURE_LEVELS.length}.`);
    }
    const goesFirstRaw = String(body.goes_first ?? "toss");
    const playerGoesFirst =
      goesFirstRaw === "you"
        ? true
        : goesFirstRaw === "opponent"
          ? false
          : Math.random() < 0.5;

    const [mine, theirs] = await Promise.all([
      detailsFor(starterId),
      detailsFor(level.aiStarterId),
    ]);
    const player = buildPracticeDeck(starterId, mine);
    const ai = buildPracticeDeck(level.aiStarterId, theirs);
    if (!player || !ai) return err("deck_build_failed", "Could not build decks.", 500);

    const game = startPracticeSetup(
      "You",
      player.deck,
      level.opponentName,
      ai.deck,
      level.aiAggression,
      playerGoesFirst,
    );
    return respond(game, 0, {
      level: {
        id: level.id,
        title: level.title,
        opponent: level.opponentName,
        difficulty: level.difficulty,
        opponent_deck: ai.starter.display_name,
      },
    });
  }

  if (body.op === "move") {
    const game = body.game as PracticeGame | undefined;
    const move = body.move as { type?: string } | undefined;
    if (!game?.state?.player1 || !game?.state?.player2 || !move?.type) {
      return err("bad_request", "op:'move' needs { game, move:{type,...} }.");
    }
    const from = game.log?.length ?? 0;
    try {
      switch (move.type) {
        case "mulligan": {
          const r = resolveMulligans(game, Boolean((move as { redraw?: boolean }).redraw));
          return respond(r.game, from);
        }
        case "play": {
          const r = playCard(game, String((move as { cardId?: string }).cardId ?? ""));
          if (r.rejected && !r.rejected.ok) return respond(game, from, { rejected: r.rejected });
          return respond(r.game, from);
        }
        case "attach_don": {
          const r = attachDon(game, String((move as { cardId?: string }).cardId ?? ""));
          if (r.rejected && !r.rejected.ok) return respond(game, from, { rejected: r.rejected });
          return respond(r.game, from);
        }
        case "attack": {
          const m = move as { attackerId?: string; targetType?: string; targetId?: string };
          const r = attack(
            game,
            String(m.attackerId ?? ""),
            m.targetType === "character" ? "character" : "leader",
            m.targetId,
          );
          if (r.rejected && !r.rejected.ok) return respond(game, from, { rejected: r.rejected });
          return respond(r.game, from);
        }
        case "defend": {
          const m = move as { blockerId?: string | null; counterCardIds?: string[] };
          const r = resolveDefense(game, {
            blockerId: m.blockerId ?? null,
            counterCardIds: Array.isArray(m.counterCardIds) ? m.counterCardIds : [],
          });
          if (r.rejected && !r.rejected.ok) return respond(game, from, { rejected: r.rejected });
          return respond(r.game, from);
        }
        case "end_turn": {
          const r = endTurn(game);
          if (r.rejected && !r.rejected.ok) return respond(game, from, { rejected: r.rejected });
          return respond(r.game, from);
        }
        default:
          return err("unknown_move", `Unknown move type "${move.type}". See legal_actions.`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err("engine_error", `The referee stumbled: ${message}`, 500);
    }
  }

  return err("unknown_op", 'op must be "new" or "move".');
}

export async function GET() {
  const starters = practiceStarters();
  return NextResponse.json(
    {
      "@kind": "practice_referee_description",
      what: "Stateless practice-battle referee for the One Piece TCG vanilla engine. You carry the game state; each POST applies one move under the official rules and returns your legal options with the math previewed.",
      how: {
        new_game: {
          method: "POST",
          body: {
            op: "new",
            starter_id: starters.map((s) => s.id),
            level_id: `1-${ADVENTURE_LEVELS.length}`,
            goes_first: ["you", "opponent", "toss (default)"],
          },
        },
        move: {
          method: "POST",
          body: { op: "move", game: "<the game object from the previous response>", move: "<one of legal_actions[].move>" },
        },
      },
      scope: "Costs, power, counters, blockers, Rush/Double Attack/Banish, mulligan, and the full battle steps are real. Other card effects are not interpreted yet — every card's verbatim text (with attribution) rides along so you can read what will one day fire.",
      nothing_durable: "No storage, no identity, no rewards. Practice results carry no standing.",
      _links: {
        guide: "/api/v1/guides/play-a-practice-match",
        siblings: "/api/v1/play/index.json",
        rules_research: "docs/research/optcg-rules-alignment.md",
      },
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

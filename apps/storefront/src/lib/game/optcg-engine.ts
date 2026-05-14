/**
 * OPTCG implementation of the @cambridge-tcg/play GameEngine contract.
 *
 * Phase 1 of the multi-game play roadmap (S47). This adapter wraps the
 * existing OPTCG functions in `engine.ts`, `reducer.ts`, and `ai.ts`
 * into the GameEngine interface so the PVE route can dispatch through
 * the registry instead of importing OPTCG-specific symbols directly.
 *
 * Nothing else changes: the same `initializeGame`/`applyAction`/`aiTurn`
 * code path is invoked. The substantive shift is that the route stops
 * knowing whether it's OPTCG.
 *
 * When Phase 2 lands Pokémon, this file gets a sibling
 * `pokemon-engine.ts` registering under code "pokemon" — the route
 * doesn't change.
 */

import type {
  GameEngine,
  InitializeArgs,
  AITurnResult,
  VictoryResult,
  DeckCard,
} from "@cambridge-tcg/play";
import { initializeGame as optcgInitializeGame } from "./engine";
import { applyAction } from "./reducer";
import { aiTurn as optcgAiTurn, generateAIDeck as optcgGenerateAIDeck } from "./ai";
import type { GameState } from "./types";

function formatActionForLog(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "move_card": return `moved a card to ${data.toZone}`;
    case "toggle_rest": return "toggled rest on a card";
    case "attach_don": return "attached DON!! to a card";
    case "detach_don": return "detached DON!! from a card";
    case "rest_don": return `rested ${data.count} DON!!`;
    case "refresh_all": return "refreshed all cards";
    case "draw_card": return "drew a card";
    case "add_don": return "added DON!! from deck";
    case "take_damage": return "took damage (life to hand)";
    case "attack":
      return data.targetType === "leader"
        ? "attacks the leader!"
        : "attacks a character!";
    case "next_phase": return "advanced to next phase";
    case "end_turn": return "ended turn";
    default: return type;
  }
}

export const optcgEngine: GameEngine<GameState> = {
  gameCode: "optcg",
  displayName: "One Piece TCG",
  terminalPhases: ["finished"],

  initializeGame(args: InitializeArgs): GameState {
    return optcgInitializeGame(
      args.humanUserId,
      args.humanName,
      args.humanDeck as Parameters<typeof optcgInitializeGame>[2],
      args.aiId,
      args.aiName,
      args.aiDeck as Parameters<typeof optcgInitializeGame>[5],
    );
  },

  applyAction(state, playerKey, type, data) {
    return applyAction(state, playerKey, type, data);
  },

  aiTurn(state, aiKey, levelHint): AITurnResult {
    const aggression = levelHint.aiAggression ?? 0.5;
    return optcgAiTurn(state, aiKey, aggression);
  },

  victoryCheck(state: GameState, humanUserId: string): VictoryResult | null {
    if (state.phase !== "finished") return null;
    if (state.winner !== humanUserId) return null;
    return {
      winner: state.winner,
      why: "life-out",
      turnsPlayed: state.turnNumber,
      summary: {
        lifeRemaining: state.player1.lifeCount,
      },
    };
  },

  formatActionForLog,

  generateAIDeck(setCode: string, catalog: unknown[]): DeckCard[] {
    return optcgGenerateAIDeck(setCode, catalog as Parameters<typeof optcgGenerateAIDeck>[1]) as DeckCard[];
  },
};

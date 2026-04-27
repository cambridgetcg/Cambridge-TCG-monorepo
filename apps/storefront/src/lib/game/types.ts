// OPTCG Virtual Tabletop Types

export interface GameCard {
  id: string;          // unique instance ID
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  // Game state
  isRested: boolean;   // tapped/untapped
  attachedDon: number; // DON!! cards attached
  zone: CardZone;
  position: number;    // order within zone
  faceDown: boolean;
}

export type CardZone =
  | "leader"
  | "field"       // character area (max 5)
  | "stage"       // stage area (max 1)
  | "hand"
  | "life"        // face-down life cards
  | "trash"
  | "don_active"  // DON!! in cost area (active)
  | "don_rested"  // DON!! rested
  | "don_deck"    // DON!! not yet in play
  | "deck";

export interface PlayerState {
  userId: string;
  name: string;
  // Zones
  leader: GameCard | null;
  field: GameCard[];        // max 5
  stage: GameCard | null;
  hand: GameCard[];
  life: GameCard[];         // face-down
  trash: GameCard[];
  deck: GameCard[];         // remaining deck (face-down)
  donActive: number;        // active DON!! count
  donRested: number;        // rested DON!! count
  donDeck: number;          // DON!! not yet drawn
  // Counters
  lifeCount: number;
}

export interface GameState {
  player1: PlayerState;
  player2: PlayerState;
  currentTurn: string;      // userId of active player
  turnNumber: number;
  phase: GamePhase;
  firstPlayer: string;
  winner?: string;          // userId of winner when phase === "finished"
}

export type GamePhase = "setup" | "refresh" | "draw" | "don" | "main" | "end" | "counter" | "finished";

export interface GameAction {
  type: string;
  playerId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface GameRoom {
  id: string;
  code: string;
  status: "waiting" | "playing" | "finished" | "abandoned";
  player1Id: string | null;
  player2Id: string | null;
  player1Name: string | null;
  player2Name: string | null;
  gameState: GameState | null;
  turnNumber: number;
  phase: string;
  gameLog: GameAction[];
  isPublic: boolean;
  lastActionAt: string;
  createdAt: string;
}

export const PHASES: GamePhase[] = ["refresh", "draw", "don", "main", "end"];

export const PHASE_LABELS: Record<GamePhase, string> = {
  setup: "Setup",
  refresh: "Refresh Phase",
  draw: "Draw Phase",
  don: "DON!! Phase",
  main: "Main Phase",
  end: "End Phase",
  counter: "Counter Step",
  finished: "Game Over",
};

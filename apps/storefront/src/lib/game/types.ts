// OPTCG Virtual Tabletop Types

/** Card category per the official game. `null` = unknown (catalog rows
 *  without stats); consumers must degrade honestly, not guess. */
export type CardCategory = "leader" | "character" | "event" | "stage";

export interface GameCard {
  id: string;          // unique instance ID
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  // Printed stats — optional; present when the card came from a source
  // that carries them (e.g. the encoded starter decks). Absent stats mean
  // "unknown", never "zero" — rules that need them must say so.
  category?: CardCategory | null;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  color?: string | null;
  /** Printed Leader life — leaders only. */
  life?: number | null;
  /** Verbatim EN effect text (legal collection). The recorded publication
   *  rule requires textAttribution rendered wherever this is shown. */
  textEn?: string | null;
  textAttribution?: string | null;
  /** Illustrator credit where one exists — rendered as "illustrated by". */
  artist?: string | null;
  /** Unconditionally possessed keywords (verified data); conditional
   *  grants are Phase-4 effects and absent here. */
  keywords?: ("rush" | "blocker" | "double_attack" | "banish")[];
  /** Printed [Trigger] section exists (reveal label only until Phase 4). */
  hasTrigger?: boolean;
  // Game state
  isRested: boolean;   // tapped/untapped
  attachedDon: number; // DON!! cards attached
  zone: CardZone;
  position: number;    // order within zone
  faceDown: boolean;
  /** Turn this card entered the field — lets rules enforce "characters
   *  can't attack the turn they're played". Absent on pre-existing games. */
  turnPlayed?: number;
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
  /** Turn number the begin_turn upkeep last ran for — makes begin_turn
   *  idempotent within a turn (and lets the server reject re-runs). */
  lastUpkeepTurn?: number;
  /** AI aggression for practice battles (0-1). Lives in the state so a
   *  saved-and-resumed game keeps its difficulty. */
  aiAggression?: number;
  /** A declared attack awaiting the DEFENDER's block/counter decision
   *  (Block Step 7-1-2 + Counter Step 7-1-3). Lives in the state so it
   *  serializes with the game — a PvP room row or a carried practice
   *  game resumes mid-battle. */
  pendingDefense?: {
    defender: "player1" | "player2";
    attackerId: string;
    targetType: "leader" | "character";
    targetId?: string;
  } | null;
  /** Referee-mode setup: per-seat mulligan decisions. Both recorded →
   *  life is dealt and the first turn begins. */
  setupDecisions?: {
    player1?: { redraw: boolean };
    player2?: { redraw: boolean };
  };
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

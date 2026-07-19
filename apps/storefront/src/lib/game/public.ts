import type { GameAction, GameCard, GameState, PlayerState } from "./types";

export type GameRole = "player1" | "player2";
export type GameViewer = GameRole | "spectator";

export interface PublicPlayerState extends Omit<PlayerState, "userId"> {
  role: GameRole;
}

export interface PublicGameState {
  player1: PublicPlayerState;
  player2: PublicPlayerState;
  currentTurn: GameRole | null;
  turnNumber: number;
  phase: GameState["phase"];
  firstPlayer: GameRole | null;
  winner?: GameRole;
  lastUpkeepTurn?: number;
}

export interface PublicGameAction {
  type: string;
  player: GameRole | null;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface GameRoomForProjection {
  code: string;
  status: "waiting" | "playing" | "finished" | "abandoned";
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  turn_number: number;
  phase: string;
  is_public: boolean;
  rules_mode?: string | null;
  last_action_at: string;
  game_state: GameState | null;
  game_log: GameAction[] | null;
}

export function gameViewer(room: GameRoomForProjection, userId?: string): GameViewer {
  if (userId && room.player1_id === userId) return "player1";
  if (userId && room.player2_id === userId) return "player2";
  return "spectator";
}

export function canViewGameRoom(room: GameRoomForProjection, viewer: GameViewer): boolean {
  return room.is_public || viewer !== "spectator";
}

function roleForId(room: GameRoomForProjection, userId: string | undefined): GameRole | null {
  if (!userId) return null;
  if (userId === room.player1_id) return "player1";
  if (userId === room.player2_id) return "player2";
  return null;
}

function cloneCard(card: GameCard): GameCard {
  return { ...card };
}

function hiddenCard(card: GameCard): GameCard {
  return {
    id: `${card.zone}:${card.position}`,
    sku: "",
    name: "?",
    cardNumber: "?",
    imageUrl: null,
    rarity: null,
    isRested: false,
    attachedDon: 0,
    zone: card.zone,
    position: card.position,
    faceDown: true,
  };
}

function projectPlayer(
  player: PlayerState,
  role: GameRole,
  viewer: GameViewer,
): PublicPlayerState {
  const hidePrivateZones = viewer === "spectator" || viewer !== role;
  const projectZone = (cards: GameCard[], hidden: boolean) =>
    (cards ?? []).map(hidden ? hiddenCard : cloneCard);

  return {
    role,
    name: viewer === "spectator" ? (role === "player1" ? "Player 1" : "Player 2") : player.name,
    leader: player.leader ? cloneCard(player.leader) : null,
    field: projectZone(player.field, false),
    stage: player.stage ? cloneCard(player.stage) : null,
    hand: projectZone(player.hand, hidePrivateZones),
    life: projectZone(player.life, hidePrivateZones),
    trash: projectZone(player.trash, false),
    deck: projectZone(player.deck, hidePrivateZones),
    donActive: player.donActive,
    donRested: player.donRested,
    donDeck: player.donDeck,
    lifeCount: player.lifeCount,
  };
}

export function projectGameState(
  state: GameState | null,
  room: GameRoomForProjection,
  viewer: GameViewer,
): PublicGameState | null {
  if (!state?.player1 || !state?.player2) return null;

  const winner = roleForId(room, state.winner);
  return {
    player1: projectPlayer(state.player1, "player1", viewer),
    player2: projectPlayer(state.player2, "player2", viewer),
    currentTurn: roleForId(room, state.currentTurn),
    turnNumber: state.turnNumber,
    phase: state.phase,
    firstPlayer: roleForId(room, state.firstPlayer),
    ...(winner ? { winner } : {}),
    ...(state.lastUpkeepTurn !== undefined ? { lastUpkeepTurn: state.lastUpkeepTurn } : {}),
    // Referee-mode surfaces. pendingDefense is seat-keyed (no account ids)
    // and public at a real table — both players see a declared attack.
    // Mulligan decisions project as decided-flags only until both are in.
    ...(state.pendingDefense ? { pendingDefense: state.pendingDefense } : {}),
    ...(state.setupDecisions
      ? {
          setupDecided: {
            player1: Boolean(state.setupDecisions.player1),
            player2: Boolean(state.setupDecisions.player2),
          },
        }
      : {}),
  };
}

export function projectGameLog(
  log: GameAction[] | null,
  room: GameRoomForProjection,
  viewer: GameViewer,
): PublicGameAction[] {
  return (log ?? [])
    .slice(-20)
    .filter((entry) => viewer !== "spectator" || entry.type !== "chat")
    .map((entry) => ({
      type: entry.type,
      player: roleForId(room, entry.playerId),
      timestamp: entry.timestamp,
      ...(viewer === "spectator" ? {} : { data: { ...entry.data } }),
    }));
}

export function projectGameResponse(room: GameRoomForProjection, viewer: GameViewer) {
  const spectator = viewer === "spectator";
  return {
    room: {
      code: room.code,
      status: room.status,
      rulesMode: room.rules_mode ?? "tabletop",
      player1Name: spectator ? "Player 1" : room.player1_name,
      player2Name: spectator ? (room.player2_id ? "Player 2" : null) : room.player2_name,
      turnNumber: room.turn_number,
      phase: room.phase,
      isPublic: room.is_public,
      lastActionAt: room.last_action_at,
    },
    state: projectGameState(room.game_state, room, viewer),
    log: projectGameLog(room.game_log, room, viewer),
    you: viewer,
  };
}

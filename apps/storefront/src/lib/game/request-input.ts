export const MAX_GAME_DECK_CARDS = 101;
export const MAX_GAME_ACTION_DATA_BYTES = 4_096;
export const MAX_GAME_CHAT_LENGTH = 500;

export interface GameDeckInputCard {
  [key: string]: unknown;
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  isLeader?: boolean;
}

type InputResult<T> = { ok: true; value: T } | { ok: false; error: string };

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

export function validateGameDeck(
  value: unknown,
): InputResult<GameDeckInputCard[]> {
  if (!Array.isArray(value) || value.length < 10) {
    return { ok: false, error: "Deck must have at least 10 cards." };
  }
  if (value.length > MAX_GAME_DECK_CARDS) {
    return {
      ok: false,
      error: `Deck cannot exceed ${MAX_GAME_DECK_CARDS} cards.`,
    };
  }

  const deck: GameDeckInputCard[] = [];
  let leaders = 0;
  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return { ok: false, error: "Every deck entry must be a card object." };
    }
    const card = candidate as Record<string, unknown>;
    const sku = boundedString(card.sku, 80);
    const name = boundedString(card.name, 300);
    const cardNumber = boundedString(card.cardNumber, 80);
    if (!sku || !name || !cardNumber) {
      return {
        ok: false,
        error: "Every card needs bounded sku, name, and cardNumber strings.",
      };
    }

    const imageUrl =
      card.imageUrl === null || card.imageUrl === undefined
        ? null
        : boundedString(card.imageUrl, 2_048);
    const rarity =
      card.rarity === null || card.rarity === undefined
        ? null
        : boundedString(card.rarity, 40);
    if (
      (card.imageUrl != null && imageUrl === null) ||
      (card.rarity != null && rarity === null)
    ) {
      return { ok: false, error: "Card imageUrl or rarity is invalid." };
    }
    if (card.isLeader !== undefined && typeof card.isLeader !== "boolean") {
      return { ok: false, error: "Card isLeader must be a boolean." };
    }

    if (card.isLeader === true) leaders += 1;
    deck.push({
      sku,
      name,
      cardNumber,
      imageUrl,
      rarity,
      ...(card.isLeader === true ? { isLeader: true } : {}),
    });
  }

  if (leaders !== 1) {
    return { ok: false, error: "Deck must contain exactly one Leader card." };
  }
  return { ok: true, value: deck };
}

export function validateGameAction(
  body: unknown,
): InputResult<{ type: string; data: Record<string, unknown> }> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Action body must be a JSON object." };
  }
  const input = body as Record<string, unknown>;
  const type = boundedString(input.type, 64);
  if (!type) return { ok: false, error: "Invalid action type." };

  const data = input.data === undefined ? {} : input.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Action data must be a JSON object." };
  }
  let dataBytes: number;
  try {
    dataBytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  } catch {
    return { ok: false, error: "Action data must be JSON-serializable." };
  }
  if (dataBytes > MAX_GAME_ACTION_DATA_BYTES) {
    return { ok: false, error: "Action data is too large." };
  }

  if (type === "chat") {
    const message = boundedString(
      (data as Record<string, unknown>).message,
      MAX_GAME_CHAT_LENGTH,
    );
    if (!message) {
      return { ok: false, error: "Chat message is empty or too long." };
    }
    return { ok: true, value: { type, data: { message } } };
  }

  return { ok: true, value: { type, data: data as Record<string, unknown> } };
}

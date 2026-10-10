import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/game/pve-actor", () => ({
  resolveActor: mocks.resolveActor,
}));
import { GET, POST } from "./route";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.resolveActor.mockReset();
});

describe("PVE mutation boundary", () => {
  it("removes image-reference identity and credit from hidden zones when resuming a saved game", async () => {
    const reference = createCardNumberImageReference("op", "ST01-001", "OP-ST01-001-EN-P1");
    const card = { id: "c1", sku: "OP-ST01-001-JP", name: "Leader", cardNumber: "ST01-001", imageUrl: "https://example.test/card.png", imageAttribution: "Publisher credit", imageReference: reference, rarity: "L", zone: "hand", faceDown: true };
    const player = { leader: card, hand: [card], deck: [card], life: [card] };
    const state = { player1: player, player2: player };
    mocks.resolveActor.mockResolvedValue({ userId: "user-1", isGuest: false });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 1, level_number: 1, opponent_name: "Opponent" }] }).mockResolvedValueOnce({ rows: [{ id: "game-1", game_state: state, status: "playing" }] });
    const response = await GET(new Request("https://example.test/api/game/pve/1?gameId=game-1"), { params: Promise.resolve({ levelId: "1" }) });
    const body = await response.json();
    for (const hidden of [...body.state.player2.hand, ...body.state.player2.deck, ...body.state.player2.life, ...body.state.player1.life]) {
      expect(hidden).toMatchObject({ imageUrl: null, imageAttribution: null, imageReference: null });
    }
    expect(body.state.player1.hand[0].imageReference).toEqual(reference);
    expect(state.player2.hand[0].imageReference).toEqual(reference);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("pauses every action before auth, params, body, or database work", async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
    } as unknown as Request;

    const response = await POST(request, {
      params: new Promise(() => {}),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(body).toMatchObject({
      mode: "read_only",
      mutations_enabled: false,
      rewards_enabled: false,
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.resolveActor).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

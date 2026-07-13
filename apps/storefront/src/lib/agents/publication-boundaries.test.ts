import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCard, GameState, PlayerState } from "@/lib/game/types";
import type { AgentActor } from "./auth";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  txQuery: vi.fn(),
  finalizeMatch: vi.fn(),
  tickMatchmaker: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock("./matchmaker", () => ({
  finalizeMatch: mocks.finalizeMatch,
  tickMatchmaker: mocks.tickMatchmaker,
}));

import { AGENT_TOOLS } from "@/lib/agent-tools-catalog";
import {
  catalogSearch,
  leaderboardsRead,
  pricesRecent,
} from "./platform-tools";
import {
  agentSelf,
  playListOpenRooms,
  playMatchHistory,
  playObserve,
  playTakeAction,
} from "./play-tools";
import { deckSave } from "./write-tools";

const OPERATOR_A = "11111111-1111-4111-8111-111111111111";
const OPERATOR_B = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIVATE_NAME_A = "PRIVATE-PLAYER-ONE-NAME-SENTINEL";
const PRIVATE_NAME_B = "PRIVATE-PLAYER-TWO-NAME-SENTINEL";
const PRIVATE_LOG = "PRIVATE-LOG-PAYLOAD-SENTINEL";
const PRIVATE_MODEL = "PRIVATE-MODEL-TAG-SENTINEL";

const actor: AgentActor = {
  kind: "agent",
  agentId: AGENT_A,
  agentPublicHandle: "public-agent-a",
  operatorUserId: OPERATOR_A,
  registeredVia: "operator",
  keyId: "key-a",
  rateLimitTier: "free",
};

function card(id: string, name: string, zone: GameCard["zone"]): GameCard {
  return {
    id,
    sku: `sku-${id}`,
    name,
    cardNumber: id,
    imageUrl: null,
    rarity: "secret",
    isRested: false,
    attachedDon: 0,
    zone,
    position: 0,
    faceDown: zone === "hand" || zone === "life" || zone === "deck",
  };
}

function player(userId: string, name: string, handName: string): PlayerState {
  return {
    userId,
    name,
    leader: null,
    field: [],
    stage: null,
    hand: [card(`${handName}-id`, handName, "hand")],
    life: [],
    trash: [],
    deck: [],
    donActive: 0,
    donRested: 0,
    donDeck: 10,
    lifeCount: 0,
  };
}

function gameState(): GameState {
  return {
    player1: player(OPERATOR_A, PRIVATE_NAME_A, "OWN-HAND-CARD"),
    player2: player(
      OPERATOR_B,
      PRIVATE_NAME_B,
      "OPPONENT-HIDDEN-CARD-SENTINEL",
    ),
    currentTurn: OPERATOR_A,
    turnNumber: 4,
    phase: "finished",
    firstPlayer: OPERATOR_B,
    winner: OPERATOR_A,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (work: (q: typeof mocks.txQuery) => Promise<unknown>) =>
      work(mocks.txQuery),
  );
  mocks.finalizeMatch.mockResolvedValue({ rated: true });
  mocks.tickMatchmaker.mockResolvedValue({ paired: 0 });
});

describe("agent publication boundaries", () => {
  it("keeps the ladder status-only and stops before the database", async () => {
    const result = await leaderboardsRead(actor, {
      kind: "agents",
      limit: 100,
    });

    expect(result).toEqual({
      kind: "agents",
      publication_status: "paused_pending_publication_receipt",
      available: false,
      rows: [],
      reason:
        "The agent ladder is not published until a versioned participant publication receipt exists.",
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("display_name");
    expect(JSON.stringify(result)).not.toContain("model_tag");
    expect(JSON.stringify(result)).not.toContain("operator");
  });

  it("keeps recent prices status-only and performs no price read", async () => {
    const result = await pricesRecent(actor, {
      sku: "op-op01-001-en",
      days: 90,
    });

    expect(result).toEqual({
      publication_status: "paused_pending_source_rights",
      available: false,
      reason:
        "Recent price observations are not published while source rights are unresolved.",
    });
    expect(mocks.query).not.toHaveBeenCalled();
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("retail_gbp");
    expect(encoded).not.toContain("price_gbp");
    expect(result).not.toHaveProperty("observations");
  });

  it("returns catalog publication status without reading catalog rows", async () => {
    const result = await catalogSearch(actor, { q: "Luffy" });

    expect(result).toMatchObject({
      publication_status: "paused_pending_field_level_rights",
      available: false,
      sources: ["catalog-publication-policy"],
      source_license: ["cc0"],
      license: "NOASSERTION",
      results: [],
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("projects observed state and logs to roles without account identity", async () => {
    const state = gameState();
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          match_id: "match-observe",
          game_room_id: "room-id",
          agent_a_id: AGENT_A,
          agent_b_id: AGENT_B,
          room_code: "PUBLIC1",
          room_status: "finished",
          game_state: state,
          game_log: [
            {
              type: "chat",
              playerId: OPERATOR_A,
              data: { message: PRIVATE_LOG },
              timestamp: "2026-07-12T10:00:00.000Z",
            },
            {
              type: "move_card",
              playerId: OPERATOR_B,
              data: { account_id: OPERATOR_B, payload: PRIVATE_LOG },
              timestamp: "2026-07-12T10:01:00.000Z",
            },
          ],
        },
      ],
      rowCount: 1,
    });

    const result = await playObserve(actor, { match_id: "match-observe" });
    const encoded = JSON.stringify(result);

    expect(result.state.currentTurn).toBe("player1");
    expect(result.state.firstPlayer).toBe("player2");
    expect(result.state.winner).toBe("player1");
    expect(result.winner).toBe("player1");
    expect(result.state.player1.name).toBe("Player 1");
    expect(result.state.player2.name).toBe("Player 2");
    expect(result.state.player1.hand[0]?.name).toBe("OWN-HAND-CARD");
    expect(result.state.player2.hand[0]?.name).toBe("?");
    expect(result.log).toEqual([
      {
        type: "move_card",
        player: "player2",
        timestamp: "2026-07-12T10:01:00.000Z",
      },
    ]);
    for (const sentinel of [
      OPERATOR_A,
      OPERATOR_B,
      PRIVATE_NAME_A,
      PRIVATE_NAME_B,
      PRIVATE_LOG,
      "OPPONENT-HIDDEN-CARD-SENTINEL",
      "playerId",
      "userId",
      "winner_userId",
    ]) {
      expect(encoded).not.toContain(sentinel);
    }
  });

  it("stops match actions before any transaction or participant read", async () => {
    await expect(
      playTakeAction(actor, {
        match_id: "match-action",
        type: "concede",
      }),
    ).rejects.toThrow("Agent match writes are paused");

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txQuery).not.toHaveBeenCalled();
  });

  it("withholds raw room names from the open-room browse tool", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          code: "PUBLIC3",
          status: "waiting",
          created_at: "2026-07-12T10:00:00.000Z",
          player1_name: PRIVATE_NAME_A,
          player2_name: PRIVATE_NAME_B,
        },
      ],
      rowCount: 1,
    });

    const result = await playListOpenRooms();
    const sql = String(mocks.query.mock.calls[0]?.[0]);
    const encoded = JSON.stringify(result);

    expect(sql).not.toContain("player1_name");
    expect(sql).not.toContain("player2_name");
    expect(result).toEqual({
      rooms: [
        {
          code: "PUBLIC3",
          status: "waiting",
          created_at: "2026-07-12T10:00:00.000Z",
        },
      ],
    });
    expect(encoded).not.toContain(PRIVATE_NAME_A);
    expect(encoded).not.toContain(PRIVATE_NAME_B);
  });

  it("publishes only the opponent handle and computed match statistics", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          match_id: "match-history",
          agent_a_id: AGENT_A,
          agent_b_id: AGENT_B,
          result: "agent_a",
          opponent_handle: "public-agent-b",
          opponent_model_tag: PRIVATE_MODEL,
          agent_a_rating_before: "1500",
          agent_a_rating_after: "1515",
          created_at: "2026-07-12T10:00:00.000Z",
          ended_at: "2026-07-12T10:30:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const result = await playMatchHistory(actor, { limit: 1 });
    const sql = String(mocks.query.mock.calls[0]?.[0]);
    const encoded = JSON.stringify(result);

    expect(sql).not.toContain("model_tag");
    expect(result.matches[0]).toMatchObject({
      opponent_handle: "public-agent-b",
      outcome: "win",
      rating_before: 1500,
      rating_after: 1515,
    });
    expect(encoded).not.toContain(PRIVATE_MODEL);
    expect(encoded).not.toContain("opponent_model_tag");
  });

  it("keeps operator account ids internal and stops deck writes", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          public_handle: actor.agentPublicHandle,
          display_name: "calling agent",
          model_tag: "calling-model",
          rating: "1500",
          rating_deviation: "350",
          rating_volatility: "0.06",
          matches_played: 0,
          matches_won: 0,
          status: "active",
          created_at: "2026-07-12T10:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const self = await agentSelf(actor);
    await expect(
      deckSave(actor, {
        name: "test",
        entries: [{ sku: "op-op01-001-en", quantity: 1 }],
      }),
    ).rejects.toThrow("Agent deck writes are paused");

    expect(self.operator_bound).toBe(true);
    expect(self.read_only).toBe(true);
    expect(JSON.stringify(self)).not.toContain(OPERATOR_A);
    expect(self).not.toHaveProperty("operator_user_id");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("describes a self-serve key without implying operator delegation", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          public_handle: "self-serve-agent",
          display_name: "self-serve agent",
          model_tag: "undeclared",
          rating: "1500",
          rating_deviation: "350",
          rating_volatility: "0.06",
          matches_played: 0,
          matches_won: 0,
          status: "active",
          created_at: "2026-07-12T10:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const self = await agentSelf({
      ...actor,
      operatorUserId: OPERATOR_B,
      registeredVia: "self-serve",
    });

    expect(self.operator_bound).toBe(false);
    expect(self.read_only).toBe(true);
    expect(JSON.stringify(self)).not.toContain(OPERATOR_B);
  });

  it("does not advertise operator account identifiers in the tool catalog", () => {
    const encoded = JSON.stringify(AGENT_TOOLS);
    const priceTool = AGENT_TOOLS.find(
      (tool) => tool.dotted_name === "prices.recent",
    );

    expect(encoded).not.toContain("operator_user_id");
    expect(encoded).not.toContain("saved_for_user_id");
    expect(priceTool?.description).toContain("status only");
    expect(JSON.stringify(priceTool?.example_output_shape)).not.toContain(
      "price_gbp",
    );
    for (const name of [
      "play.take_action",
      "play.queue_match",
      "play.cancel_queue",
      "deck.save",
    ]) {
      const tool = AGENT_TOOLS.find((entry) => entry.dotted_name === name);
      expect(tool).toMatchObject({
        availability: "paused",
        example_output_shape: {
          isError: true,
          content: [
            {
              type: "text",
              text: expect.stringContaining("paused for every key"),
            },
          ],
        },
      });
      expect(JSON.stringify(tool?.example_output_shape)).not.toMatch(
        /"(?:queued|cancelled|deck_id|finished)"\s*:/,
      );
    }
    expect(
      AGENT_TOOLS.find((tool) => tool.dotted_name === "mcp.list_tools"),
    ).toMatchObject({
      gating: "public",
      authority: "public-discovery",
      availability: "available",
    });
  });
});

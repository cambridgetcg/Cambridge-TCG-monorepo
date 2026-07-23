import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkoutSessionBelongsToAccount,
} from "@/lib/privacy/checkout-session";
import {
  hasAccountLinkedPrefix,
  projectClientSeed,
} from "@/lib/privacy/proof-seed";
import {
  aliasDistributionRows,
  drawOutcomeReplayReason,
  hasPublicDistributionSample,
  projectDrawProof,
} from "@/lib/privacy/draw-proof";
import {
  canViewGameRoom,
  gameViewer,
  projectGameResponse,
  type GameRoomForProjection,
} from "@/lib/game/public";
import { sha256Hex, verifyPull } from "@/lib/bounty/verify-client";
import type { GameCard, GameState, PlayerState } from "@/lib/game/types";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function card(id: string, name: string): GameCard {
  return {
    id,
    sku: `sku-${id}`,
    name,
    cardNumber: id,
    imageUrl: null,
    rarity: "secret",
    isRested: false,
    attachedDon: 0,
    zone: "hand",
    position: 0,
    faceDown: false,
  };
}

function player(userId: string, name: string): PlayerState {
  return {
    userId,
    name,
    leader: null,
    field: [],
    stage: null,
    hand: [card(`${name}-hand`, `${name} secret`)],
    life: [],
    trash: [],
    deck: [],
    donActive: 0,
    donRested: 0,
    donDeck: 10,
    lifeCount: 0,
  };
}

function room(isPublic: boolean): GameRoomForProjection {
  const state: GameState = {
    player1: player(P1, "alice-email-localpart"),
    player2: player(P2, "bob-email-localpart"),
    currentTurn: P1,
    turnNumber: 4,
    phase: "main",
    firstPlayer: P2,
    winner: P1,
  };
  return {
    code: "ABC123",
    status: "playing",
    player1_id: P1,
    player2_id: P2,
    player1_name: "alice-email-localpart",
    player2_name: "bob-email-localpart",
    turn_number: 4,
    phase: "main",
    is_public: isPublic,
    last_action_at: "2026-07-11T20:00:00.000Z",
    game_state: state,
    game_log: [
      { type: "chat", playerId: P1, data: { message: "private chat" }, timestamp: "2026-07-11T19:58:00.000Z" },
      { type: "move_card", playerId: P2, data: { cardId: "operational-card", toZone: "field" }, timestamp: "2026-07-11T19:59:00.000Z" },
    ],
  };
}

describe("residual privacy boundaries", () => {
  it("withholds legacy account-linked proof seeds from anonymous viewers", async () => {
    const legacy = `${P1}:abcdef`;
    expect(hasAccountLinkedPrefix(legacy)).toBe(true);
    expect(projectClientSeed(legacy, false)).toEqual({
      clientSeed: null,
      display: "[withheld: legacy account-linked seed]",
      outcomeReplayAvailable: false,
      withheld: true,
    });
    expect(projectClientSeed(legacy, true).clientSeed).toBe(legacy);

    const opaque = "draw:abcdef";
    expect(projectClientSeed(opaque, false).clientSeed).toBe(opaque);

    const commitment = await sha256Hex("server-seed");
    const partial = await verifyPull({
      commitment,
      serverSeed: "server-seed",
      clientSeed: null,
      nonce: 7,
      rarityWeights: { common: 1 },
      rolledRarity: "common",
    });
    expect(partial.commitmentMatches).toBe(true);
    expect(partial.outcomeReplayAvailable).toBe(false);
    expect(partial.rarityMatches).toBeNull();
    expect(partial.ok).toBeNull();
  });

  it("establishes checkout ownership before showing an order", () => {
    const account = { id: P1, email: "Collector@Example.com" };
    expect(checkoutSessionBelongsToAccount({
      customer_details: { email: " collector@example.com " },
    }, account)).toBe(true);
    expect(checkoutSessionBelongsToAccount({
      customer_email: "someone-else@example.com",
    }, account)).toBe(false);
    expect(checkoutSessionBelongsToAccount({
      metadata: { user_id: P2 },
      customer_email: "collector@example.com",
    }, account)).toBe(false);
    expect(checkoutSessionBelongsToAccount({
      metadata: { user_id: P1 },
    }, account)).toBe(true);
  });

  it("denies private-room spectators and removes account identity from public state", () => {
    const privateRoom = room(false);
    expect(canViewGameRoom(privateRoom, gameViewer(privateRoom))).toBe(false);
    expect(canViewGameRoom(privateRoom, gameViewer(privateRoom, P1))).toBe(true);

    const publicRoom = room(true);
    const projection = projectGameResponse(publicRoom, "spectator");
    const encoded = JSON.stringify(projection);
    expect(projection.room.player1Name).toBe("Player 1");
    expect(projection.room.player2Name).toBe("Player 2");
    expect(projection.state?.currentTurn).toBe("player1");
    expect(projection.state?.firstPlayer).toBe("player2");
    expect(projection.state?.winner).toBe("player1");
    expect(projection.log).toEqual([{
      type: "move_card",
      player: "player2",
      timestamp: "2026-07-11T19:59:00.000Z",
    }]);
    expect(encoded).not.toContain(P1);
    expect(encoded).not.toContain(P2);
    expect(encoded).not.toContain("email-localpart");
    expect(encoded).not.toContain("private chat");
    expect(encoded).not.toContain("operational-card");
    expect(encoded).not.toContain("secret");
  });

  it("keeps participant action detail without returning account ids", () => {
    const participant = projectGameResponse(room(false), "player1");
    const encoded = JSON.stringify(participant);
    expect(participant.log).toHaveLength(2);
    expect(participant.log[1].data).toEqual({ cardId: "operational-card", toZone: "field" });
    expect(participant.state?.player1.hand[0].name).toBe("alice-email-localpart secret");
    expect(participant.state?.player2.hand[0].name).toBe("?");
    expect(encoded).not.toContain(P1);
    expect(encoded).not.toContain(P2);
    expect(encoded).not.toContain("playerId");
  });

  it("keeps order confirmation and trade routing behind identity gates", () => {
    const order = source("src/app/order-confirmation/page.tsx");
    expect(order.indexOf("const account = await auth()"))
      .toBeLessThan(order.indexOf("checkout.sessions.retrieve"));
    expect(order.lastIndexOf("checkoutSessionBelongsToAccount"))
      .toBeLessThan(order.lastIndexOf("recordOrderFromStripeSession"));
    expect(order).toContain("notFound()");

    const escrow = source("src/lib/escrow/service-tiers.ts");
    expect(escrow).toContain("viewerId: string");
    expect(escrow).toContain("(t.buyer_id=$2 OR t.seller_id=$2)");
  });

  it("prevents shared caching of identity-dependent GET responses", () => {
    for (const route of [
      "src/app/api/bounty/vault/route.ts",
      "src/app/api/escrow/routing/route.ts",
      "src/app/api/escrow/trust/route.ts",
      "src/app/api/escrow/external-rep/route.ts",
      "src/app/api/market/lots/route.ts",
    ]) {
      expect(source(route)).toContain(
        'const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" }',
      );
    }

    const vault = source("src/app/api/bounty/vault/route.ts");
    expect(vault).toContain("status: 401, headers: PRIVATE_NO_STORE");
    expect(vault).toContain("{ headers: PRIVATE_NO_STORE },");

    const trust = source("src/app/api/escrow/trust/route.ts");
    expect(trust).toContain("{ headers: PRIVATE_NO_STORE }");

    const externalRep = source("src/app/api/escrow/external-rep/route.ts");
    const externalRepGet = externalRep.slice(0, externalRep.indexOf("// POST"));
    expect(externalRepGet).toContain("{ headers: PRIVATE_NO_STORE }");
    expect(externalRepGet).toContain("status: 403, headers: PRIVATE_NO_STORE");

    const lotsGet = source("src/app/api/market/lots/route.ts").slice(
      0,
      source("src/app/api/market/lots/route.ts").indexOf("// POST"),
    );
    expect(lotsGet).toContain("{ lots, total }, { headers: PRIVATE_NO_STORE }");
  });

  it("uses opaque future seeds and narrow public proof payloads", () => {
    expect(source("src/lib/provable-draw/index.ts")).toContain("`draw:${generateClientSeedSuffix()}`");

    const drawRoute = source("src/app/api/verify/draw/[id]/route.ts");
    expect(drawRoute).not.toContain("subject_id");
    expect(drawRoute).toContain("projectClientSeed");
    expect(drawRoute).toContain("projectDrawProof");

    const internalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secondInternalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const publicDraw = projectDrawProof(
      { [internalId]: 0.25, [secondInternalId]: 0.75 },
      {
        picked: secondInternalId,
        roll: 0.5,
        extra: { pool_id: internalId },
        weight_order: [internalId, secondInternalId],
      },
    );
    expect(publicDraw).toEqual({
      weights: { option_1: 0.25, option_2: 0.75 },
      weightOrder: ["option_1", "option_2"],
      weightOrderStatus: "valid",
      outcome: { picked: "option_2", roll: 0.5 },
    });
    expect(JSON.stringify(publicDraw)).not.toContain(internalId);
    expect(JSON.stringify(publicDraw)).not.toContain(secondInternalId);

    const legacyDraw = projectDrawProof(
      { [internalId]: 0.25, [secondInternalId]: 0.75 },
      { picked: secondInternalId, roll: 0.5 },
    );
    expect(legacyDraw.weightOrder).toBeNull();
    expect(legacyDraw.weightOrderStatus).toBe("missing");
    expect(drawOutcomeReplayReason({
      revealed: true,
      hasServerSeed: true,
      weightOrderStatus: legacyDraw.weightOrderStatus,
      clientSeedAvailable: true,
      hasExpectedOutcome: true,
    })).toBe("ordered_weight_contract_missing");

    expect(hasPublicDistributionSample(29, 145, 30)).toBe(false);
    expect(hasPublicDistributionSample(30, 30, 30)).toBe(true);
    const publicRows = aliasDistributionRows([
      { key: internalId, observed_count: 35 },
      { key: secondInternalId, observed_count: 31 },
    ]);
    expect(publicRows).toEqual([
      { key: "option_1", observed_count: 35 },
      { key: "option_2", observed_count: 31 },
    ]);
    expect(JSON.stringify(publicRows)).not.toContain(internalId);

    const fairnessRoute = source("src/app/api/verify/fairness/route.ts");
    expect(fairnessRoute).toContain("total_pulls: null");
    expect(fairnessRoute).toContain("draw_count: null");
    expect(fairnessRoute).toContain("rows: []");
    expect(fairnessRoute).toContain("aliasDistributionRows(rows.slice(0, 12))");

    for (const route of [
      "src/app/api/verify/pull/[id]/route.ts",
      "src/app/api/verify/draw/[id]/route.ts",
    ]) {
      const contents = source(route);
      expect(contents).toContain('const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" }');
      expect(contents).toContain("{ headers: PRIVATE_NO_STORE }");
      expect(contents).toContain("status: 404, headers: PRIVATE_NO_STORE");
    }

    expect(source("src/app/api/verify/pull/[id]/route.ts"))
      .not.toContain("id: row.vault_item_id");

    const healthRoute = source("src/app/api/verify/health/route.ts");
    const failureSelect = healthRoute.slice(
      healthRoute.indexOf("const recentFailures"),
      healthRoute.indexOf("// Open drift alerts"),
    );
    expect(failureSelect).not.toContain("subject_id");
    const alertSelect = healthRoute.slice(
      healthRoute.indexOf("const openAlerts"),
      healthRoute.indexOf("const allAlertCount"),
    );
    expect(alertSelect).not.toContain("summary");

    const accountProofs = source("src/app/api/account/proofs/route.ts");
    expect(accountProofs).toContain('const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" }');
    expect(accountProofs).toContain("status: 401, headers: PRIVATE_NO_STORE");
    expect(accountProofs).toContain("{ headers: PRIVATE_NO_STORE }");

    const rooms = source("src/lib/game/engine.ts");
    const publicRooms = rooms.slice(rooms.indexOf("export async function listPublicRooms"), rooms.indexOf("// ── Game Setup"));
    expect(publicRooms).not.toContain("player1_name");
    expect(publicRooms).not.toContain("player2_name");
    expect(publicRooms).not.toContain("SELECT id");

    const actionRoute = source("src/app/api/game/[code]/action/route.ts");
    expect(actionRoute).toContain("NextResponse.json({ ok: true })");
    expect(actionRoute).not.toContain("NextResponse.json(result)");

    const setupRoute = source("src/app/api/game/[code]/setup/route.ts");
    expect(setupRoute).not.toContain("firstPlayer: gameState.firstPlayer");
  });
});

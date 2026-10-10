import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import { getStarterDeck } from "@/lib/play/starter-decks";
import { resolveStarter, type ResolvedStarterCard } from "@/lib/play/starter-resolve";
import { POST } from "./route";

vi.mock("@/lib/play/starter-resolve", () => ({ resolveStarter: vi.fn() }));
const resolve = vi.mocked(resolveStarter);
const starter = getStarterDeck("st-01-red-luffy")!;
const reference = createCardNumberImageReference("op", "ST01-001", "OP-ST01-001-EN-P1")!;
const leader: ResolvedStarterCard = {
  card_number: "ST01-001", quantity: 1, role: "leader", resolved: true, sku: "OP-ST01-001-JP", name: "Leader",
  image_url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-ST01-001-EN-P1.png",
  image_attribution: "Publisher credit", image_reference: reference, rarity: "L", set_code: "ST01",
  effect_text: "Example effect", text_attribution: "Text credit", artist: "Catalog artist",
};
const request = () => new NextRequest("https://example.test/api/v1/play/practice", { method: "POST", body: JSON.stringify({ op: "new", starter_id: starter.id, level_id: 1, goes_first: "you" }) });
beforeEach(() => { resolve.mockReset(); });

describe("stateless practice media", () => {
  it("uses the shared projection and retains the full encoded deck across JSON responses", async () => {
    resolve.mockResolvedValue({ deck: starter, leader, cards: [] });
    const response = await POST(request());
    const body = await response.json();
    expect(resolve).toHaveBeenCalledExactlyOnceWith(starter.id);
    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const player of [body.game.state.player1, body.game.state.player2]) {
      expect(player.leader).toMatchObject({ imageUrl: leader.image_url, imageAttribution: "Publisher credit", imageReference: reference, textEn: "Example effect", textAttribution: "Text credit", artist: "Catalog artist", power: 5000 });
      expect(player.hand.length + player.deck.length + player.life.length).toBe(50);
    }
    expect(body.stateless_referee.note).toContain("Nothing is stored server-side");
  });

  it("starts playable text-face decks if enrichment fails", async () => {
    resolve.mockRejectedValue(new Error("offline fixture"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.game.state.player1.leader).toMatchObject({ imageUrl: null, imageAttribution: null, imageReference: null, power: 5000 });
    expect(body.game.state.player1.hand.length + body.game.state.player1.deck.length).toBe(50);
  });

  it("rejects unattributed official art without losing independently attributed text", async () => {
    resolve.mockResolvedValue({ deck: starter, leader: { ...leader, image_attribution: null }, cards: [] });
    const body = await (await POST(request())).json();
    expect(body.game.state.player1.leader).toMatchObject({ imageUrl: null, imageReference: null, textEn: "Example effect", textAttribution: "Text credit" });
  });

  it("starts an encoded game even when optional resolver initialization fails without database configuration", async () => {
    vi.resetModules();
    vi.doMock("@/lib/play/starter-resolve", () => {
      throw new Error("@cambridge-tcg/db: DATABASE_URL environment variable is required");
    });
    try {
      const { POST: withoutDatabase } = await import("./route");
      const response = await withoutDatabase(request());
      const body = await response.json();
      expect(response.status).toBe(200);
      for (const player of [body.game.state.player1, body.game.state.player2]) {
        expect(player.leader).toMatchObject({ imageUrl: null, imageAttribution: null, imageReference: null, power: 5000 });
        expect(player.hand.length + player.deck.length + player.life.length).toBe(50);
      }
      expect(resolve).not.toHaveBeenCalled();
    } finally {
      vi.doMock("@/lib/play/starter-resolve", () => ({ resolveStarter: resolve }));
      vi.resetModules();
    }
  });
});

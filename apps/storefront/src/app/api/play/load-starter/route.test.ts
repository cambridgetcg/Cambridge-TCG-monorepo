import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import { getStarterDeck } from "@/lib/play/starter-decks";
import { resolveStarter, type ResolvedStarterCard } from "@/lib/play/starter-resolve";
import { GET } from "./route";

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
beforeEach(() => { resolve.mockReset(); });

describe("starter load media contract", () => {
  it("preserves card quantity, raw SKU and image/text metadata without enabling durable play", async () => {
    resolve.mockResolvedValue({ deck: starter, leader, cards: [{ ...leader, role: null, quantity: 4 }] });
    const response = await GET(new Request(`https://example.test/api/play/load-starter?id=${starter.id}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.deck).toHaveLength(5);
    for (const card of body.deck) expect(card).toMatchObject({ sku: leader.sku, imageUrl: leader.image_url, imageAttribution: leader.image_attribution, imageReference: reference, textEn: leader.effect_text, textAttribution: leader.text_attribution, artist: leader.artist });
    expect(body.start_pve).toBeNull();
    expect(body.pve).toMatchObject({ mutations_enabled: false, rewards_enabled: false });
  });

  it("withholds incomplete official artwork while preserving an otherwise resolved leader", async () => {
    resolve.mockResolvedValue({ deck: starter, leader: { ...leader, image_attribution: null }, cards: [] });
    const body = await (await GET(new Request(`https://example.test/api/play/load-starter?id=${starter.id}`))).json();
    expect(body.deck[0]).toMatchObject({ imageUrl: null, imageAttribution: null, imageReference: null, textEn: "Example effect" });
  });

  it("preserves unknown-starter and unresolved-leader responses", async () => {
    resolve.mockResolvedValueOnce(null).mockResolvedValueOnce({ deck: starter, leader: { ...leader, resolved: false }, cards: [] });
    const request = new Request(`https://example.test/api/play/load-starter?id=${starter.id}`);
    expect((await GET(request)).status).toBe(404);
    expect((await GET(request)).status).toBe(503);
  });
});

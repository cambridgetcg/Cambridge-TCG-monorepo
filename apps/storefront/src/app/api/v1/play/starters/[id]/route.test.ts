import { describe, expect, it, vi } from "vitest";
import { getStarterDeck } from "@/lib/play/starter-decks";
import { resolveStarter } from "@/lib/play/starter-resolve";
import { GET } from "./route";

vi.mock("@/lib/play/starter-resolve", () => ({ resolveStarter: vi.fn() }));

const mockResolveStarter = vi.mocked(resolveStarter);

describe("GET /api/v1/play/starters/[id] rights boundary", () => {
  it("does not relicense resolved catalog fields as CC0", async () => {
    const deck = getStarterDeck("st-01-red-luffy");
    expect(deck).not.toBeNull();

    mockResolveStarter.mockResolvedValueOnce({
      deck: deck!,
      leader: {
        card_number: deck!.leader_card_number,
        quantity: 1,
        role: "leader",
        resolved: true,
        sku: "op-st01-001-en",
        name: "Upstream leader name",
        image_url: "https://upstream.example/leader.jpg",
        rarity: "L",
        set_code: "ST01",
        effect_text: null,
        text_attribution: null,
      },
      cards: [],
    });

    const response = await GET(
      new Request("https://cambridgetcg.example/api/v1/play/starters/st-01-red-luffy"),
      { params: Promise.resolve({ id: "st-01-red-luffy" }) },
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual(["ctcg-derived", "wholesale-rds.cards"]);
    expect(body._meta.source_license).toEqual(["cc0", "proprietary"]);
    expect(body._meta.license).toBe("NOASSERTION");
  });
});

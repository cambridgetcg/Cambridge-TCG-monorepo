import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublicDeckBySlug,
  incrementViewCount,
  listPublicDecks,
} from "@/lib/decks/db";
import { GET as getPublicDeck } from "./[slug]/route";
import { GET as listPublicDecksRoute } from "./route";

vi.mock("@/lib/decks/db", () => ({
  getPublicDeckBySlug: vi.fn(),
  incrementViewCount: vi.fn(),
  listPublicDecks: vi.fn(),
}));

const mockGetPublicDeckBySlug = vi.mocked(getPublicDeckBySlug);
const mockIncrementViewCount = vi.mocked(incrementViewCount);
const mockListPublicDecks = vi.mocked(listPublicDecks);

const legacyDeck = {
  id: "deck-1",
  slug: "shared-deck",
  name: "Shared deck",
  leader_sku: "op-op01-001-en",
  entries: [
    {
      sku: "op-op01-001-en",
      quantity: 1,
      card: {
        sku: "op-op01-001-en",
        card_number: "OP01-001",
        name: "Leader",
        set_code: "OP01",
        set_name: "Romance Dawn",
        rarity: "L",
        image_url: "https://legacy-upstream.example/leader.jpg",
        spot_price: 9876.54,
        reference_price_gbp: 9876.54,
      },
    },
  ],
  notes: null,
  tags: ["red"],
  view_count: 4,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockIncrementViewCount.mockResolvedValue(undefined);
});

describe("public deck legacy snapshot boundary", () => {
  it("redacts every card snapshot in public deck detail", async () => {
    mockGetPublicDeckBySlug.mockResolvedValue(legacyDeck as never);

    const response = await getPublicDeck(
      new Request("https://cambridgetcg.example/api/decks/public/shared-deck"),
      { params: Promise.resolve({ slug: "shared-deck" }) },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.deck.entries[0].card).toMatchObject({
      image_url: null,
      spot_price: null,
    });
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("9876.54");
    expect(serialized).not.toContain("reference_price_gbp");
  });

  it("redacts the leader snapshot in the public deck list", async () => {
    mockListPublicDecks.mockResolvedValue([legacyDeck] as never);

    const response = await listPublicDecksRoute();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.decks[0].leader_card).toMatchObject({
      image_url: null,
      spot_price: null,
    });
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("9876.54");
    expect(serialized).not.toContain("reference_price_gbp");
  });
});

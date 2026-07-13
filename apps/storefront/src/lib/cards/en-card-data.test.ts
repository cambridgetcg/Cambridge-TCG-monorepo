import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { enCardKey, enCardKeyFromParts, getEnCardData } from "./en-card-data";

// Mock the shared db so importing the module never opens a real connection and
// so each test controls exactly which row the field-level query "returns".
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

// Mirror of the module's CDN default so URL assertions stay deterministic even
// when the environment overrides the host (same precedence as the source).
const EXPECTED_CDN = (
  process.env.CTCG_CARD_IMAGE_CDN ||
  "https://ctcg-card-images.s3.us-east-1.amazonaws.com"
).replace(/\/$/, "");

// A publisher page we must NEVER serve as an image src — kept only as metadata.
const SOURCE_URL =
  "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png";
const ATTRIBUTION =
  "© Eiichiro Oda/Shueisha, Toei Animation — card image shown to identify the item for trade";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("Bandai EN card-data boundary", () => {
  it("preserves the internal join-key helpers", () => {
    expect(enCardKeyFromParts("op", "op01", "001")).toBe("OP-OP01-001-EN");
    expect(enCardKey("OP-OP01-001-JP-V11DZ")).toBe("OP-OP01-001-EN");
    expect(enCardKey("SEALED-OP01-BOX-JP")).toBeNull();
  });

  it("returns all-null without touching the db when the sku carries no EN key", async () => {
    await expect(getEnCardData("SEALED-OP01-BOX-JP")).resolves.toEqual({
      effect_text: null,
      en_image: null,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("publishes a cleared official image as a self-hosted, attributed CDN url — never the source_url", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          s3_key: "official/op/op01/OP-OP01-001-EN.webp",
          kind: "official_sample",
          attribution: ATTRIBUTION,
          source_url: SOURCE_URL,
          retrieved_at: "2026-07-13T09:00:00.000Z",
        },
      ],
    } as never);

    const data = await getEnCardData("OP-OP01-001-JP-V11DZ");

    // Text stays withheld even when an image is now available.
    expect(data.effect_text).toBeNull();

    // en_image CAN now return (previously always null).
    expect(data.en_image).not.toBeNull();
    const image = data.en_image!;

    // Served URL is the self-hosted CDN url built from s3_key...
    expect(image.url).toBe(
      `${EXPECTED_CDN}/official/op/op01/OP-OP01-001-EN.webp`,
    );
    // ...and is NEVER the publisher source_url (no hotlink).
    expect(image.url).not.toBe(SOURCE_URL);
    expect(image.url).not.toContain("onepiece-cardgame.com");

    // The copyright line always rides along with the image.
    expect(image.attribution).toBe(ATTRIBUTION);
    // source_url is retained as provenance metadata only — never as the src.
    expect(image.source_url).toBe(SOURCE_URL);
    expect(image.kind).toBe("official_sample");
    expect(image.retrieved_at).toBe("2026-07-13T09:00:00.000Z");

    // Looked up by the derived EN base key; the WHERE clause structurally
    // excludes non-official / non-clear / null-s3_key rows — the mechanism by
    // which those can never publish.
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual(["OP-OP01-001-EN"]);
    expect(String(sql)).toContain("kind = 'official_sample'");
    expect(String(sql)).toContain("takedown_status = 'clear'");
    expect(String(sql)).toContain("s3_key IS NOT NULL");
  });

  it("yields en_image:null when no cleared self-hosted row matches (null s3_key / non-clear are filtered out in SQL)", async () => {
    // A null-s3_key or non-clear (disputed/removed) row cannot satisfy the
    // WHERE clause, so the query returns zero rows for it — en_image is null
    // and effect_text stays null.
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(getEnCardData("OP-OP01-001-JP-V11DZ")).resolves.toEqual({
      effect_text: null,
      en_image: null,
    });
  });
});

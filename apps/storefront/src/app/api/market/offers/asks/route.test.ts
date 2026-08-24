import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));

const OWNER_ID = "123e4567-e89b-42d3-a456-426614174099";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.query.mockResolvedValue({
    rows: [
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        price: "12.50",
        quantity: 3,
        filled_quantity: 1,
        condition: "NM",
        allow_offers: true,
        accepts_returns: true,
        return_window_days: 14,
        created_at: "2026-08-24T12:00:00.000Z",
        owner_user_id: OWNER_ID,
        // Deliberately present in the mocked DB row: the projection must not
        // copy unexpected identity or private listing fields into the response.
        username: "private-handle",
        email: "private@example.test",
        notes: "private note",
      },
    ],
  });
});

describe("public individual-ask projection", () => {
  it("works without sign-in and returns only listing terms", async () => {
    const response = await GET(
      new Request(
        "https://cambridgetcg.com/api/market/offers/asks?sku=OP-OP01-001-JP",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      sku: "OP-OP01-001-JP",
      asks: [
        {
          id: "123e4567-e89b-42d3-a456-426614174001",
          price: "12.50",
          remaining: 2,
          condition: "NM",
          allow_offers: true,
          accepts_returns: true,
          return_window_days: 14,
          created_at: "2026-08-24T12:00:00.000Z",
          is_own: false,
          seller: { contact_available: true },
        },
      ],
    });
  });

  it("reduces the authenticated viewer identity comparison to is_own", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: OWNER_ID } });

    const response = await GET(
      new Request(
        "https://cambridgetcg.com/api/market/offers/asks?sku=OP-OP01-001-JP",
      ),
    );
    const body = await response.json();

    expect(body.asks[0].is_own).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /owner_user_id|private-handle|private@example\.test|private note/,
    );
  });
});

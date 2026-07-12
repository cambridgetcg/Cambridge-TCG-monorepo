import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { listVault } from "@/lib/bounty/db";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/bounty/db", () => ({ listVault: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockListVault = vi.mocked(listVault);

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
});

describe("GET /api/bounty/vault", () => {
  it("withholds stored wholesale prices and images from the owner response", async () => {
    mockListVault.mockResolvedValue([
      {
        id: "vault-1",
        user_id: "user-1",
        sku: "op-op01-001-ja",
        card_name: "Card",
        card_number: "001",
        set_code: "OP01",
        rarity: "R",
        image_url: "https://cardrush.example/legacy.jpg",
        spot_price_gbp: "1234.56",
        source: "wholesale",
        source_reference_id: null,
        bounty_pull_id: null,
        status: "reserved",
        acquired_at: "2026-07-01T00:00:00Z",
        expires_at: "2026-08-01T00:00:00Z",
        p2p_hold_until: "2026-07-03T00:00:00Z",
        redemption_order_id: null,
        fulfilled_at: null,
        sold_back_credit: null,
        sold_back_at: null,
        traded_to_user_id: null,
        traded_at: null,
        notes: null,
      },
    ]);

    const response = await GET(new Request("https://example.test/api/bounty/vault"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.items[0]).toMatchObject({ image_url: null, spot_price_gbp: null });
    expect(serialized).not.toContain("1234.56");
    expect(serialized).not.toContain("cardrush.example");
  });
});

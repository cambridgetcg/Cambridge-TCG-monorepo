import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getCardIdentity: vi.fn(), recordAcquisition: vi.fn(), closePosition: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/market/catalog-card", () => ({ getCardIdentity: mocks.getCardIdentity }));
vi.mock("@/lib/portfolio/realize", () => ({ recordAcquisition: mocks.recordAcquisition, closePosition: mocks.closePosition }));
vi.mock("../lifecycle-log", () => ({ logAuctionTransition: vi.fn() }));
vi.mock("@/lib/escrow/trust-engine", () => ({ calculateTrustScore: vi.fn(async () => undefined) }));
import { buyerConfirmReceived } from "../fulfilment";

const auction = { id: "a1", seller_user_id: "seller", winner_user_id: "buyer", is_consignment: false, status: "paid", escrow_status: "shipped_to_buyer", buyer_received_at: null };
const snapshot = { id: "a1", title: "Leader", sku: "OP-OP01-001-JP", current_price: "10", seller_payout: "9", seller_user_id: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("seller_payout") ? [snapshot] : sql.includes("FROM auctions WHERE id") ? [auction] : [] }));
  mocks.recordAcquisition.mockResolvedValue(undefined);
});

describe("auction fulfilment portfolio image [C8]", () => {
  it("never copies a Japanese official image URL into the portfolio row", async () => {
    mocks.getCardIdentity.mockResolvedValue({ card_name: "Leader", set_code: "OP01", image_url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png", image_language: "ja" });
    expect(await buyerConfirmReceived("a1", "buyer")).toEqual({ ok: true });
    await vi.waitFor(() => expect(mocks.recordAcquisition).toHaveBeenCalledOnce());
    expect(mocks.recordAcquisition.mock.calls[0]![0]).toMatchObject({ sku: "OP-OP01-001-JP", imageUrl: undefined });
  });

  it("keeps an English image URL as before (a recorded gap)", async () => {
    const url = "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-EN.png";
    mocks.getCardIdentity.mockResolvedValue({ card_name: "Leader", set_code: "OP01", image_url: url, image_language: "en" });
    await buyerConfirmReceived("a1", "buyer");
    await vi.waitFor(() => expect(mocks.recordAcquisition).toHaveBeenCalledOnce());
    expect(mocks.recordAcquisition.mock.calls[0]![0]).toMatchObject({ imageUrl: url });
  });
});

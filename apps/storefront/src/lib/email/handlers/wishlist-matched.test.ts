import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { scheduleEmail } from "../queue";
import { sendEmail } from "../send";
import { runWishlistMatchSweep } from "@/lib/wishlist/matching";
import { handleWishlistMatched } from "./wishlist-matched";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchCard: vi.fn() }));
vi.mock("../queue", () => ({
  registerQueueHandler: vi.fn(),
  scheduleEmail: vi.fn(),
}));
vi.mock("../send", () => ({ sendEmail: vi.fn() }));

const mockQuery = vi.mocked(query);
const mockFetchCard = vi.mocked(fetchCard);
const mockScheduleEmail = vi.mocked(scheduleEmail);
const mockSendEmail = vi.mocked(sendEmail);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("wishlist match legacy snapshot boundary", () => {
  it("queues null legacy snapshots while preserving the P2P match", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "wish-1",
          user_id: "user-1",
          sku: "op-op01-001-en",
          card_name: "Leader",
          card_number: "OP01-001",
          image_url: "https://legacy-upstream.example/wishlist.jpg",
          max_price: "20.00",
          condition_min: "LP",
          last_matched_at: null,
        }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: "ask-1",
          sku: "op-op01-001-en",
          condition: "NM",
          price: "12.34",
          remaining: "1",
        }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    mockFetchCard.mockResolvedValue(null);
    mockScheduleEmail.mockResolvedValue({ id: "email-1", alreadyScheduled: false });

    await expect(runWishlistMatchSweep()).resolves.toMatchObject({ matched: 1 });

    const firstSelect = String(mockQuery.mock.calls[0]?.[0]);
    expect(firstSelect).not.toContain("image_url");
    expect(mockScheduleEmail).toHaveBeenCalledOnce();
    const scheduled = mockScheduleEmail.mock.calls[0]?.[0];
    expect(scheduled?.data).toMatchObject({
      source: "p2p",
      imageUrl: null,
      priceGbp: null,
      marketOrderId: "ask-1",
    });
    expect(JSON.stringify(scheduled)).not.toContain("legacy-upstream.example");
  });

  it("ignores populated old queue snapshots and emails the reverified P2P ask", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "wish-1",
          fulfilled: false,
          email: "collector@example.com",
          name: "Collector",
        }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [{ price: "12.34", remaining: "1", status: "open" }],
        rowCount: 1,
      } as never);
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "message-1" } as never);

    const result = await handleWishlistMatched({
      id: "queue-1",
      user_id: "user-1",
      event: "wishlist_matched",
      data: {
        wishlistId: "wish-1",
        sku: "op-op01-001-en",
        cardName: "Leader",
        cardNumber: "OP01-001",
        imageUrl: "https://legacy-upstream.example/wishlist.jpg",
        maxPrice: 20,
        conditionMin: "LP",
        source: "p2p",
        priceGbp: 9999.99,
        condition: "NM",
        quantityAvailable: 99,
        marketOrderId: "ask-1",
      },
    } as never);

    expect(result).toEqual({ kind: "sent", messageId: "message-1" });
    expect(mockFetchCard).not.toHaveBeenCalled();
    const email = mockSendEmail.mock.calls[0]?.[0];
    expect(email?.subject).toContain("£12.34");
    expect(email?.html).toContain("£12.34");
    expect(email?.html).not.toContain("legacy-upstream.example");
    expect(email?.html).not.toContain("9999.99");
  });
});

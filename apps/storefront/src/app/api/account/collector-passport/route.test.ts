import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTOR_PASSPORT_NOTICE_VERSION } from "@/lib/collector-passport/types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOwnerPassport: vi.fn(),
  publishPassportItem: vi.fn(),
  reorderPassportDrafts: vi.fn(),
  withdrawPassportItem: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/collector-passport/db", () => ({
  getOwnerPassport: mocks.getOwnerPassport,
  publishPassportItem: mocks.publishPassportItem,
  reorderPassportDrafts: mocks.reorderPassportDrafts,
  withdrawPassportItem: mocks.withdrawPassportItem,
}));
vi.mock("@/lib/privacy/action-rate-limit", () => ({
  consumeActionRateLimit: mocks.rateLimit,
}));

import { GET, PATCH } from "./route";

const CARD_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function patch(body: unknown): Request {
  return new Request("https://example.test/api/account/collector-passport", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("owner Collector Passport route", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.rateLimit.mockResolvedValue({
      ok: true,
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
      windows: [],
    });
  });

  it("requires an authenticated owner and disables caching", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(mocks.getOwnerPassport).not.toHaveBeenCalled();
  });

  it("does not publish without the explicit current-notice act", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    const response = await PATCH(patch({
      action: "publish",
      portfolioCardId: CARD_ID,
      publicLabel: "My words",
      noticeVersion: COLLECTOR_PASSPORT_NOTICE_VERSION,
    }));
    expect(response.status).toBe(400);
    expect(mocks.publishPassportItem).not.toHaveBeenCalled();
  });

  it("passes only the owner session and authored fields to publication", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.publishPassportItem.mockResolvedValue({
      ok: true,
      value: {
        portfolio_card_id: CARD_ID,
        public_label: "My words",
        public_story: "My story",
        passport_public: true,
      },
    });

    const response = await PATCH(patch({
      action: "publish",
      portfolioCardId: CARD_ID,
      publicLabel: "My words",
      publicStory: "My story",
      acceptPublication: true,
      noticeVersion: COLLECTOR_PASSPORT_NOTICE_VERSION,
      userId: "attacker-chosen-user",
      sku: "restricted-sku",
    }));

    expect(response.status).toBe(200);
    expect(mocks.publishPassportItem).toHaveBeenCalledWith({
      userId: "owner-1",
      portfolioCardId: CARD_ID,
      publicLabel: "My words",
      publicStory: "My story",
      noticeVersion: COLLECTOR_PASSPORT_NOTICE_VERSION,
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.objectContaining({
      action: "passport-publish",
      subject: "owner-1",
    }));
  });

  it("fails closed when the private publication budget is unavailable", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rateLimit.mockResolvedValue({ ok: false, reason: "storage-unavailable" });
    const response = await PATCH(patch({
      action: "publish",
      portfolioCardId: CARD_ID,
      publicLabel: "My words",
      acceptPublication: true,
      noticeVersion: COLLECTOR_PASSPORT_NOTICE_VERSION,
    }));
    expect(response.status).toBe(503);
    expect(mocks.publishPassportItem).not.toHaveBeenCalled();
  });

  it("rate-limits publication while leaving withdrawal uncounted", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rateLimit.mockResolvedValue({
      ok: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 600,
      windows: [],
    });
    const limited = await PATCH(patch({
      action: "publish",
      portfolioCardId: CARD_ID,
      publicLabel: "My words",
      acceptPublication: true,
      noticeVersion: COLLECTOR_PASSPORT_NOTICE_VERSION,
    }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("600");

    mocks.withdrawPassportItem.mockResolvedValue({
      ok: true,
      value: { portfolio_card_id: CARD_ID, passport_public: false },
    });
    await PATCH(patch({ action: "withdraw", portfolioCardId: CARD_ID }));
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
  });

  it("keeps withdrawal available without a publication checkbox", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.withdrawPassportItem.mockResolvedValue({
      ok: true,
      value: { portfolio_card_id: CARD_ID, passport_public: false },
    });
    const response = await PATCH(patch({
      action: "withdraw",
      portfolioCardId: CARD_ID,
    }));
    expect(response.status).toBe(200);
    expect(mocks.withdrawPassportItem).toHaveBeenCalledWith({
      userId: "owner-1",
      portfolioCardId: CARD_ID,
    });
  });
});

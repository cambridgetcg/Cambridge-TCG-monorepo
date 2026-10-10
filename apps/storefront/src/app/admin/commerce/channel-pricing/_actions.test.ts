import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "@cambridge-tcg/pricing";
import { updateChannelPricing, previewChannelPrice } from "./_actions";
import { requireAdmin } from "@/lib/admin/auth";
import { wsQuery } from "@/lib/admin/db";
import { logAdminAction } from "@/lib/admin/audit";

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/db", () => ({ wsQuery: vi.fn() }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const input = { ...DEFAULTS.cambridgetcg!, channelId: 1, reason: "fixture review" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "operator", email: "operator@example.test", role: "admin" });
});

describe("channel pricing validation at the existing admin boundary", () => {
  it("retains authoritative admin admission before any validation or query", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect(await updateChannelPricing({ ...input, roundTo: 0.001 })).toMatchObject({ ok: false, code: "unauthorized" });
    expect(wsQuery).not.toHaveBeenCalled();
  });
  it.each([0.001, 0.015, 0, NaN, Infinity])("rejects unrepresentable/invalid roundTo %s before the database", async roundTo => {
    expect(await updateChannelPricing({ ...input, roundTo })).toMatchObject({ ok: false, code: "validation" });
    expect(wsQuery).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
  it("keeps valid updates and successful audit behavior", async () => {
    vi.mocked(wsQuery).mockResolvedValueOnce({ rows: [{ channel: "cambridgetcg" }] } as Awaited<ReturnType<typeof wsQuery>>);
    vi.mocked(wsQuery).mockResolvedValueOnce({ rows: [{ channel: "cambridgetcg" }] } as Awaited<ReturnType<typeof wsQuery>>);
    expect(await updateChannelPricing(input)).toMatchObject({ ok: true });
    expect(wsQuery).toHaveBeenCalledTimes(2);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "channel_pricing.update", targetId: "1" }));
  });
  it("returns a readable validation result for preview without throwing into the editor", async () => {
    await expect(previewChannelPrice({ ...input, roundTo: 0.001 })).resolves.toEqual({ error: "Pricing roundTo must be a positive whole-penny step." });
    await expect(previewChannelPrice({ ...input, gbpJpyRate: 0 })).resolves.toMatchObject({ error: expect.stringContaining("exchange rate") });
    await expect(previewChannelPrice(input)).resolves.toMatchObject({ channel: "cambridgetcg", price: 8.4 });
    expect(wsQuery).not.toHaveBeenCalled();
  });
});

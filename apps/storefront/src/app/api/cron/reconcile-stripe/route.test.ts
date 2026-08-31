import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCronAuth } from "@/lib/cron-auth";
import { reconcileStripeOrders } from "@/lib/orders/reconcile";
import { GET } from "./route";

vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: vi.fn() }));
vi.mock("@/lib/orders/reconcile", () => ({ reconcileStripeOrders: vi.fn() }));

const cleanSummary = {
  scanned: 0,
  paid: 0,
  recorded: 0,
  marketAttemptsScanned: 0,
  marketApplied: 0,
  marketProcessing: 0,
  marketTerminal: 0,
  review: 0,
  skipped: 0,
  errors: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCronAuth).mockReturnValue(null);
  vi.mocked(reconcileStripeOrders).mockResolvedValue(cleanSummary);
});

describe("Stripe reconciliation cron health", () => {
  it("returns non-green health when any payment evidence was not durably reconciled", async () => {
    vi.mocked(reconcileStripeOrders).mockResolvedValueOnce({
      ...cleanSummary,
      errors: 1,
    });

    const response = await GET(new Request("https://example.test/api/cron/reconcile-stripe"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, errors: 1 });
  });

  it("stays green when all work applied, skipped, or entered durable review", async () => {
    vi.mocked(reconcileStripeOrders).mockResolvedValueOnce({
      ...cleanSummary,
      review: 2,
    });

    const response = await GET(new Request("https://example.test/api/cron/reconcile-stripe"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, review: 2, errors: 0 });
  });
});

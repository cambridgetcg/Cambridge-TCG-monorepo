import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCronAuth } from "@/lib/cron-auth";
import { query } from "@/lib/db";
import { reconcileStripeOrders } from "@/lib/orders/reconcile";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

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

  it("records whether it worked, and none of its counts", async () => {
    const recorded = async () => {
      vi.mocked(query).mockClear();
      await GET(new Request("https://example.test/api/cron/reconcile-stripe"));
      return vi.mocked(query).mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes")).map(([, params]) => [params![0], ...params!.slice(3)]);
    };
    expect(await recorded()).toEqual([["reconcile/stripe", 200, "ran", "{}"]]);
    vi.mocked(reconcileStripeOrders).mockResolvedValueOnce({ ...cleanSummary, paid: 3, errors: 1 });
    expect(await recorded()).toEqual([["reconcile/stripe", 503, "unavailable:failed", "{}"]]);
    vi.mocked(reconcileStripeOrders).mockRejectedValueOnce(new Error("no key"));
    expect(await recorded()).toEqual([["reconcile/stripe", 500, "unavailable:failed", "{}"]]);
  });
});

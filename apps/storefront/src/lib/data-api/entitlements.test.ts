import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
import {
  ENTITLING_SUBSCRIPTION, entitlementFromHoldings, planLimitsParam, readAccountEntitlement, readAccountEntitlementInTransaction,
} from "./entitlements";
import { DATA_API_PLANS, entitlementFor } from "./plans";

const missing = Object.assign(new Error("relation \"data_api_subscriptions\" does not exist"), { code: "42P01" });
afterEach(() => vi.restoreAllMocks());

describe("account entitlement", () => {
  it("is free without an entitling subscription and the plan's limits with one", () => {
    expect(entitlementFromHoldings([])).toEqual({ entitlement: entitlementFor(null), entitlingSubscriptions: 0 });
    expect(entitlementFromHoldings([{ planId: "pro", count: 1 }])).toEqual({ entitlement: entitlementFor("pro"), entitlingSubscriptions: 1 });
  });

  it("serves the strongest of duplicate subscriptions and logs the anomaly without the account", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(entitlementFromHoldings([{ planId: "business", count: 1 }, { planId: "pro", count: 2 }]).entitlement.planId).toBe("business");
    expect(entitlementFromHoldings([{ planId: "pro", count: 2 }]).entitlement.planId).toBe("pro");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toContain("3 entitling subscriptions");
  });

  it.each([[{ planId: "enterprise", count: 1 }], [{ planId: "pro", count: 0 }], [{ planId: "pro", count: 1.5 }]])("refuses %j rather than guessing a plan", holding => {
    expect(() => entitlementFromHoldings([holding])).toThrow(TypeError);
  });

  it("counts only test-mode active or trialing subscriptions whose paid period has not ended", () => {
    expect(ENTITLING_SUBSCRIPTION).toBe("s.environment = 'test' AND s.status IN ('active', 'trialing') AND s.current_period_end > NOW()");
  });

  it("passes the bearer statement every plan's rank and request limits from plans.ts", () => {
    expect(JSON.parse(planLimitsParam())).toEqual([
      { plan_id: "free", rank: 0, per_minute: DATA_API_PLANS.free.requestsPerMinutePerKey, per_month: 100_000 },
      { plan_id: "pro", rank: 1, per_minute: 120, per_month: 1_000_000 },
      { plan_id: "business", rank: 2, per_minute: 600, per_month: 10_000_000 },
    ]);
  });

  it("reads free when 0142 is not applied, and propagates any other failure", async () => {
    expect(await readAccountEntitlement("user", vi.fn().mockRejectedValue(missing))).toMatchObject({ status: "not-provisioned", entitlement: { planId: "free" } });
    await expect(readAccountEntitlement("user", vi.fn().mockRejectedValue(new Error("connection reset")))).rejects.toThrow("connection reset");
    const run = vi.fn().mockResolvedValue({ rows: [{ planId: "pro", count: 1 }] });
    expect(await readAccountEntitlement("user", run)).toMatchObject({ status: "ok", entitlement: { planId: "pro" } });
    expect(run.mock.calls[0]![1]).toEqual(["user"]);
  });

  it("inside a transaction, isolates a missing table under a savepoint", async () => {
    const tx = vi.fn(async (sql: string) => { if (sql.startsWith("SELECT")) throw missing; return { rows: [] }; });
    expect(await readAccountEntitlementInTransaction(tx, "user")).toMatchObject({ status: "not-provisioned", entitlement: { planId: "free" } });
    expect(tx.mock.calls.map(call => call[0].split(" ")[0])).toEqual(["SAVEPOINT", "SELECT", "ROLLBACK"]);
    const failing = vi.fn(async (sql: string) => { if (sql.startsWith("SELECT")) throw new Error("deadlock"); return { rows: [] }; });
    await expect(readAccountEntitlementInTransaction(failing, "user")).rejects.toThrow("deadlock");
    const ok = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT") ? [{ planId: "business", count: 1 }] : [] }));
    expect(await readAccountEntitlementInTransaction(ok, "user")).toMatchObject({ status: "ok", entitlement: { planId: "business" } });
    expect(ok.mock.calls.map(call => call[0].split(" ")[0])).toEqual(["SAVEPOINT", "SELECT", "RELEASE"]);
  });
});

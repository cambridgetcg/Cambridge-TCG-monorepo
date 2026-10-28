import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbQuery, transaction: (fn: (query: typeof dbQuery) => unknown) => fn(dbQuery) }));
import { hashMemberKey, mintMemberSecret } from "../datafeed/member-keys";
import { resolveDataApiBearer } from "./bearer";

const header = () => `Bearer ${mintMemberSecret().token}`;
const row = (fields: Record<string, unknown> = {}) => ({
  user_id: "owner", plan_id: "free", per_minute: 30, per_month: 100_000, minute_count: 1, month_count: 1, month_before: 0,
  month_start: "2026-10-01", holdings: [], minute_reset: 42, month_reset: 300_000, ...fields,
});
beforeEach(() => { dbQuery.mockReset(); vi.restoreAllMocks(); });

describe("data-API bearer", () => {
  it.each([null, "", "Basic x", "Bearer ctcg_agt_abcdefghijklmnopqrstuv", `Bearer ctcg_member_${"a".repeat(44)}`, `bearer=ctcg_member_${"a".repeat(43)}`])(
    "refuses %j before any database access", async value => {
      expect(await resolveDataApiBearer(value)).toEqual({ ok: false, status: 401 });
      expect(dbQuery).not.toHaveBeenCalled();
    });

  it("checks the member key rule and meters only in the data-API tables, with aggregate counts", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    const value = header();
    expect(await resolveDataApiBearer(value)).toEqual({ ok: false, status: 401 });
    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(sql).toContain("JOIN users u ON u.id = k.user_id");
    expect(sql).toContain("k.scope = 'price-read'");
    expect(sql).toContain("k.revoked_at IS NULL AND k.expires_at > NOW()");
    expect(sql).toContain("INSERT INTO data_api_rate_buckets");
    expect(sql).toContain("LEAST(data_api_rate_buckets.request_count + 1, (SELECT per_minute FROM applied) + 1)");
    expect(sql).toContain("INSERT INTO data_api_usage_months");
    expect(sql).toContain("WHERE data_api_usage_months.request_count < (SELECT per_month FROM applied)");
    expect(sql).toContain("s.status IN ('active', 'trialing') AND s.current_period_end > NOW()");
    expect(sql).not.toContain("member_data_rate_buckets");
    expect(params![0]).toBe(hashMemberKey(value.slice(7)));
    expect(JSON.parse(params![1] as string).map((plan: { plan_id: string }) => plan.plan_id)).toEqual(["free", "pro", "business"]);
  });

  it("returns the actor, entitlement and both windows for an accepted request", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row({ minute_count: 30, month_count: 12 })] });
    expect(await resolveDataApiBearer(header())).toMatchObject({
      ok: true, actor: { userId: "owner" }, entitlement: { planId: "free", historyDays: 365 },
      minute: { limit: 30, remaining: 0, resetSeconds: 42 }, month: { start: "2026-10-01", limit: 100_000, remaining: 99_988, used: 12, resetSeconds: 300_000 },
    });
  });

  it("refuses the 31st free request this minute, uncounted for the month", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row({ minute_count: 31, month_count: null, month_before: 40 })] });
    expect(await resolveDataApiBearer(header())).toMatchObject({ ok: false, status: 429, window: "minute", limit: 30, resetSeconds: 42, month: { used: 40 } });
  });

  it("refuses at the monthly cap with the month's limit and reset", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row({ plan_id: "pro", per_minute: 120, per_month: 1_000_000, holdings: [{ planId: "pro", count: 1 }], minute_count: 5, month_count: null, month_before: 999_998 })] });
    expect(await resolveDataApiBearer(header())).toMatchObject({
      ok: false, status: 429, window: "month", limit: 1_000_000, resetSeconds: 300_000,
      entitlement: { planId: "pro" }, month: { remaining: 0, used: 1_000_000 },
    });
  });

  it("applies the paid plan the statement chose only when plans.ts agrees", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row({ plan_id: "pro", per_minute: 120, per_month: 1_000_000, holdings: [{ planId: "pro", count: 1 }], minute_count: 100 })] });
    expect(await resolveDataApiBearer(header())).toMatchObject({ ok: true, entitlement: { planId: "pro" }, minute: { limit: 120, remaining: 20 } });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbQuery.mockResolvedValueOnce({ rows: [row({ plan_id: "pro", per_minute: 120, per_month: 1_000_000, holdings: [] })] });
    expect(await resolveDataApiBearer(header())).toEqual({ ok: false, status: 503, code: "UNAVAILABLE" });
    expect(error).toHaveBeenCalledWith("[data-api] bearer unavailable", "TypeError");
  });

  it("without 0142, answers 503 NOT_PROVISIONED to a valid key and 401 to any other", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    dbQuery.mockRejectedValueOnce(missing).mockResolvedValueOnce({ rows: [{ id: "key", user_id: "owner" }] });
    expect(await resolveDataApiBearer(header())).toEqual({ ok: false, status: 503, code: "NOT_PROVISIONED" });
    expect(dbQuery.mock.calls[1]![0]).not.toMatch(/INSERT|DELETE|UPDATE/);
    dbQuery.mockRejectedValueOnce(missing).mockResolvedValueOnce({ rows: [] });
    expect(await resolveDataApiBearer(header())).toEqual({ ok: false, status: 401 });
    dbQuery.mockRejectedValueOnce(missing).mockRejectedValueOnce(missing);
    expect(await resolveDataApiBearer(header())).toEqual({ ok: false, status: 401 });
  });

  it("reports other storage failures as unavailable without their detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbQuery.mockRejectedValueOnce(new Error("postgres://user:secret@host/db refused"));
    expect(await resolveDataApiBearer(header())).toEqual({ ok: false, status: 503, code: "UNAVAILABLE" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
  });
});

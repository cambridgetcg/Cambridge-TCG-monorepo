import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbQuery, transaction: (fn: (query: typeof dbQuery) => unknown) => fn(dbQuery) }));
import { createMemberKey, hashMemberKey, listMemberKeys, mintMemberSecret, resolveMemberBearer, revokeMemberKey } from "./member-keys";

beforeEach(() => dbQuery.mockReset());
describe("member credentials", () => {
  it("mints independent 256-bit secrets, hash-only database values", async () => {
    const first = mintMemberSecret();
    expect(first.token).toMatch(/^ctcg_member_[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toBe(hashMemberKey(first.token));
    expect(first.hash).toHaveLength(64);
    expect(mintMemberSecret().token).not.toBe(first.token);
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "owner" }] }).mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [{ id: "key" }] });
    const created = await createMemberKey("owner", "  notebook  ");
    const [sql, values] = dbQuery.mock.calls[2];
    expect(sql).not.toMatch(/token/);
    expect(values).toEqual(["owner", hashMemberKey(created.token), created.token.slice(0, 19), "notebook"]);
    expect(dbQuery.mock.calls[0][0]).toContain("FOR UPDATE");
  });
  it.each([null, "", "Basic anything", "Bearer ctcg_agt_abcdefghijklmnopqrstuv", "Bearer ctcg_member_short", "Bearer " + "x".repeat(10000), "Bearer ctcg_member_" + "a".repeat(44)])("rejects malformed or foreign token before database access (%s)", async header => {
    expect(await resolveMemberBearer(header)).toEqual({ ok: false, status: 401 });
    expect(dbQuery).not.toHaveBeenCalled();
  });
  it("checks owner existence, scope, revocation and expiry on each uncached use", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    const token = mintMemberSecret().token;
    expect(await resolveMemberBearer(`Bearer ${token}`)).toEqual({ ok: false, status: 401 });
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("JOIN users u ON u.id = k.user_id");
    expect(sql).toContain("k.scope = 'price-read'");
    expect(sql).toContain("k.revoked_at IS NULL AND k.expires_at > NOW()");
    expect(sql).toContain("ON CONFLICT (key_id, bucket_minute) DO UPDATE");
    expect(sql).toContain("LIMIT 100");
    expect(values).toEqual([hashMemberKey(token)]);
  });
  it("allows the thirtieth request but rejects the thirty-first", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ user_id: "owner", request_count: 30, reset_seconds: 9 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "owner", request_count: 31, reset_seconds: 9 }] });
    const header = `Bearer ${mintMemberSecret().token}`;
    expect(await resolveMemberBearer(header)).toEqual({ ok: true, actor: { userId: "owner" }, remaining: 0, resetSeconds: 9 });
    expect(await resolveMemberBearer(header)).toEqual({ ok: false, status: 429, resetSeconds: 9 });
  });
  it("owner-binds list and revoke without revealing hashes", async () => {
    const id = "10000000-0000-0000-0000-000000000001";
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await revokeMemberKey("other", id)).toBe(false);
    expect(dbQuery.mock.calls[0][0]).toContain("WHERE id = $1 AND user_id = $2");
    expect(dbQuery.mock.calls[0][1]).toEqual([id, "other"]);
    await listMemberKeys("owner");
    expect(dbQuery.mock.calls[1][0]).not.toContain("key_hash");
    expect(dbQuery.mock.calls[1][1]).toEqual(["owner"]);
  });
  it("refuses deleted owners, excess keys and bad names", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(createMemberKey("missing", "key")).rejects.toMatchObject({ status: 401 });
    // At five, the account's entitlement is read under a savepoint; no subscription is free.
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "owner" }] }).mockResolvedValueOnce({ rows: [{ n: 5 }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(createMemberKey("owner", "sixth")).rejects.toMatchObject({ status: 409 });
    dbQuery.mockReset();
    for (const name of ["", "a".repeat(81), "bad\nname"]) await expect(createMemberKey("owner", name)).rejects.toMatchObject({ status: 400 });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  describe("key cap follows the data-API entitlement; free is unchanged", () => {
    const free409 = { status: 409, message: "You have five active keys. Revoke one before creating another." };
    const minted = (n: number) => dbQuery.mockResolvedValueOnce({ rows: [{ id: "owner" }] }).mockResolvedValueOnce({ rows: [{ n }] });
    const entitlement = (rows: unknown[]) => dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [] });
    it("below five reads no entitlement: owner lock, count, insert, as before", async () => {
      minted(4).mockResolvedValueOnce({ rows: [{ id: "key" }] });
      await createMemberKey("owner", "fifth");
      expect(dbQuery).toHaveBeenCalledTimes(3);
      expect(dbQuery.mock.calls.map(call => String(call[0]))).not.toContain("SAVEPOINT data_api_entitlement");
    });
    it("a free account stops at five with the same message", async () => {
      minted(5); entitlement([]);
      await expect(createMemberKey("owner", "sixth")).rejects.toMatchObject(free409);
      expect(dbQuery.mock.calls.map(call => String(call[0]).split(/\s/)[0])).toEqual(["SELECT", "SELECT", "SAVEPOINT", "SELECT", "RELEASE"]);
      expect(dbQuery.mock.calls[3]![0]).toContain("data_api_subscriptions");
      expect(dbQuery.mock.calls[3]![1]).toEqual(["owner"]);
    });
    it("an unprovisioned subscription table is free, rolled back to its savepoint", async () => {
      minted(5);
      dbQuery.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "42P01" })).mockResolvedValueOnce({ rows: [] });
      await expect(createMemberKey("owner", "sixth")).rejects.toMatchObject(free409);
      expect(dbQuery.mock.calls[4]![0]).toBe("ROLLBACK TO SAVEPOINT data_api_entitlement");
    });
    it("any other entitlement failure refuses the mint without claiming the cap", async () => {
      minted(5);
      dbQuery.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("connection reset"));
      await expect(createMemberKey("owner", "sixth")).rejects.toThrow("connection reset");
      expect(dbQuery).toHaveBeenCalledTimes(4);
    });
    it("a pro account mints a sixth and stops at ten", async () => {
      minted(5); entitlement([{ planId: "pro", count: 1 }]); dbQuery.mockResolvedValueOnce({ rows: [{ id: "key" }] });
      expect((await createMemberKey("owner", "sixth")).token).toMatch(/^ctcg_member_/);
      minted(10); entitlement([{ planId: "pro", count: 1 }]);
      await expect(createMemberKey("owner", "eleventh")).rejects.toMatchObject({ status: 409, message: "You have 10 active keys, the most your plan allows. Revoke one before creating another." });
    });
  });
});

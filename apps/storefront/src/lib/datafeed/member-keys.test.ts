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
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "owner" }] }).mockResolvedValueOnce({ rows: [{ n: 5 }] });
    await expect(createMemberKey("owner", "sixth")).rejects.toMatchObject({ status: 409 });
    dbQuery.mockReset();
    for (const name of ["", "a".repeat(81), "bad\nname"]) await expect(createMemberKey("owner", name)).rejects.toMatchObject({ status: 400 });
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

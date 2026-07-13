import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => db);

import {
  MAX_ACTIVE_MAGIC_LINKS_GLOBAL,
  MAX_ACTIVE_MAGIC_LINKS_PER_EMAIL,
  PgAdapter,
  magicLinkRequestCapacity,
  reserveMagicLinkForDelivery,
} from "./adapter";

beforeEach(() => {
  db.query.mockReset();
  db.transaction.mockReset();
  db.transaction.mockImplementation(async (fn) => fn(db.query));
});

describe("magic-link bounds", () => {
  it("reports capacity and prunes only a bounded expired-token batch", async () => {
    db.query.mockResolvedValue({
      rows: [{
        email_active_count: MAX_ACTIVE_MAGIC_LINKS_PER_EMAIL,
        global_active_count: 24,
        email_retry_after_seconds: 3600,
        global_retry_after_seconds: 120,
      }],
    });

    await expect(magicLinkRequestCapacity("collector@example.com")).resolves.toEqual({
      allowed: false,
      reason: "email",
      emailActiveCount: MAX_ACTIVE_MAGIC_LINKS_PER_EMAIL,
      globalActiveCount: 24,
      retryAfterSeconds: 3600,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toContain("WHERE expires <= NOW()");
    expect(String(sql)).toContain("LIMIT $2");
    expect(String(sql)).toContain("expires > NOW()");
    expect(params).toEqual(["collector@example.com", 250]);
  });

  it("names the service-wide capacity reason separately", async () => {
    db.query.mockResolvedValue({
      rows: [{
        email_active_count: 1,
        global_active_count: MAX_ACTIVE_MAGIC_LINKS_GLOBAL,
        email_retry_after_seconds: 900,
        global_retry_after_seconds: 45,
      }],
    });

    await expect(magicLinkRequestCapacity("new@example.com")).resolves.toEqual({
      allowed: false,
      reason: "global",
      emailActiveCount: 1,
      globalActiveCount: MAX_ACTIVE_MAGIC_LINKS_GLOBAL,
      retryAfterSeconds: 45,
    });
  });

  it("serializes and enforces the live-token cap when creating a token", async () => {
    const createVerificationToken = PgAdapter().createVerificationToken!;
    const token = {
      identifier: "collector@example.com",
      token: "hashed-token",
      expires: new Date("2026-07-13T12:00:00.000Z"),
    };
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ reserved: true }] });
    await expect(createVerificationToken(token)).resolves.toEqual(token);

    const [lockSql, lockParams] = db.query.mock.calls[0];
    expect(String(lockSql)).toContain("pg_advisory_xact_lock($1::bigint)");
    expect(lockParams).toEqual([724_2026_0712]);

    const [sql, params] = db.query.mock.calls[1];
    expect(String(sql)).toContain("email_active_count < $4");
    expect(String(sql)).toContain("global_active_count < $5");
    expect(String(sql)).toContain("EXISTS (SELECT 1 FROM existing)");
    expect(params[3]).toBe(MAX_ACTIVE_MAGIC_LINKS_PER_EMAIL);
    expect(params[4]).toBe(MAX_ACTIVE_MAGIC_LINKS_GLOBAL);

    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ reserved: false }] });
    await expect(createVerificationToken(token)).rejects.toThrow(
      "Magic-link issuance safety limit reached",
    );
  });

  it("reserves the same SHA-256 token Auth.js stores before delivery", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ reserved: true }] });
    await reserveMagicLinkForDelivery({
      identifier: "collector@example.com",
      rawToken: "raw-token",
      expires: new Date("2026-07-13T12:00:00.000Z"),
      secret: "test-secret",
    });

    const [, params] = db.query.mock.calls[1];
    expect(params[0]).toBe("collector@example.com");
    expect(params[1]).toBe(
      "4afcf568ca4f27a612393b71a8093523094cf006f3bc6bd0edb7bce19d9ba779",
    );
  });

  it("never returns an expired token as consumed", async () => {
    const useVerificationToken = PgAdapter().useVerificationToken!;
    db.query.mockResolvedValue({ rows: [] });

    await expect(useVerificationToken({
      identifier: "collector@example.com",
      token: "expired-token",
    })).resolves.toBeNull();

    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql).toContain("expires <= NOW()");
    expect(sql).toContain("expires > NOW()");
    expect(sql).toContain("LIMIT $3");
  });
});

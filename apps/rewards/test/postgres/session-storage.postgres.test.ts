import { Session } from "@shopify/shopify-app-react-router/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { decrypt, encrypt } from "~/shopify/encryption.server";
import { EncryptedPrismaSessionStorage } from "~/shopify/session-storage.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

const SHOP = "session-test.myshopify.com";
const ID = `offline_${SHOP}`;
const TOKEN = "shpat_integration_test_token";
const REFRESH_TOKEN = "refresh-token-under-test";
// Expiring offline tokens last an hour; their refresh token 90 days.
const EXPIRES = new Date("2026-11-05T10:00:00.000Z");
const REFRESH_EXPIRES = new Date("2027-02-03T09:00:00.000Z");

function offlineSession(): Session {
  return new Session({
    id: ID,
    shop: SHOP,
    state: "state",
    isOnline: false,
    scope: "read_customers,read_orders",
    accessToken: TOKEN,
  });
}

function expiringOfflineSession(): Session {
  return new Session({
    ...offlineSession().toObject(),
    expires: EXPIRES,
    refreshToken: REFRESH_TOKEN,
    refreshTokenExpires: REFRESH_EXPIRES,
  });
}

describe.skipIf(!hasTestDatabase)("EncryptedPrismaSessionStorage on Postgres", () => {
  const originalSecret = process.env.ENCRYPTION_SECRET;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    process.env.ENCRYPTION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  /** An unreadable token is logged once per session; capture it so the run stays clean. */
  function captureDecryptErrors() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("stores the access token encrypted and loads it decrypted", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await expect(storage.storeSession(offlineSession())).resolves.toBe(true);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: ID } });
    expect(row.accessToken).not.toContain(TOKEN);
    expect(decrypt(row.accessToken)).toBe(TOKEN);
    expect(row.refreshToken).toBeNull();

    const loaded = await storage.loadSession(ID);
    expect(loaded?.accessToken).toBe(TOKEN);
    expect(loaded?.refreshToken).toBeUndefined();
    expect(loaded?.shop).toBe(SHOP);
    expect(loaded?.scope).toBe("read_customers,read_orders");

    const byShop = await storage.findSessionsByShop(SHOP);
    expect(byShop.map((session) => session.accessToken)).toEqual([TOKEN]);
  });

  it("re-encrypts on update and keeps one row per session id", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(offlineSession());
    const first = await prisma.session.findUniqueOrThrow({ where: { id: ID } });

    const rotated = offlineSession();
    rotated.accessToken = "shpat_rotated_token";
    await storage.storeSession(rotated);

    const rows = await prisma.session.findMany({ where: { shop: SHOP } });
    expect(rows).toHaveLength(1);
    expect(rows[0].accessToken).not.toBe(first.accessToken);
    expect((await storage.loadSession(ID))?.accessToken).toBe("shpat_rotated_token");
  });

  it("round-trips online sessions with their associated user", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    const online = new Session({
      id: `${SHOP}_42`,
      shop: SHOP,
      state: "state",
      isOnline: true,
      accessToken: TOKEN,
      expires: new Date(Date.now() + 60_000),
      onlineAccessInfo: {
        expires_in: 60,
        associated_user_scope: "read_customers",
        associated_user: {
          id: 42,
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.test",
          email_verified: true,
          account_owner: true,
          locale: "en",
          collaborator: false,
        },
      },
    });
    await storage.storeSession(online);

    const loaded = await storage.loadSession(`${SHOP}_42`);
    expect(loaded?.accessToken).toBe(TOKEN);
    expect(loaded?.onlineAccessInfo?.associated_user.email).toBe("ada@example.test");
  });

  it("treats a token encrypted under another key as a missing session", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(offlineSession());
    const errors = captureDecryptErrors();

    process.env.ENCRYPTION_SECRET = "a-different-secret";
    await expect(storage.loadSession(ID)).resolves.toBeUndefined();
    await expect(storage.findSessionsByShop(SHOP)).resolves.toEqual([]);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(`${ID} could not be decrypted`));
  });

  it("deletes sessions", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(offlineSession());
    await storage.deleteSession(ID);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("refuses to start without ENCRYPTION_SECRET", () => {
    delete process.env.ENCRYPTION_SECRET;
    expect(() => new EncryptedPrismaSessionStorage(prisma)).toThrow(/ENCRYPTION_SECRET environment variable is required/);
  });

  it("stores the refresh token encrypted and loads it decrypted", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    const session = expiringOfflineSession();
    await storage.storeSession(session);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: ID } });
    expect(row.refreshToken).not.toBeNull();
    expect(row.refreshToken).not.toContain(REFRESH_TOKEN);
    expect(decrypt(row.refreshToken!)).toBe(REFRESH_TOKEN);
    expect(decrypt(row.accessToken)).toBe(TOKEN);

    const loaded = await storage.loadSession(ID);
    expect(loaded?.refreshToken).toBe(REFRESH_TOKEN);
    expect(loaded?.accessToken).toBe(TOKEN);
    const [byShop] = await storage.findSessionsByShop(SHOP);
    expect(byShop.refreshToken).toBe(REFRESH_TOKEN);

    // The caller's session is left as it was: only the stored copy is encrypted.
    expect(session.accessToken).toBe(TOKEN);
    expect(session.refreshToken).toBe(REFRESH_TOKEN);
  });

  it("round-trips the access and refresh token expiry times", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(expiringOfflineSession());

    const row = await prisma.session.findUniqueOrThrow({ where: { id: ID } });
    expect(row.expires).toEqual(EXPIRES);
    expect(row.refreshTokenExpires).toEqual(REFRESH_EXPIRES);

    const loaded = await storage.loadSession(ID);
    expect(loaded?.expires).toEqual(EXPIRES);
    expect(loaded?.refreshTokenExpires).toEqual(REFRESH_EXPIRES);
  });

  it("treats a refresh token encrypted under another key as a missing session", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(expiringOfflineSession());

    // Only the refresh token is unreadable; the access token still decrypts.
    process.env.ENCRYPTION_SECRET = "a-different-secret";
    const foreignRefreshToken = encrypt(REFRESH_TOKEN);
    process.env.ENCRYPTION_SECRET = originalSecret;
    await prisma.session.update({ where: { id: ID }, data: { refreshToken: foreignRefreshToken } });
    const errors = captureDecryptErrors();

    await expect(storage.loadSession(ID)).resolves.toBeUndefined();
    await expect(storage.findSessionsByShop(SHOP)).resolves.toEqual([]);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(`${ID} could not be decrypted`));
  });
});

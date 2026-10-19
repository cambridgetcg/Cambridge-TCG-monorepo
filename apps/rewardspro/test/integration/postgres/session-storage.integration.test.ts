import { Session } from "@shopify/shopify-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "~/db.server";
import { decrypt } from "~/utils/encryption";
import { EncryptedPrismaSessionStorage } from "~/utils/session-storage.server";
import { hasTestDatabase, resetDatabase } from "./database";

const SHOP = "session-test.myshopify.com";
const TOKEN = "shpat_integration_test_token";

function offlineSession(): Session {
  return new Session({
    id: `offline_${SHOP}`,
    shop: SHOP,
    state: "state",
    isOnline: false,
    scope: "read_customers,read_orders",
    accessToken: TOKEN,
  });
}

describe.skipIf(!hasTestDatabase)("EncryptedPrismaSessionStorage on Postgres", () => {
  const originalSecret = process.env.ENCRYPTION_SECRET;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    process.env.ENCRYPTION_SECRET = originalSecret;
  });

  it("stores the access token encrypted and loads it decrypted", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await expect(storage.storeSession(offlineSession())).resolves.toBe(true);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: `offline_${SHOP}` } });
    expect(row.accessToken).not.toContain(TOKEN);
    expect(decrypt(row.accessToken)).toBe(TOKEN);

    const loaded = await storage.loadSession(`offline_${SHOP}`);
    expect(loaded?.accessToken).toBe(TOKEN);
    expect(loaded?.shop).toBe(SHOP);
    expect(loaded?.scope).toBe("read_customers,read_orders");

    const byShop = await storage.findSessionsByShop(SHOP);
    expect(byShop.map((session) => session.accessToken)).toEqual([TOKEN]);
  });

  it("re-encrypts on update and keeps one row per session id", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(offlineSession());
    const first = await prisma.session.findUniqueOrThrow({ where: { id: `offline_${SHOP}` } });

    const rotated = offlineSession();
    rotated.accessToken = "shpat_rotated_token";
    await storage.storeSession(rotated);

    const rows = await prisma.session.findMany({ where: { shop: SHOP } });
    expect(rows).toHaveLength(1);
    expect(rows[0].accessToken).not.toBe(first.accessToken);
    expect((await storage.loadSession(`offline_${SHOP}`))?.accessToken).toBe("shpat_rotated_token");
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

    process.env.ENCRYPTION_SECRET = "a-different-secret";
    await expect(storage.loadSession(`offline_${SHOP}`)).resolves.toBeUndefined();
    await expect(storage.findSessionsByShop(SHOP)).resolves.toEqual([]);
  });

  it("deletes sessions", async () => {
    const storage = new EncryptedPrismaSessionStorage(prisma);
    await storage.storeSession(offlineSession());
    await storage.deleteSession(`offline_${SHOP}`);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("refuses to start without ENCRYPTION_SECRET", () => {
    delete process.env.ENCRYPTION_SECRET;
    expect(() => new EncryptedPrismaSessionStorage(prisma)).toThrow(/ENCRYPTION_SECRET environment variable is required/);
  });
});

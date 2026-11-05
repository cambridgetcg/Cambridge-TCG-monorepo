import type { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-app-react-router/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { decrypt, encrypt } from "~/shopify/encryption.server";
import { EncryptedPrismaSessionStorage, RENEWAL_POLL_MS, oneRenewalCall } from "~/shopify/session-storage.server";
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

  /**
   * Ruling 39: a token exchange retires every other refresh token of the
   * store, so two renewals of one store's token must never run at once. Each
   * storage instance here is a separate caller on its own client, as two
   * instances of the app would be.
   */
  describe("one renewal per store at a time", () => {
    const clients: PrismaClient[] = [];
    /** A storage instance on a client of its own. */
    const anotherInstance = () => {
      const client = createPrismaClient(process.env.REWARDS_DATABASE_URL);
      clients.push(client);
      return new EncryptedPrismaSessionStorage(client);
    };
    /** The offline session with `token`, expiring in `minutes`. */
    const expiringIn = (minutes: number, token: string) =>
      new Session({ ...expiringOfflineSession().toObject(), accessToken: token, expires: new Date(Date.now() + minutes * 60_000) });
    const leases = () => prisma.cronLock.findMany({ where: { jobName: `session-renewal:${SHOP}` } });
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    afterEach(async () => {
      await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
    });

    it("while one caller renews the store's token, another waits and gets the renewed session", async () => {
      const renewing = anotherInstance();
      const other = anotherInstance();
      await renewing.storeSession(expiringIn(4, "shpat_about_to_expire"));
      await expect(renewing.loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_about_to_expire" });
      expect(await leases()).toHaveLength(1);

      const start = Date.now();
      const waiting = other.loadSession(ID);
      await pause(400);
      await renewing.storeSession(expiringIn(60, "shpat_renewed"));
      const loaded = await waiting;

      // Not the token about to be retired, which it would have renewed itself
      expect(loaded?.accessToken).toBe("shpat_renewed");
      expect(Date.now() - start).toBeGreaterThanOrEqual(400);
      expect(Date.now() - start).toBeLessThan(1500);
      // The renewal released its lease, and the waiter took none
      expect(await leases()).toEqual([]);
    });

    it("with the holder gone, the other goes on without the lease after 1.5 s, logging the shop only", async () => {
      const gone = anotherInstance();
      const other = anotherInstance();
      await gone.storeSession(expiringIn(4, "shpat_about_to_expire"));
      await gone.loadSession(ID);
      const [held] = await leases();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const start = Date.now();
      const loaded = await other.loadSession(ID);

      expect(Date.now() - start).toBeGreaterThanOrEqual(1500);
      expect(Date.now() - start).toBeLessThan(2500);
      expect(loaded?.accessToken).toBe("shpat_about_to_expire");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(" ")).toContain(SHOP);
      expect(warn.mock.calls[0].join(" ")).not.toContain("shpat_");
      // Going on without the lease, it releases nothing of the holder's when it stores
      await other.storeSession(expiringIn(60, "shpat_renewed_without_lease"));
      expect(await leases()).toEqual([held]);
    });

    it("a session outside the renewal window takes no lease, and never waits for one", async () => {
      const storage = anotherInstance();
      await storage.storeSession(expiringIn(7, "shpat_fresh"));

      await expect(storage.loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_fresh" });
      expect(await leases()).toEqual([]);

      // Even while a renewal of the store holds the lease
      await prisma.cronLock.create({ data: { jobName: `session-renewal:${SHOP}`, expiresAt: new Date(Date.now() + 15_000) } });
      const start = Date.now();
      await expect(anotherInstance().loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_fresh" });
      expect(Date.now() - start).toBeLessThan(RENEWAL_POLL_MS);
    });

    it("a missing session is loaded under the lease too: the first install's exchange", async () => {
      const exchanging = anotherInstance();
      await expect(exchanging.loadSession(ID)).resolves.toBeUndefined();
      expect(await leases()).toHaveLength(1);

      const waiting = anotherInstance().loadSession(ID);
      await pause(200);
      await exchanging.storeSession(expiringIn(60, "shpat_exchanged"));

      await expect(waiting).resolves.toMatchObject({ accessToken: "shpat_exchanged" });
      expect(await leases()).toEqual([]);
    });

    it("a lease whose holder never stored is taken over once it has run out", async () => {
      await prisma.cronLock.create({
        data: { jobName: `session-renewal:${SHOP}`, lockedAt: new Date(Date.now() - 20_000), expiresAt: new Date(Date.now() - 5_000) },
      });
      const storage = anotherInstance();
      await storage.storeSession(expiringIn(4, "shpat_about_to_expire"));

      const start = Date.now();
      await storage.loadSession(ID);

      expect(Date.now() - start).toBeLessThan(RENEWAL_POLL_MS);
      const [taken] = await leases();
      expect(taken.expiresAt.getTime()).toBeGreaterThan(Date.now());
      await storage.storeSession(expiringIn(60, "shpat_renewed"));
      expect(await leases()).toEqual([]);
    });

    it("within one storage instance, a call releases only the lease it took itself", async () => {
      const storage = anotherInstance();
      await storage.storeSession(expiringIn(4, "shpat_about_to_expire"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let finishRenewal!: () => void;
      const renewed = new Promise<void>((resolve) => (finishRenewal = resolve));

      const holder = oneRenewalCall(async () => {
        await storage.loadSession(ID);
        await renewed;
        await storage.storeSession(expiringIn(60, "shpat_renewed"));
      })();
      await vi.waitFor(async () => expect(await leases()).toHaveLength(1), { interval: 20 });
      const [held] = await leases();
      // Waits 1.5 s, goes on without the lease and stores: the holder's lease stays
      await oneRenewalCall(async () => {
        await storage.loadSession(ID);
        await storage.storeSession(expiringIn(60, "shpat_renewed_without_lease"));
      })();
      expect(await leases()).toEqual([held]);
      expect(warn).toHaveBeenCalledTimes(1);

      finishRenewal();
      await holder;
      expect(await leases()).toEqual([]);
    });

    it("a call that needed no renewal gives its lease back when it ends; one whose renewal threw leaves it to run out", async () => {
      const storage = anotherInstance();
      // Due here (6 minutes), but the library renews only within 5
      await storage.storeSession(expiringIn(5.5, "shpat_not_yet_renewed"));

      await oneRenewalCall(async () => {
        await storage.loadSession(ID);
        expect(await leases()).toHaveLength(1);
      })();
      expect(await leases()).toEqual([]);

      const refused = new Error("Shopify refused the refresh");
      await expect(
        oneRenewalCall(async () => {
          await storage.loadSession(ID);
          throw refused;
        })(),
      ).rejects.toBe(refused);
      const [left] = await leases();
      expect(left.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("the library's invalidation write (same expiry, no access token) still lands", async () => {
      const storage = anotherInstance();
      const session = expiringIn(60, "shpat_revoked_by_shopify");
      await storage.storeSession(session);

      // invalidateAccessToken: the same session with its access token removed
      session.accessToken = undefined;
      await expect(storage.storeSession(session)).resolves.toBe(true);

      const loaded = await storage.loadSession(ID);
      expect(loaded?.accessToken).toBeFalsy();
      expect(loaded?.expires).toEqual(session.expires);
      await expect(prisma.session.findUniqueOrThrow({ where: { id: ID } })).resolves.toMatchObject({ accessToken: "" });
    });

    it("a session the library invalidated (no access token, far-off expiry) is renewed under the lease: the other waits for the exchange", async () => {
      const exchanging = anotherInstance();
      const other = anotherInstance();
      // After an Admin 401 the library stores the session with its access token removed and the same expiry
      const invalidated = expiringIn(60, "shpat_revoked_by_shopify");
      invalidated.accessToken = undefined;
      await exchanging.storeSession(invalidated);

      // isActive is false without an access token, so the token-exchange strategy exchanges: under the lease
      const loadedFirst = await exchanging.loadSession(ID);
      expect(loadedFirst?.accessToken).toBeFalsy();
      expect(await leases()).toHaveLength(1);

      const start = Date.now();
      const waiting = other.loadSession(ID);
      await pause(400);
      await exchanging.storeSession(expiringIn(60, "shpat_exchanged"));
      const loaded = await waiting;

      // Not the invalidated session, which it would have exchanged itself at the same time
      expect(loaded?.accessToken).toBe("shpat_exchanged");
      expect(Date.now() - start).toBeGreaterThanOrEqual(400);
      expect(Date.now() - start).toBeLessThan(1500);
      expect(await leases()).toEqual([]);
    });
  });
});

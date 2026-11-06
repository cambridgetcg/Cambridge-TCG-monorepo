import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { Session, SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { graphql, http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { ensureMerchant, findConnection } from "~/lib/merchant.server";
import { monitoring } from "~/lib/telemetry.server";
import { decrypt, encrypt } from "~/shopify/encryption.server";
import { RewardsTokenPing } from "~/shopify/graphql";
import {
  ADMIN_RENEWAL_WAIT_MS,
  EncryptedPrismaSessionStorage,
  LIBRARY_RENEWAL_MS,
  RENEWAL_POLL_MS,
  RENEWAL_WAIT_MS,
  RENEWAL_WINDOW_MS,
  RenewalBusyError,
  oneRenewalCall,
} from "~/shopify/session-storage.server";
import { signedProxyRequest } from "../helpers/app-proxy";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { adminGraphqlUrl, signedWebhook } from "./helpers/shopify";

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
    /**
     * Room a loaded CI runner may need past a timing boundary (M2b-F7): an
     * upper bound is the next poll or wait boundary plus this, and what it
     * stood for is checked without the clock (no give-up, no poll).
     */
    const MARGIN_MS = 1000;
    /** How many times `run` paused to wait for another renewal (a RENEWAL_POLL_MS timer), whatever the clock says. */
    const pollsDuring = async (run: () => Promise<unknown>): Promise<number> => {
      const timers = vi.spyOn(globalThis, "setTimeout");
      try {
        await run();
        return timers.mock.calls.filter(([, ms]) => ms === RENEWAL_POLL_MS).length;
      } finally {
        timers.mockRestore();
      }
    };

    afterEach(async () => {
      await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
    });

    it("while one caller renews the store's token, another waits and gets the renewed session", async () => {
      const renewing = anotherInstance();
      const other = anotherInstance();
      await renewing.storeSession(expiringIn(4, "shpat_about_to_expire"));
      await expect(renewing.loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_about_to_expire" });
      expect(await leases()).toHaveLength(1);

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const start = Date.now();
      const waiting = other.loadSession(ID);
      await pause(400);
      await renewing.storeSession(expiringIn(60, "shpat_renewed"));
      const loaded = await waiting;

      // Not the token about to be retired, which it would have renewed itself
      expect(loaded?.accessToken).toBe("shpat_renewed");
      // Answered at its first poll after the renewal, not by giving up
      expect(Date.now() - start).toBeGreaterThanOrEqual(400);
      expect(Date.now() - start).toBeLessThan(400 + RENEWAL_POLL_MS + MARGIN_MS);
      expect(warn).not.toHaveBeenCalled();
      // The renewal released its lease, and the waiter took none
      expect(await leases()).toEqual([]);
    });

    // Ruling 85 (SECURITY-1): a second renewal beside a slow one could store a retired token pair
    it("with the holder slower than the wait, a waiter whose token is still valid uses it after 1.5 s, unstored, past the library's check", async () => {
      const gone = anotherInstance();
      const other = anotherInstance();
      const stored = expiringIn(4, "shpat_about_to_expire");
      await gone.storeSession(stored);
      await gone.loadSession(ID);
      const [held] = await leases();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sentry = vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);

      const start = Date.now();
      const loaded = await oneRenewalCall(() => other.loadSession(ID), "background")();

      expect(Date.now() - start).toBeGreaterThanOrEqual(RENEWAL_WAIT_MS);
      expect(Date.now() - start).toBeLessThan(RENEWAL_WAIT_MS + RENEWAL_POLL_MS + MARGIN_MS);
      expect(loaded?.accessToken).toBe("shpat_about_to_expire");
      // Past the library's 5-minute check, so the call renews nothing
      expect(loaded!.expires!.getTime()).toBeGreaterThan(Date.now() + LIBRARY_RENEWAL_MS);
      // An in-memory copy: the row keeps the token's real expiry
      await expect(prisma.session.findUniqueOrThrow({ where: { id: ID } })).resolves.toMatchObject({ expires: stored.expires });
      // Logged and sent to Sentry by shop only, saying the holder's session was inside the library's 5 minutes
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(" ")).toContain(SHOP);
      expect(warn.mock.calls[0].join(" ")).not.toContain("shpat_");
      expect(sentry).toHaveBeenCalledTimes(1);
      expect(sentry).toHaveBeenCalledWith(warn.mock.calls[0][0], "warning", { tags: { shop: SHOP, "session.renewal": "still-valid" } });
      expect(sentry.mock.calls[0][0]).toContain("inside the library's 5 minutes");
      // Going on without the lease, it releases nothing of the holder's when it stores
      await other.storeSession(expiringIn(60, "shpat_renewed_without_lease"));
      expect(await leases()).toEqual([held]);
    });

    it("the library's invalidation of such a copy stores the token's real expiry, never the moved one", async () => {
      const gone = anotherInstance();
      const other = anotherInstance();
      const stored = expiringIn(4, "shpat_about_to_expire");
      await gone.storeSession(stored);
      await gone.loadSession(ID);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const copy = (await oneRenewalCall(() => other.loadSession(ID), "background")())!;
      expect(copy.expires!.getTime()).toBeGreaterThan(stored.expires!.getTime());

      // invalidateAccessToken after an Admin 401: the same object, its access token removed
      copy.accessToken = undefined;
      await expect(other.storeSession(copy)).resolves.toBe(true);

      await expect(prisma.session.findUniqueOrThrow({ where: { id: ID } })).resolves.toMatchObject({ accessToken: "", expires: stored.expires });
    });

    it("with the holder slower than the wait and the token expired, a background waiter answers try-later and renews nothing", async () => {
      const holder = anotherInstance();
      await holder.storeSession(expiringIn(-1, "shpat_expired"));
      await holder.loadSession(ID);
      const [held] = await leases();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sentry = vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);

      const start = Date.now();
      await expect(oneRenewalCall(() => anotherInstance().loadSession(ID), "background")()).rejects.toBeInstanceOf(RenewalBusyError);

      expect(Date.now() - start).toBeGreaterThanOrEqual(RENEWAL_WAIT_MS);
      expect(Date.now() - start).toBeLessThan(RENEWAL_WAIT_MS + RENEWAL_POLL_MS + MARGIN_MS);
      expect(sentry).toHaveBeenCalledWith(expect.stringContaining(SHOP), "warning", { tags: { shop: SHOP, "session.renewal": "try-later" } });
      // The holder's lease is untouched, and the row too
      expect(await leases()).toEqual([held]);
      await expect(prisma.session.findUniqueOrThrow({ where: { id: ID } })).resolves.toMatchObject({ refreshToken: expect.any(String) });
    });

    it("an admin waiter with the token expired waits past 1.5 s for the holder's renewal", async () => {
      const holder = anotherInstance();
      await holder.storeSession(expiringIn(-1, "shpat_expired"));
      await holder.loadSession(ID);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const waiting = oneRenewalCall(() => anotherInstance().loadSession(ID), "admin")();
      await pause(RENEWAL_WAIT_MS + 1500);
      await holder.storeSession(expiringIn(60, "shpat_renewed"));

      // Not the expired token, which it would have exchanged itself beside the holder's renewal
      await expect(waiting).resolves.toMatchObject({ accessToken: "shpat_renewed" });
      expect(warn).not.toHaveBeenCalled();
      expect(await leases()).toEqual([]);
    });

    it("an admin waiter with the token expired renews it itself once about 8 s have passed without the holder", async () => {
      const holder = anotherInstance();
      await holder.storeSession(expiringIn(-1, "shpat_expired"));
      await holder.loadSession(ID);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sentry = vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);

      const start = Date.now();
      const loaded = await oneRenewalCall(() => anotherInstance().loadSession(ID), "admin")();

      expect(Date.now() - start).toBeGreaterThanOrEqual(ADMIN_RENEWAL_WAIT_MS);
      expect(Date.now() - start).toBeLessThan(ADMIN_RENEWAL_WAIT_MS + RENEWAL_POLL_MS + MARGIN_MS);
      // Due, so the library's exchange renews it
      expect(loaded?.accessToken).toBe("shpat_expired");
      expect(loaded!.expires!.getTime()).toBeLessThan(Date.now());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(sentry).toHaveBeenCalledWith(expect.stringContaining(SHOP), "warning", { tags: { shop: SHOP, "session.renewal": "renewing-anyway" } });
    }, 20_000);

    it("the lease window is the library's 5 minutes plus a margin for the wait and a decrypt", async () => {
      expect(RENEWAL_WINDOW_MS - LIBRARY_RENEWAL_MS).toBeGreaterThanOrEqual(RENEWAL_WAIT_MS);
      expect(RENEWAL_WINDOW_MS - LIBRARY_RENEWAL_MS).toBeLessThanOrEqual(15_000);
      const storage = anotherInstance();
      // 5 min 30 s left: the library renews nothing yet, and no call queues on a lease
      await storage.storeSession(expiringIn(5.5, "shpat_not_yet_due"));
      await storage.loadSession(ID);
      expect(await leases()).toEqual([]);
    });

    // BOUNDARY-1 fix 1, now as defence in depth (Ruling 85): last write no longer wins
    it("storeSession refuses an offline session that expires before the stored one, unless the stored token is empty", async () => {
      // Two instances, as an exchange and a slow refresh racing would be
      const exchanged = anotherInstance();
      const slowRefresh = anotherInstance();
      const newer = expiringIn(60, "shpat_exchanged");
      await exchanged.storeSession(newer);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Issued first, stored last: refused
      await expect(slowRefresh.storeSession(expiringIn(59, "shpat_retired"))).resolves.toBe(false);
      const kept = await prisma.session.findUniqueOrThrow({ where: { id: ID } });
      expect(decrypt(kept.accessToken)).toBe("shpat_exchanged");
      expect(kept.expires).toEqual(newer.expires);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(" ")).toContain(SHOP);
      expect(warn.mock.calls[0].join(" ")).not.toContain("shpat_");

      // A later expiry, or the same one, is stored
      const later = expiringIn(61, "shpat_later");
      await expect(slowRefresh.storeSession(later)).resolves.toBe(true);
      await expect(exchanged.storeSession(new Session({ ...later.toObject(), accessToken: "shpat_same_expiry" }))).resolves.toBe(true);
      expect(decrypt((await prisma.session.findUniqueOrThrow({ where: { id: ID } })).accessToken)).toBe("shpat_same_expiry");

      // Once the library has invalidated the stored token, any expiry is stored
      const invalidated = new Session({ ...later.toObject(), accessToken: undefined });
      await expect(exchanged.storeSession(invalidated)).resolves.toBe(true);
      await expect(slowRefresh.storeSession(expiringIn(30, "shpat_after_invalidation"))).resolves.toBe(true);
      expect(decrypt((await prisma.session.findUniqueOrThrow({ where: { id: ID } })).accessToken)).toBe("shpat_after_invalidation");
    });

    it("a session outside the renewal window takes no lease, and never waits for one", async () => {
      const storage = anotherInstance();
      await storage.storeSession(expiringIn(7, "shpat_fresh"));

      await expect(storage.loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_fresh" });
      expect(await leases()).toEqual([]);

      // Even while a renewal of the store holds the lease
      await prisma.cronLock.create({ data: { jobName: `session-renewal:${SHOP}`, expiresAt: new Date(Date.now() + 15_000) } });
      const start = Date.now();
      const polls = await pollsDuring(() => expect(anotherInstance().loadSession(ID)).resolves.toMatchObject({ accessToken: "shpat_fresh" }));
      expect(polls).toBe(0);
      expect(Date.now() - start).toBeLessThan(RENEWAL_POLL_MS + MARGIN_MS);
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
      const polls = await pollsDuring(() => storage.loadSession(ID));

      expect(polls).toBe(0);
      expect(Date.now() - start).toBeLessThan(RENEWAL_POLL_MS + MARGIN_MS);
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
      }, "background")();
      await vi.waitFor(async () => expect(await leases()).toHaveLength(1), { interval: 20 });
      const [held] = await leases();
      // Waits 1.5 s, goes on with the still-valid token, without the lease, and stores: the holder's lease stays
      await oneRenewalCall(async () => {
        await storage.loadSession(ID);
        await storage.storeSession(expiringIn(60, "shpat_renewed_without_lease"));
      }, "background")();
      expect(await leases()).toEqual([held]);
      expect(warn).toHaveBeenCalledTimes(1);

      finishRenewal();
      await holder;
      expect(await leases()).toEqual([]);
    });

    it("a call that needed no renewal gives its lease back when it ends; one whose renewal threw leaves it to run out", async () => {
      const storage = anotherInstance();
      // Due here (5 minutes 10 s), but the library renews only within 5
      await storage.storeSession(expiringIn((LIBRARY_RENEWAL_MS + 5_000) / 60_000, "shpat_not_yet_renewed"));

      await oneRenewalCall(async () => {
        await storage.loadSession(ID);
        expect(await leases()).toHaveLength(1);
      }, "background")();
      expect(await leases()).toEqual([]);

      const refused = new Error("Shopify refused the refresh");
      await expect(
        oneRenewalCall(async () => {
          await storage.loadSession(ID);
          throw refused;
        }, "background")(),
      ).rejects.toBe(refused);
      const [left] = await leases();
      expect(left.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("a call that ends in SessionNotFoundError gives its lease back: no renewal was attempted (M2b-F5)", async () => {
      const storage = anotherInstance();
      // unauthenticated.admin for a store with no session: the load takes the lease, then the library throws
      const missing = new SessionNotFoundError("Could not find a session for the shop");

      await expect(
        oneRenewalCall(async () => {
          await expect(storage.loadSession(ID)).resolves.toBeUndefined();
          expect(await leases()).toHaveLength(1);
          throw missing;
        }, "background")(),
      ).rejects.toBe(missing);

      expect(await leases()).toEqual([]);
      // So the next load of the store waits for nothing
      const polls = await pollsDuring(() => anotherInstance().loadSession(ID));
      expect(polls).toBe(0);
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

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const start = Date.now();
      const waiting = other.loadSession(ID);
      await pause(400);
      await exchanging.storeSession(expiringIn(60, "shpat_exchanged"));
      const loaded = await waiting;

      // Not the invalidated session, which it would have exchanged itself at the same time
      expect(loaded?.accessToken).toBe("shpat_exchanged");
      // Answered at its first poll after the exchange, not by giving up
      expect(Date.now() - start).toBeGreaterThanOrEqual(400);
      expect(Date.now() - start).toBeLessThan(400 + RENEWAL_POLL_MS + MARGIN_MS);
      expect(warn).not.toHaveBeenCalled();
      expect(await leases()).toEqual([]);
    });
  });

  /**
   * Ruling 85 through the library itself: the app's own entry points
   * (~/shopify.server) on the test database, with a slow renewal of the
   * store's token in flight on another instance (a second client holding the
   * lease), and Shopify's token endpoint, which both the refresh and the
   * token exchange call, counting what it is asked.
   */
  describe("a renewal wait that runs out, through the library", () => {
    let app: typeof import("~/shopify.server");
    const clients: PrismaClient[] = [];
    const slowHolder = async () => {
      const client = createPrismaClient(process.env.REWARDS_DATABASE_URL);
      clients.push(client);
      await new EncryptedPrismaSessionStorage(client).loadSession(ID);
      expect(await prisma.cronLock.count({ where: { jobName: `session-renewal:${SHOP}` } })).toBe(1);
    };
    const seed = (minutes: number, token: string) =>
      app.sessionStorage.storeSession(new Session({ ...expiringOfflineSession().toObject(), accessToken: token, expires: new Date(Date.now() + minutes * 60_000) }));
    /** Shopify's token endpoint and RewardsTokenPing for SHOP: how often the token was renewed, and the token each ping carried. */
    function shopify() {
      const seen = { renewals: 0, pings: [] as Array<string | null> };
      server.use(
        http.post(`https://${SHOP}/admin/oauth/access_token`, () => {
          seen.renewals++;
          return HttpResponse.json({
            access_token: "shpat_renewed_beside_the_holder",
            expires_in: 3600,
            refresh_token: "refresh-renewed-beside-the-holder",
            refresh_token_expires_in: 90 * 24 * 3600,
            scope: "read_customers,read_orders",
          });
        }),
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsTokenPing", ({ request }) => {
          seen.pings.push(request.headers.get("X-Shopify-Access-Token"));
          return HttpResponse.json({ data: { shop: { id: "gid://shopify/Shop/1" } } });
        }),
      );
      return seen;
    }
    /** An App Bridge session token for SHOP's admin, signed with the app's secret as Shopify signs it. */
    function sessionToken(): string {
      const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${part({ alg: "HS256", typ: "JWT" })}.${part({
        iss: `https://${SHOP}/admin`,
        dest: `https://${SHOP}`,
        aud: process.env.SHOPIFY_API_KEY,
        sub: "42",
        exp: now + 60,
        nbf: now - 5,
        iat: now - 5,
        jti: crypto.randomUUID(),
        sid: crypto.randomUUID(),
      })}`;
      return `${unsigned}.${crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(unsigned).digest("base64url")}`;
    }

    beforeAll(async () => {
      // ~/shopify.server checks the Session table as it loads; the library logs its version and each exchange
      vi.spyOn(console, "log").mockImplementation(() => {});
      process.env.SHOPIFY_API_KEY = "test-api-key";
      app = await import("~/shopify.server");
    });

    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);
    });

    afterEach(async () => {
      await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
    });

    afterAll(() => {
      delete process.env.SHOPIFY_API_KEY;
    });

    it("a background call (unauthenticated.admin) goes on with the still-valid token and refreshes nothing", async () => {
      await seed(4, "shpat_still_valid");
      await slowHolder();
      const seen = shopify();

      const { admin } = await app.unauthenticated.admin(SHOP);
      await admin.graphql(RewardsTokenPing);

      expect(seen.renewals).toBe(0);
      expect(seen.pings).toEqual(["shpat_still_valid"]);
    });

    it("the admin (authenticate.admin) goes on with the still-valid token and exchanges nothing", async () => {
      await seed(4, "shpat_still_valid");
      await slowHolder();
      const seen = shopify();

      const request = new Request(`https://test.example.com/app/orders?shop=${SHOP}`, { headers: { Authorization: `Bearer ${sessionToken()}` } });
      const { admin, session } = await app.authenticate.admin(request);
      await admin.graphql(RewardsTokenPing);

      expect(session.accessToken).toBe("shpat_still_valid");
      expect(seen.renewals).toBe(0);
      expect(seen.pings).toEqual(["shpat_still_valid"]);
    });

    it("with the token expired, a webhook answers 503 for Shopify to deliver again, and refreshes nothing", async () => {
      await seed(-1, "shpat_expired");
      await slowHolder();
      const seen = shopify();

      const thrown = await app.authenticate.webhook(signedWebhook("orders/paid", SHOP, { id: 1 })).then(
        () => null,
        (error: unknown) => error,
      );

      expect(thrown).toBeInstanceOf(Response);
      expect((thrown as Response).status).toBe(503);
      expect(seen.renewals).toBe(0);
    });

    it("with the token expired, the jobs' railFor and the proxy get no client, and refresh nothing", async () => {
      await ensureMerchant({ shop: SHOP, name: "Session", currency: "GBP", timezone: "Europe/London" });
      const conn = (await findConnection(SHOP))!;
      await seed(-1, "shpat_expired");
      await slowHolder();
      const seen = shopify();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { railFor } = await import("~/shopify/rail-for.server");
      const { verifyProxyRequest } = await import("~/shopify/proxy.server");

      // Busy, not unreachable: the job leaves the store for its next run (F1-F3)
      await expect(railFor(conn.connectionId)).resolves.toBe("busy");
      const visitor = await verifyProxyRequest(signedProxyRequest("membership", SHOP, "123"));

      // The proxy still answers for the signed buyer, with no balance read
      expect(visitor).toEqual({ shop: SHOP, customerId: "123", admin: undefined });
      expect(seen.renewals).toBe(0);
      expect(errors).not.toHaveBeenCalled();
    });
  });
});

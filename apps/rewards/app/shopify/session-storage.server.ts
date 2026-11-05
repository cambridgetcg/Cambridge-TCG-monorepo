/**
 * Shopify session storage on Postgres, with tokens encrypted at rest.
 *
 * PrismaSessionStorage stores `accessToken` and `refreshToken` in plaintext.
 * This subclass encrypts both with the carried AES-256-GCM utility
 * (encryption.server.ts, keyed by ENCRYPTION_SECRET + ENCRYPTION_SALT) before
 * every write and decrypts them after every read, so a database dump holds no
 * usable Admin API token and no refresh token that could mint one.
 * Construction fails if the key is not configured.
 *
 * A token that cannot be decrypted (for example after ENCRYPTION_SECRET was
 * rotated) makes the whole session read as missing: Shopify's token exchange
 * then issues and stores a fresh pair the next time the merchant opens the app.
 *
 * One renewal per store at a time (Ruling 39). Shopify's token guide says
 * never to refresh a store's offline token and exchange one at the same time:
 * token exchange retires every other refresh token of the store, so of two
 * renewals racing, one stores a token that is already dead, and the store's
 * background work (webhooks, the hourly job, the proxy) goes dark until the
 * merchant next opens the app. Every renewal path loads the offline session
 * here first (authenticate.admin's exchange, authenticate.webhook,
 * unauthenticated.admin and the app proxy refresh one due within 5 minutes),
 * so loadSession takes a short per-store lease for a session that is due:
 * - missing, without an access token (the library invalidated it after an
 *   Admin 401, keeping its expiry, so the token exchange renews it), or
 *   expiring within RENEWAL_WINDOW_MS (6 minutes, the library renews inside
 *   5), the session is loaded under the lease, a cron_lock row
 *   `session-renewal:<shop>` taken atomically (inserted, or taken over once
 *   expired) for RENEWAL_LEASE_MS;
 * - while another caller holds it, the session is read again (and the lease
 *   tried) every RENEWAL_POLL_MS for at most RENEWAL_WAIT_MS: once the holder
 *   has stored a renewed one (outside the window) it comes back with no
 *   lease, and a lease that has run out is taken over; after that, the
 *   caller goes on without the lease, as before this rule (logged once, with
 *   the shop only);
 * - storeSession of the offline session releases the lease this caller holds,
 *   and only its own: each lease has a token of its own, kept per call
 *   (oneRenewalCall). A call that ends without storing releases its lease
 *   when it resolves (the library renews only within 5 minutes, so it needed
 *   none), and so does one that throws SessionNotFoundError (there was no
 *   session to renew, so no renewal was attempted); one that throws anything
 *   else (its renewal may have failed) leaves its lease to expire;
 * - a session outside the window takes no lease and costs nothing extra.
 * A lease that can't be had or released (the database refused) never fails
 * the request: the caller goes on as before this rule.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Session, SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { databaseSchema } from "~/db.server";
import { assertEncryptionConfigured, decrypt, encrypt } from "./encryption.server";

/** A session expiring within this is due for renewal: the library renews within 5 minutes of expiry. */
export const RENEWAL_WINDOW_MS = 6 * 60 * 1000;
/** How long a renewal lease lasts when its holder never stores (its renewal threw, or the instance stopped). */
export const RENEWAL_LEASE_MS = 15 * 1000;
/** How long a caller waits for another's renewal before going on without the lease. */
export const RENEWAL_WAIT_MS = 1500;
/** How often a waiting caller reads the session again. */
export const RENEWAL_POLL_MS = 150;

const OFFLINE_PREFIX = "offline_";

/** One renewal lease a call holds: how to give back its own row (by its token, the cron_lock id). */
interface Lease {
  release(): Promise<void>;
}

/** The renewal leases one call holds, by session id. */
interface RenewalCall {
  leases: Map<string, Lease>;
}

const renewalCalls = new AsyncLocalStorage<RenewalCall>();

/**
 * `fn` with a renewal record of its own, so the storeSession a call makes
 * releases only the lease its own loadSession took. shopify.server.ts wraps
 * every library entry point that can renew a token with it. A lease still
 * held when `fn` resolves is released then: the call needed no renewal. So
 * is one when `fn` throws SessionNotFoundError (unauthenticated.admin for a
 * store with no session: nothing was renewed, M2b-F5). On any other throw
 * its leases run out by themselves. A storage call made outside any such
 * wrapper uses its storage instance's record.
 */
export function oneRenewalCall<F extends (...args: never[]) => Promise<unknown>>(fn: F): F {
  return (async (...args: Parameters<F>) => {
    const call: RenewalCall = { leases: new Map() };
    const releaseLeft = async () => {
      const left = [...call.leases.values()];
      call.leases.clear();
      await Promise.all(left.map((lease) => lease.release()));
    };
    let result: unknown;
    try {
      result = await renewalCalls.run(call, () => fn(...args));
    } catch (error) {
      if (error instanceof SessionNotFoundError) await releaseLeft();
      throw error;
    }
    await releaseLeft();
    return result;
  }) as F;
}

/** The shop of an offline session id (`offline_<shop>`), or null for an online one. */
function offlineShop(id: string): string | null {
  return id.startsWith(OFFLINE_PREFIX) && id.length > OFFLINE_PREFIX.length ? id.slice(OFFLINE_PREFIX.length) : null;
}

/**
 * Missing, without an access token, or expiring within RENEWAL_WINDOW_MS:
 * some path is about to renew it. A session with no access token is one the
 * library invalidated after an Admin 401 (stored again with the same, far-off
 * expiry); Session.isActive is false for it, so the token exchange renews it.
 */
function dueForRenewal(session: Session | undefined): boolean {
  return (
    !session ||
    !session.accessToken ||
    (session.expires !== undefined && session.expires.getTime() - Date.now() < RENEWAL_WINDOW_MS)
  );
}

const leaseJob = (shop: string) => `session-renewal:${shop}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class EncryptedPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  private readonly db: PrismaClient;
  /** The leases of calls made outside oneRenewalCall. */
  private readonly ownCall: RenewalCall = { leases: new Map() };

  constructor(prisma: PrismaClient) {
    assertEncryptionConfigured();
    super(prisma);
    this.db = prisma;
  }

  async storeSession(session: Session): Promise<boolean> {
    // A copy, so the caller's session keeps its plaintext tokens.
    const stored = new Session(session.toObject());
    stored.accessToken = session.accessToken ? encrypt(session.accessToken) : undefined;
    stored.refreshToken = session.refreshToken ? encrypt(session.refreshToken) : undefined;
    const done = await super.storeSession(stored);
    if (offlineShop(session.id) !== null) await this.releaseLease(session.id);
    return done;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const session = await this.loadDecrypted(id);
    const shop = offlineShop(id);
    if (shop === null || !dueForRenewal(session)) return session;
    const call = this.call();
    // This call holds the store's lease already
    if (call.leases.has(id)) return session;
    return this.inTurn(id, shop, call, session);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const sessions = await super.findSessionsByShop(shop);
    return sessions.flatMap((session) => this.decrypted(session) ?? []);
  }

  private call(): RenewalCall {
    return renewalCalls.getStore() ?? this.ownCall;
  }

  private async loadDecrypted(id: string): Promise<Session | undefined> {
    const session = await super.loadSession(id);
    return session ? this.decrypted(session) : undefined;
  }

  /**
   * The due session `loaded`, under the store's lease when it can be had:
   * at once, or once its holder's lease runs out within RENEWAL_WAIT_MS. A
   * session another caller renewed meanwhile comes back with no lease.
   */
  private async inTurn(id: string, shop: string, call: RenewalCall, loaded: Session | undefined): Promise<Session | undefined> {
    const giveUpAt = Date.now() + RENEWAL_WAIT_MS;
    let session = loaded;
    for (;;) {
      const token = await this.takeLease(shop);
      if (token === "unavailable") return session;
      if (token !== null) {
        call.leases.set(id, this.lease(shop, token));
        // Read under the lease: a renewal that finished just before it was taken counts
        const now = await this.loadDecrypted(id);
        if (dueForRenewal(now)) return now;
        await this.releaseLease(id);
        return now;
      }
      if (Date.now() >= giveUpAt) break;
      await pause(RENEWAL_POLL_MS);
      session = await this.loadDecrypted(id);
      if (!dueForRenewal(session)) return session;
    }
    console.warn(`[Session] Another renewal of ${shop}'s token was still running after ${RENEWAL_WAIT_MS} ms; this one goes on without waiting`);
    return session;
  }

  /**
   * The store's renewal lease: one statement that inserts it, or takes it
   * over from a holder whose lease has run out. Its token when taken, null
   * while another holds it, "unavailable" when the database refused.
   */
  private async takeLease(shop: string): Promise<string | null | "unavailable"> {
    const token = crypto.randomUUID();
    const instanceId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || `local-${process.pid}`;
    const table = Prisma.raw(`"${databaseSchema}"."cron_lock"`);
    // The database's clock decides expiry, so instances whose clocks differ agree on it
    try {
      const taken = await this.db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO ${table} AS held (id, job_name, locked_at, expires_at, instance_id)
        VALUES (${token}::uuid, ${leaseJob(shop)}, now() AT TIME ZONE 'UTC',
                now() AT TIME ZONE 'UTC' + ${RENEWAL_LEASE_MS} * interval '1 millisecond', ${instanceId})
        ON CONFLICT (job_name) DO UPDATE
          SET id = EXCLUDED.id, locked_at = EXCLUDED.locked_at, expires_at = EXCLUDED.expires_at, instance_id = EXCLUDED.instance_id
          WHERE held.expires_at < now() AT TIME ZONE 'UTC'
        RETURNING id::text AS id`;
      return taken.length === 1 ? token : null;
    } catch (error) {
      console.warn(`[Session] Could not take the renewal lease for ${shop}; going on without it: ${messageOf(error)}`);
      return "unavailable";
    }
  }

  /** The lease `token` of `shop`'s renewal; its release never throws (an expired lease may be gone already). */
  private lease(shop: string, token: string): Lease {
    return {
      release: async () => {
        try {
          await this.db.cronLock.deleteMany({ where: { id: token } });
        } catch (error) {
          console.warn(`[Session] Could not release the renewal lease for ${shop}; it runs out by itself: ${messageOf(error)}`);
        }
      },
    };
  }

  /** Release the lease this call holds for session `id`, if any. */
  private async releaseLease(id: string): Promise<void> {
    const call = this.call();
    const lease = call.leases.get(id);
    if (lease === undefined) return;
    call.leases.delete(id);
    await lease.release();
  }

  private decrypted(session: Session): Session | undefined {
    try {
      if (session.accessToken) session.accessToken = decrypt(session.accessToken);
      if (session.refreshToken) session.refreshToken = decrypt(session.refreshToken);
      return session;
    } catch {
      console.error(`[Session] Stored tokens for ${session.id} could not be decrypted; treating the session as missing`);
      return undefined;
    }
  }
}

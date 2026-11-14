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
 *   expiring within RENEWAL_WINDOW_MS (the library's 5 minutes plus a margin
 *   for the wait and a decrypt), the session is loaded under the lease, a
 *   cron_lock row `session-renewal:<shop>` taken atomically (inserted, or
 *   taken over once expired) for RENEWAL_LEASE_MS;
 * - while another caller holds it, the session is read again (and the lease
 *   tried) every RENEWAL_POLL_MS: once the holder has stored a renewed one
 *   (outside the window) it comes back with no lease, and a lease that has
 *   run out is taken over;
 * - when RENEWAL_WAIT_MS has passed with the holder still renewing (Ruling
 *   85, amending Ruling 39's fallback: a second renewal beside the first
 *   could store a retired token pair and darken the store), the caller never
 *   starts a renewal over a token that still works: a session whose access
 *   token has more than STILL_VALID_MS left comes back as an in-memory copy
 *   whose expiry is past the library's 5-minute check, so the call uses that
 *   token and renews nothing (the copy is never stored with the moved
 *   expiry). A session really expired, or without a token, is renewed only
 *   by an admin caller (the exchange needs the merchant's session token, so
 *   only an admin request can mend a dead pair), which waits up to
 *   ADMIN_RENEWAL_WAIT_MS before going on without the lease; a background
 *   caller (a webhook, the proxy, a job) gets RenewalBusyError instead and
 *   answers try-later. Either way the overlap is logged and sent to Sentry
 *   with the shop tag, saying whether the holder's session was inside the
 *   library's 5 minutes;
 * - storeSession of an offline session is one conditional statement that
 *   refuses an expiry earlier than the stored one, unless the stored access
 *   token is empty (BOUNDARY-1 fix 1, as defence in depth: a renewal issued
 *   first and stored last no longer wins);
 * - storeSession of the offline session releases the lease this caller holds,
 *   and only its own: each lease has a token of its own, kept per call
 *   (oneRenewalCall). A call that ends without storing releases its lease
 *   when it resolves (the library renews only within 5 minutes, so it needed
 *   none), and so does one that throws SessionNotFoundError (there was no
 *   session to renew, so no renewal was attempted); one that throws anything
 *   else (its renewal may have failed) leaves its lease to expire. A webhook
 *   whose refresh Shopify refuses as no longer active resolves (4.0.3), so
 *   its lease is released at once and the next delivery may try again;
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
import { monitoring } from "~/lib/telemetry.server";
import { assertEncryptionConfigured, decrypt, encrypt } from "./encryption.server";
import { RenewalBusyError } from "./renewal-busy";

/** The library refreshes or exchanges an offline token within this of its expiry (WITHIN_MILLISECONDS_OF_EXPIRY). */
export const LIBRARY_RENEWAL_MS = 5 * 60 * 1000;
/** How long a caller waits for another's renewal before deciding without it. */
export const RENEWAL_WAIT_MS = 1500;
/**
 * A session expiring within this is due for renewal: the library's 5 minutes
 * plus a margin covering RENEWAL_WAIT_MS and a decrypt (SECURITY-2), so a
 * store's calls queue on the lease only while a renewal can really be running.
 */
export const RENEWAL_WINDOW_MS = LIBRARY_RENEWAL_MS + 10 * 1000;
/** How long a renewal lease lasts when its holder never stores (its renewal threw, or the instance stopped). */
export const RENEWAL_LEASE_MS = 15 * 1000;
/** How long an admin caller waits for another's renewal of an expired token before renewing it itself. */
export const ADMIN_RENEWAL_WAIT_MS = 8000;
/** How often a waiting caller reads the session again. */
export const RENEWAL_POLL_MS = 150;
/** An access token with more than this left is used as it is when the wait runs out. */
export const STILL_VALID_MS = 30 * 1000;
/** How far past the library's check a still-valid token's in-memory copy expires. */
const COPY_MARGIN_MS = 60 * 1000;

/**
 * Who renews when a wait runs out (Ruling 85): an admin request, whose token
 * exchange can mend any pair, or a background caller (a webhook, the app
 * proxy, a scheduled job), which answers try-later instead.
 */
export type RenewalCaller = "admin" | "background";

export { RenewalBusyError };

const OFFLINE_PREFIX = "offline_";

/** One renewal lease a call holds: how to give back its own row (by its token, the cron_lock id). */
interface Lease {
  release(): Promise<void>;
}

/** The renewal leases one call holds, by session id, and who the call is. */
interface RenewalCall {
  leases: Map<string, Lease>;
  caller: RenewalCaller;
}

const renewalCalls = new AsyncLocalStorage<RenewalCall>();

/**
 * `fn` with a renewal record of its own, so the storeSession a call makes
 * releases only the lease its own loadSession took. shopify.server.ts wraps
 * every library entry point that can renew a token with it. A lease still
 * held when `fn` resolves is released then: the call needed no renewal. So
 * is one when `fn` throws SessionNotFoundError (unauthenticated.admin for a
 * store with no session: nothing was renewed, M2b-F5). On any other throw
 * its leases run out by themselves. `caller` says who renews when a wait
 * runs out (Ruling 85). A storage call made outside any such wrapper uses
 * its storage instance's record, as an admin caller.
 */
export function oneRenewalCall<F extends (...args: never[]) => Promise<unknown>>(fn: F, caller: RenewalCaller): F {
  return (async (...args: Parameters<F>) => {
    const call: RenewalCall = { leases: new Map(), caller };
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

/** Missing, without an access token, or expiring within `withinMs`: the library renews within LIBRARY_RENEWAL_MS. */
function expiresWithin(session: Session | undefined, withinMs: number): boolean {
  return !session || !session.accessToken || (session.expires !== undefined && session.expires.getTime() - Date.now() < withinMs);
}

/**
 * Missing, without an access token, or expiring within RENEWAL_WINDOW_MS:
 * some path is about to renew it. A session with no access token is one the
 * library invalidated after an Admin 401 (stored again with the same, far-off
 * expiry); Session.isActive is false for it, so the token exchange renews it.
 */
function dueForRenewal(session: Session | undefined): boolean {
  return expiresWithin(session, RENEWAL_WINDOW_MS);
}

/** An access token with more than STILL_VALID_MS before it expires. */
function stillValid(session: Session | undefined): session is Session & { expires: Date } {
  return Boolean(session?.accessToken) && session!.expires !== undefined && session!.expires.getTime() - Date.now() > STILL_VALID_MS;
}

const leaseJob = (shop: string) => `session-renewal:${shop}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class EncryptedPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  private readonly db: PrismaClient;
  /** The leases of calls made outside oneRenewalCall. */
  private readonly ownCall: RenewalCall = { leases: new Map(), caller: "admin" };
  /** The real expiry of each in-memory copy a timed-out wait handed out, so it is never stored moved. */
  private readonly realExpiry = new WeakMap<Session, Date>();

  constructor(prisma: PrismaClient) {
    assertEncryptionConfigured();
    // No startup table check (connectionRetries 0: the library issues no query)
    super(prisma, { connectionRetries: 0 });
    this.db = prisma;
    // The library checks for its table here, at module load, and every
    // session call waits for that check. On Vercel its connection could stall
    // while an idle instance was paused, which held the next request for the
    // library's 5 s retry, and two failed checks left the instance refusing
    // every call. With no attempts its check fails at once, unused; the
    // migrations create the table, and if it were missing the call's own
    // query fails and is reported instead.
    const library = this as unknown as { ready: Promise<boolean> };
    library.ready.catch(() => undefined);
    library.ready = Promise.resolve(true);
  }

  async storeSession(session: Session): Promise<boolean> {
    // A copy, so the caller's session keeps its plaintext tokens.
    const stored = new Session(session.toObject());
    stored.accessToken = session.accessToken ? encrypt(session.accessToken) : undefined;
    stored.refreshToken = session.refreshToken ? encrypt(session.refreshToken) : undefined;
    // A timed-out wait's copy (the library's invalidation stores it after a 401) keeps its real expiry
    stored.expires = this.realExpiry.get(session) ?? session.expires;
    const shop = offlineShop(session.id);
    if (shop === null) return super.storeSession(stored);
    const done = await this.storeOffline(shop, stored);
    await this.releaseLease(session.id);
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

  /**
   * An offline session, in one conditional statement: inserted, or replacing
   * the stored row unless it expires before it while the stored row still has
   * an access token (Ruling 85). False, logged by shop, when refused: a
   * renewal issued before the stored one finished after it, and its pair is
   * the one Shopify retired. A write with the same expiry (the library's
   * invalidation) or with none lands. Offline rows carry no user columns.
   */
  private async storeOffline(shop: string, session: Session): Promise<boolean> {
    const table = Prisma.raw(`"${databaseSchema}"."Session"`);
    // Timestamps go in as UTC text, as Prisma keeps DateTime columns
    const at = (date: Date | undefined) => (date ? Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')` : Prisma.sql`NULL`);
    const written = await this.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ${table} AS stored ("id", "shop", "state", "isOnline", "scope", "expires", "accessToken", "refreshToken", "refreshTokenExpires")
      VALUES (${session.id}, ${session.shop}, ${session.state}, false, ${session.scope || null}, ${at(session.expires)},
              ${session.accessToken || ""}, ${session.refreshToken || null}, ${at(session.refreshTokenExpires)})
      ON CONFLICT ("id") DO UPDATE
        SET "shop" = EXCLUDED."shop", "state" = EXCLUDED."state", "isOnline" = EXCLUDED."isOnline", "scope" = EXCLUDED."scope",
            "expires" = EXCLUDED."expires", "accessToken" = EXCLUDED."accessToken", "refreshToken" = EXCLUDED."refreshToken",
            "refreshTokenExpires" = EXCLUDED."refreshTokenExpires"
        WHERE stored."accessToken" = '' OR stored."expires" IS NULL OR EXCLUDED."expires" IS NULL OR EXCLUDED."expires" >= stored."expires"
      RETURNING "id"`;
    if (written.length === 1) return true;
    console.warn(`[Session] Refused to store an offline session for ${shop} that expires before the stored one; the stored session stays`);
    return false;
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
    const started = Date.now();
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
      const waited = Date.now() - started;
      if (waited >= RENEWAL_WAIT_MS) {
        if (stillValid(session)) {
          this.overlap(shop, session, waited, "still-valid");
          return this.withoutRenewal(session);
        }
        if (call.caller === "background") {
          this.overlap(shop, session, waited, "try-later");
          throw new RenewalBusyError(shop);
        }
        if (waited >= ADMIN_RENEWAL_WAIT_MS) {
          this.overlap(shop, session, waited, "renewing-anyway");
          return session;
        }
      }
      await pause(RENEWAL_POLL_MS);
      session = await this.loadDecrypted(id);
      if (!dueForRenewal(session)) return session;
    }
  }

  /** `session` as this call alone sees it: expiring past the library's check, so the call uses its token and renews nothing. */
  private withoutRenewal(session: Session & { expires: Date }): Session {
    const copy = new Session(session.toObject());
    copy.expires = new Date(Date.now() + LIBRARY_RENEWAL_MS + COPY_MARGIN_MS);
    this.realExpiry.set(copy, session.expires);
    return copy;
  }

  /**
   * A wait that ran out with another renewal of `shop`'s token still running:
   * one log line and one Sentry warning, by shop only, saying whether the
   * holder's session was inside the library's 5 minutes (outside them, the
   * holder renews nothing and B2's count of real overlaps should leave it out).
   */
  private overlap(shop: string, session: Session | undefined, waited: number, outcome: "still-valid" | "try-later" | "renewing-anyway"): void {
    const inside = expiresWithin(session, LIBRARY_RENEWAL_MS) ? "inside" : "outside";
    const next = {
      "still-valid": "this call uses the still-valid token and renews nothing",
      "try-later": "this call answers try-later",
      "renewing-anyway": "this call renews it anyway",
    }[outcome];
    const message = `[Session] Another renewal of ${shop}'s token was still running after ${waited} ms, with the session ${inside} the library's 5 minutes; ${next}`;
    console.warn(message);
    monitoring.captureMessage(message, "warning", { tags: { shop, "session.renewal": outcome } });
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

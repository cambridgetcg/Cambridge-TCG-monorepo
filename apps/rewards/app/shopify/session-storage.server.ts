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
 */

import type { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { assertEncryptionConfigured, decrypt, encrypt } from "./encryption.server";

export class EncryptedPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  constructor(prisma: PrismaClient) {
    assertEncryptionConfigured();
    super(prisma);
  }

  async storeSession(session: Session): Promise<boolean> {
    // A copy, so the caller's session keeps its plaintext tokens.
    const stored = new Session(session.toObject());
    stored.accessToken = session.accessToken ? encrypt(session.accessToken) : undefined;
    stored.refreshToken = session.refreshToken ? encrypt(session.refreshToken) : undefined;
    return super.storeSession(stored);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const session = await super.loadSession(id);
    return session ? this.decrypted(session) : undefined;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const sessions = await super.findSessionsByShop(shop);
    return sessions.flatMap((session) => this.decrypted(session) ?? []);
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

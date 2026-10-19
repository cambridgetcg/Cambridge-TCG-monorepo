/**
 * Shopify session storage on Postgres, with access tokens encrypted at rest.
 *
 * PrismaSessionStorage stores `accessToken` in plaintext. This subclass
 * encrypts it with the app's AES-256-GCM utility (utils/encryption.ts,
 * keyed by ENCRYPTION_SECRET + ENCRYPTION_SALT) before every write and
 * decrypts it after every read, so a database dump holds no usable Admin API
 * tokens. Construction fails if the key is not configured.
 *
 * A token that cannot be decrypted (for example after ENCRYPTION_SECRET was
 * rotated) is treated as a missing session: Shopify's token exchange then
 * issues and stores a fresh one the next time the merchant opens the app.
 */

import type { PrismaClient } from "@prisma/client";
import { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { assertEncryptionConfigured, decrypt, encrypt } from "./encryption";

export class EncryptedPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  constructor(prisma: PrismaClient) {
    assertEncryptionConfigured();
    super(prisma);
  }

  async storeSession(session: Session): Promise<boolean> {
    const stored = new Session(session.toObject());
    stored.accessToken = session.accessToken ? encrypt(session.accessToken) : undefined;
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
    if (!session.accessToken) return session;
    try {
      session.accessToken = decrypt(session.accessToken);
      return session;
    } catch {
      console.error(`[Session] Stored access token for ${session.id} could not be decrypted; treating the session as missing`);
      return undefined;
    }
  }
}

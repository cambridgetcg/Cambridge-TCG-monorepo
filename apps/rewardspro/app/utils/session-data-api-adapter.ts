/**
 * Session Storage Adapter for AWS Aurora Data API
 * 
 * Implements Shopify session storage using Data API instead of Prisma
 * This ensures sessions are properly saved to AWS RDS
 */

import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { getAuroraClient } from "./aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
import { encrypt, decrypt } from "./encryption";
import { SessionLogger } from "./auth-logger";

export class DataAPISessionStorage implements SessionStorage {
  private client = getAuroraClient();
  private tableName = "Session";

  async storeSession(session: Session): Promise<boolean> {
    const logger = new SessionLogger();
    
    try {
      logger.logCreate(session.shop, session.id, session.isOnline || false);
      console.log(`[Session] Storing session for shop: ${session.shop}, id: ${session.id}`);
      
      const sql = `
        INSERT INTO "${this.tableName}" (
          id, shop, state, "isOnline", scope, expires, "accessToken",
          "userId", "firstName", "lastName", email, "accountOwner",
          locale, collaborator, "emailVerified"
        ) VALUES (
          :id, :shop, :state, :isOnline, :scope, CAST(:expires AS TIMESTAMP), :accessToken,
          :userId, :firstName, :lastName, :email, :accountOwner,
          :locale, :collaborator, :emailVerified
        )
        ON CONFLICT (id) DO UPDATE SET
          shop = EXCLUDED.shop,
          state = EXCLUDED.state,
          "isOnline" = EXCLUDED."isOnline",
          scope = EXCLUDED.scope,
          expires = EXCLUDED.expires,
          "accessToken" = EXCLUDED."accessToken",
          "userId" = EXCLUDED."userId",
          "firstName" = EXCLUDED."firstName",
          "lastName" = EXCLUDED."lastName",
          email = EXCLUDED.email,
          "accountOwner" = EXCLUDED."accountOwner",
          locale = EXCLUDED.locale,
          collaborator = EXCLUDED.collaborator,
          "emailVerified" = EXCLUDED."emailVerified"
      `;

      // Encrypt the access token before storing
      const encryptedAccessToken = session.accessToken ? encrypt(session.accessToken) : "";
      
      const params: SqlParameter[] = [
        { name: "id", value: { stringValue: session.id } },
        { name: "shop", value: { stringValue: session.shop } },
        { name: "state", value: { stringValue: session.state } },
        { name: "isOnline", value: { booleanValue: session.isOnline || false } },
        { name: "scope", value: session.scope ? { stringValue: session.scope } : { isNull: true } },
        { name: "expires", value: session.expires ? { stringValue: session.expires.toISOString() } : { isNull: true } },
        { name: "accessToken", value: { stringValue: encryptedAccessToken } },
        { name: "userId", value: session.onlineAccessInfo?.associated_user?.id ? 
          { longValue: Number(session.onlineAccessInfo.associated_user.id) } : { isNull: true } },
        { name: "firstName", value: session.onlineAccessInfo?.associated_user?.first_name ? 
          { stringValue: session.onlineAccessInfo.associated_user.first_name } : { isNull: true } },
        { name: "lastName", value: session.onlineAccessInfo?.associated_user?.last_name ? 
          { stringValue: session.onlineAccessInfo.associated_user.last_name } : { isNull: true } },
        { name: "email", value: session.onlineAccessInfo?.associated_user?.email ? 
          { stringValue: session.onlineAccessInfo.associated_user.email } : { isNull: true } },
        { name: "accountOwner", value: { booleanValue: session.onlineAccessInfo?.associated_user?.account_owner || false } },
        { name: "locale", value: session.onlineAccessInfo?.associated_user?.locale ? 
          { stringValue: session.onlineAccessInfo.associated_user.locale } : { isNull: true } },
        { name: "collaborator", value: { booleanValue: session.onlineAccessInfo?.associated_user?.collaborator || false } },
        { name: "emailVerified", value: { booleanValue: session.onlineAccessInfo?.associated_user?.email_verified || false } },
      ];

      await this.client.executeStatement(sql, params);
      console.log(`[Session] Successfully stored session for shop: ${session.shop}`);
      return true;
    } catch (error) {
      logger.logError('storeSession', error);
      console.error("[Session] Error storing session:", error);
      throw error;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const logger = new SessionLogger();
    
    try {
      console.log(`[Session] Loading session: ${id}`);
      
      const sql = `
        SELECT * FROM "${this.tableName}" WHERE id = :id
      `;

      const params: SqlParameter[] = [
        { name: "id", value: { stringValue: id } },
      ];

      const result = await this.client.executeStatement(sql, params);

      if (!result.records || result.records.length === 0) {
        logger.logLoad(id, false);
        console.log(`[Session] Session not found: ${id}`);
        return undefined;
      }
      
      logger.logLoad(id, true);

      const record: any = result.records[0];
      
      // Decrypt the access token after loading
      const decryptedAccessToken = record.accessToken ? decrypt(record.accessToken) : undefined;
      
      const session = new Session({
        id: record.id,
        shop: record.shop,
        state: record.state,
        isOnline: record.isOnline,
        scope: record.scope || undefined,
        expires: record.expires ? new Date(record.expires) : undefined,
        accessToken: decryptedAccessToken,
        onlineAccessInfo: record.userId ? {
          expires_in: 86400, // Default to 24 hours
          associated_user_scope: record.scope || "",
          associated_user: {
            id: Number(record.userId),
            first_name: record.firstName || "",
            last_name: record.lastName || "",
            email: record.email || "",
            account_owner: record.accountOwner || false,
            locale: record.locale || "",
            collaborator: record.collaborator || false,
            email_verified: record.emailVerified || false,
          },
        } : undefined,
      });

      console.log(`[Session] Successfully loaded session for shop: ${session.shop}`);
      return session;
    } catch (error) {
      logger.logError('loadSession', error);
      console.error("[Session] Error loading session:", error);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      console.log(`[Session] Deleting session: ${id}`);
      
      const sql = `
        DELETE FROM "${this.tableName}" WHERE id = :id
      `;

      const params: SqlParameter[] = [
        { name: "id", value: { stringValue: id } },
      ];

      await this.client.executeStatement(sql, params);
      console.log(`[Session] Successfully deleted session: ${id}`);
      return true;
    } catch (error) {
      console.error("[Session] Error deleting session:", error);
      return false;
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      console.log(`[Session] Deleting ${ids.length} sessions`);
      
      if (ids.length === 0) return true;

      // Build parameterized query for multiple IDs
      const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
      const sql = `
        DELETE FROM "${this.tableName}" WHERE id IN (${placeholders})
      `;

      const params: SqlParameter[] = ids.map((id, index) => ({
        name: `id${index}`,
        value: { stringValue: id },
      }));

      await this.client.executeStatement(sql, params);
      console.log(`[Session] Successfully deleted ${ids.length} sessions`);
      return true;
    } catch (error) {
      console.error("[Session] Error deleting sessions:", error);
      return false;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      console.log(`[Session] Finding sessions for shop: ${shop}`);
      
      const sql = `
        SELECT * FROM "${this.tableName}" WHERE shop = :shop
      `;

      const params: SqlParameter[] = [
        { name: "shop", value: { stringValue: shop } },
      ];

      const result = await this.client.executeStatement(sql, params);

      if (!result.records) {
        return [];
      }

      const sessions = result.records.map((record: any) => {
        // Decrypt the access token for each session
        const decryptedAccessToken = record.accessToken ? decrypt(record.accessToken) : undefined;
        
        return new Session({
          id: record.id,
          shop: record.shop,
          state: record.state,
          isOnline: record.isOnline,
          scope: record.scope || undefined,
          expires: record.expires ? new Date(record.expires) : undefined,
          accessToken: decryptedAccessToken,
          onlineAccessInfo: record.userId ? {
            expires_in: 86400, // Default to 24 hours
            associated_user_scope: record.scope || "",
            associated_user: {
              id: Number(record.userId),
              first_name: record.firstName || "",
              last_name: record.lastName || "",
              email: record.email || "",
              account_owner: record.accountOwner || false,
              locale: record.locale || "",
              collaborator: record.collaborator || false,
              email_verified: record.emailVerified || false,
            },
          } : undefined,
        });
      });

      console.log(`[Session] Found ${sessions.length} sessions for shop: ${shop}`);
      return sessions;
    } catch (error) {
      console.error("[Session] Error finding sessions by shop:", error);
      return [];
    }
  }
}

/**
 * Create a session storage instance for Shopify
 */
export function createDataAPISessionStorage() {
  return new DataAPISessionStorage();
}

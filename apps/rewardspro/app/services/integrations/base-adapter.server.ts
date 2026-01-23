/**
 * Base Integration Adapter
 *
 * Abstract base class for all third-party integration adapters.
 * Provides common functionality for OAuth, API requests, and event handling.
 */

import { createHmac, timingSafeEqual } from "crypto";
import db from "~/db.server";
import { encrypt, decrypt } from "~/utils/encryption";
import { createLogger } from "~/services/logger.server";
import type { Integration, IntegrationProvider } from "@prisma/client";
import type {
  IntegrationConfig,
  IIntegrationAdapter,
  LoyaltyEvent,
  EventDeliveryResult,
  OAuthAuthorizationResult,
  OAuthTokens,
  WebhookProcessingResult,
  ConnectionTestResult,
  PointsRule,
  PointsCalculationContext,
} from "./types";

export abstract class BaseIntegrationAdapter implements IIntegrationAdapter {
  protected logger;
  public readonly config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    this.config = config;
    this.logger = createLogger(`Integration:${config.provider}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS - Must be implemented by each adapter
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate OAuth authorization URL
   */
  abstract generateAuthUrl(
    shop: string,
    redirectUri: string
  ): Promise<OAuthAuthorizationResult>;

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens>;

  /**
   * Refresh expired access token
   */
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Verify incoming webhook signature
   */
  abstract verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean;

  /**
   * Process incoming webhook and extract relevant data
   */
  abstract processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult>;

  /**
   * Send loyalty event to the integration
   */
  abstract sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult>;

  /**
   * Test the integration connection
   */
  abstract testConnection(integration: Integration): Promise<ConnectionTestResult>;

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED METHODS - Common functionality
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get valid access token with auto-refresh
   */
  async getValidAccessToken(integration: Integration): Promise<string | null> {
    if (!integration.accessToken) {
      return null;
    }

    let accessToken: string;
    try {
      // Trim to remove any accidental whitespace/newlines that cause header errors
      accessToken = decrypt(integration.accessToken).trim();
    } catch (error) {
      this.logger.error("Failed to decrypt access token", {
        integrationId: integration.id,
        error,
      });
      return null;
    }

    // Check if token is expiring soon (5 minute buffer)
    if (integration.tokenExpiresAt) {
      const expiresAt = new Date(integration.tokenExpiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes

      if (Date.now() > expiresAt.getTime() - bufferTime) {
        // Token expiring, refresh it
        if (integration.refreshToken) {
          try {
            const refreshToken = decrypt(integration.refreshToken);
            const newTokens = await this.refreshAccessToken(refreshToken);

            // Update stored tokens
            await db.integration.update({
              where: { id: integration.id },
              data: {
                accessToken: encrypt(newTokens.accessToken),
                refreshToken: newTokens.refreshToken
                  ? encrypt(newTokens.refreshToken)
                  : integration.refreshToken,
                tokenExpiresAt: newTokens.expiresIn
                  ? new Date(Date.now() + newTokens.expiresIn * 1000)
                  : null,
                lastSyncAt: new Date(),
              },
            });

            this.logger.info("Token refreshed successfully", {
              integrationId: integration.id,
            });

            return newTokens.accessToken;
          } catch (error) {
            this.logger.error("Failed to refresh token", {
              integrationId: integration.id,
              error,
            });

            // Mark integration as error state
            await db.integration.update({
              where: { id: integration.id },
              data: {
                status: "ERROR",
                lastError: "Token refresh failed",
                lastErrorAt: new Date(),
              },
            });

            return null;
          }
        }
      }
    }

    return accessToken;
  }

  /**
   * Get decrypted API key
   */
  getApiKey(integration: Integration): string | null {
    if (!integration.apiKey) {
      return null;
    }

    try {
      // Trim to remove any accidental whitespace/newlines that cause header errors
      return decrypt(integration.apiKey).trim();
    } catch (error) {
      this.logger.error("Failed to decrypt API key", {
        integrationId: integration.id,
        error,
      });
      return null;
    }
  }

  /**
   * Make authenticated API request
   */
  async apiRequest<T>(
    integration: Integration,
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.config.api?.baseUrl) {
      throw new Error(`API not configured for ${this.config.provider}`);
    }

    // Get authentication token/key
    let authHeader: string;

    if (this.config.authType === "oauth") {
      const accessToken = await this.getValidAccessToken(integration);
      if (!accessToken) {
        throw new Error("No valid access token");
      }
      authHeader = `Bearer ${accessToken}`;
    } else if (this.config.authType === "api_key") {
      const apiKey = this.getApiKey(integration);
      if (!apiKey) {
        throw new Error("No API key configured");
      }
      authHeader = this.formatApiKeyHeader(apiKey);
    } else {
      throw new Error("Authentication not supported for this integration");
    }

    const url = `${this.config.api.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();

        // Handle rate limiting
        if (response.status === 429) {
          await this.handleRateLimit(integration, response);
          throw new Error(`Rate limited: ${errorText}`);
        }

        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      this.logger.debug("API request successful", {
        integrationId: integration.id,
        method,
        endpoint,
        latency,
      });

      return response.json() as Promise<T>;
    } catch (error) {
      this.logger.error("API request failed", {
        integrationId: integration.id,
        method,
        endpoint,
        error,
      });
      throw error;
    }
  }

  /**
   * Format API key for Authorization header (can be overridden)
   */
  protected formatApiKeyHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  /**
   * Handle rate limiting response
   */
  protected async handleRateLimit(
    integration: Integration,
    response: Response
  ): Promise<void> {
    const retryAfter = response.headers.get("Retry-After");
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;

    await db.integration.update({
      where: { id: integration.id },
      data: {
        status: "RATE_LIMITED",
        lastError: `Rate limited until ${new Date(Date.now() + retryMs).toISOString()}`,
        lastErrorAt: new Date(),
        metadata: {
          ...(integration.metadata as Record<string, unknown>),
          rateLimitedUntil: Date.now() + retryMs,
        },
      },
    });

    this.logger.warn("Rate limited", {
      integrationId: integration.id,
      retryAfter: retryMs,
    });
  }

  /**
   * Calculate points based on rules and conditions
   */
  calculatePoints(
    context: PointsCalculationContext,
    pointsRules: PointsRule[]
  ): number {
    let totalPoints = context.basePoints;

    for (const rule of pointsRules) {
      // Check if conditions are met
      if (rule.conditions && Object.keys(rule.conditions).length > 0) {
        const conditionsMet = Object.entries(rule.conditions).every(
          ([key, expectedValue]) => context.bonusConditions[key] === expectedValue
        );

        if (!conditionsMet) {
          continue;
        }
      }

      // Calculate points based on type
      switch (rule.pointsType) {
        case "FIXED":
          totalPoints += rule.pointsAmount;
          break;

        case "PERCENTAGE":
          if (rule.pointsPercent && context.orderValue) {
            let percentagePoints = Math.floor(
              (context.orderValue * rule.pointsPercent) / 100
            );
            if (rule.maxPoints) {
              percentagePoints = Math.min(percentagePoints, rule.maxPoints);
            }
            totalPoints += percentagePoints;
          }
          break;

        case "TIERED":
          // Tiered logic handled by conditions
          totalPoints += rule.pointsAmount;
          break;
      }
    }

    return Math.max(0, totalPoints);
  }

  /**
   * Default HMAC-SHA256 signature verification
   */
  protected verifyHmacSha256(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    try {
      return timingSafeEqual(
        Buffer.from(signature.toLowerCase()),
        Buffer.from(expectedSignature.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  /**
   * Default HMAC-SHA1 signature verification
   */
  protected verifyHmacSha1(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = createHmac("sha1", secret)
      .update(payload)
      .digest("hex");

    try {
      return timingSafeEqual(
        Buffer.from(signature.toLowerCase()),
        Buffer.from(expectedSignature.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  /**
   * Log integration activity
   */
  protected logActivity(
    integration: Integration,
    action: string,
    details?: Record<string, unknown>
  ): void {
    this.logger.info(action, {
      integrationId: integration.id,
      shop: integration.shop,
      provider: integration.provider,
      ...details,
    });
  }
}

/**
 * Adapter for integrations that don't support OAuth
 * (API key or webhook-only)
 */
export abstract class ApiKeyIntegrationAdapter extends BaseIntegrationAdapter {
  async generateAuthUrl(): Promise<OAuthAuthorizationResult> {
    throw new Error(
      `${this.config.provider} uses API key authentication, not OAuth`
    );
  }

  async exchangeCodeForTokens(): Promise<OAuthTokens> {
    throw new Error(
      `${this.config.provider} uses API key authentication, not OAuth`
    );
  }

  async refreshAccessToken(): Promise<OAuthTokens> {
    throw new Error(
      `${this.config.provider} uses API key authentication, not OAuth`
    );
  }
}

/**
 * Adapter for webhook-only integrations
 */
export abstract class WebhookOnlyIntegrationAdapter extends ApiKeyIntegrationAdapter {
  async sendEvent(): Promise<EventDeliveryResult> {
    // Webhook-only integrations don't send outbound events
    return { success: true };
  }

  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    // Webhook-only integrations are tested when first webhook arrives
    if (!integration.webhookSecret) {
      return {
        success: false,
        message: "Webhook secret is required",
      };
    }

    return {
      success: true,
      message: `${this.config.name} integration configured. Awaiting first webhook.`,
    };
  }
}

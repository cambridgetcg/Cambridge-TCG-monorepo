/**
 * Klaviyo Integration Adapter
 *
 * Handles integration with Klaviyo for email marketing automation.
 * Supports OAuth 2.0 with PKCE, event tracking, and profile syncing.
 *
 * @see https://developers.klaviyo.com/en/reference/api-overview
 */

import { createHmac } from "crypto";
import { BaseIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../oauth-handler.server";
import type { Integration } from "@prisma/client";
import type {
  IntegrationConfig,
  OAuthAuthorizationResult,
  OAuthTokens,
  WebhookProcessingResult,
  EventDeliveryResult,
  ConnectionTestResult,
  LoyaltyEvent,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const KLAVIYO_CONFIG: IntegrationConfig = {
  provider: "KLAVIYO",
  name: "Klaviyo",
  description: "Email marketing and automation platform",
  icon: "klaviyo",
  docsUrl: "https://developers.klaviyo.com/en/docs",

  authType: "oauth",

  oauth: {
    authorizationUrl: "https://www.klaviyo.com/oauth/authorize",
    tokenUrl: "https://a.klaviyo.com/oauth/token",
    scopes: [
      "accounts:read",
      "events:read",
      "events:write",
      "lists:read",
      "lists:write",
      "profiles:read",
      "profiles:write",
      "segments:read",
      "metrics:read",
    ],
    usePKCE: true,
  },

  api: {
    baseUrl: "https://a.klaviyo.com/api",
    version: "2024-02-15",
    rateLimit: {
      requests: 75,
      windowMs: 60000, // 75 requests per minute
    },
  },

  webhooks: {
    supportedTopics: [
      "email.opened",
      "email.clicked",
      "email.bounced",
      "email.unsubscribed",
      "sms.received",
      "flow.message.sent",
    ],
    signatureHeader: "X-Klaviyo-Signature",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    {
      id: "sync_customers",
      name: "Customer Sync",
      description: "Sync loyalty customer profiles to Klaviyo",
      category: "sync",
      requiresOAuth: true,
    },
    {
      id: "sync_points",
      name: "Points Events",
      description: "Track points earned/redeemed in Klaviyo",
      category: "sync",
      requiresOAuth: true,
    },
    {
      id: "sync_tiers",
      name: "Tier Events",
      description: "Track tier changes in Klaviyo",
      category: "sync",
      requiresOAuth: true,
    },
    {
      id: "email_triggers",
      name: "Email Triggers",
      description: "Trigger Klaviyo flows from loyalty events",
      category: "notifications",
      requiresOAuth: true,
    },
    {
      id: "custom_properties",
      name: "Custom Properties",
      description: "Sync loyalty data as profile properties",
      category: "data",
      requiresOAuth: true,
    },
  ],

  defaultPointsRules: [
    {
      triggerEvent: "email.opened",
      name: "Email Opened",
      description: "Points for opening a marketing email",
      defaultPoints: 5,
    },
    {
      triggerEvent: "email.clicked",
      name: "Email Clicked",
      description: "Points for clicking a link in an email",
      defaultPoints: 10,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// KLAVIYO API TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface KlaviyoProfile {
  type: "profile";
  id: string;
  attributes: {
    email?: string;
    phone_number?: string;
    external_id?: string;
    first_name?: string;
    last_name?: string;
    properties?: Record<string, unknown>;
  };
}

interface KlaviyoEvent {
  type: "event";
  attributes: {
    metric: {
      data: {
        type: "metric";
        attributes: {
          name: string;
        };
      };
    };
    profile: {
      data: {
        type: "profile";
        attributes: {
          email?: string;
          external_id?: string;
        };
      };
    };
    properties?: Record<string, unknown>;
    time?: string;
    value?: number;
    unique_id?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class KlaviyoAdapter extends BaseIntegrationAdapter {
  constructor() {
    super(KLAVIYO_CONFIG);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth Methods
  // ─────────────────────────────────────────────────────────────────────────

  async generateAuthUrl(
    shop: string,
    redirectUri: string
  ): Promise<OAuthAuthorizationResult> {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const clientId = process.env.KLAVIYO_CLIENT_ID;
    if (!clientId) {
      throw new Error("KLAVIYO_CLIENT_ID environment variable not set");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.config.oauth!.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const url = `${this.config.oauth!.authorizationUrl}?${params.toString()}`;

    this.logger.info("Generated Klaviyo OAuth URL", { shop, state });

    return {
      url,
      state,
      codeVerifier,
    };
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens> {
    const clientId = process.env.KLAVIYO_CLIENT_ID;
    const clientSecret = process.env.KLAVIYO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Klaviyo OAuth credentials not configured");
    }

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    };

    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await fetch(this.config.oauth!.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("Klaviyo token exchange failed", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scopes: data.scope?.split(" ") || [],
      tokenType: data.token_type,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const clientId = process.env.KLAVIYO_CLIENT_ID;
    const clientSecret = process.env.KLAVIYO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Klaviyo OAuth credentials not configured");
    }

    const response = await fetch(this.config.oauth!.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("Klaviyo token refresh failed", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      scopes: data.scope?.split(" ") || [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Webhook Methods
  // ─────────────────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    return this.verifyHmacSha256(payload, signature, secret);
  }

  async processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult> {
    this.logger.debug("Processing Klaviyo webhook", { topic });

    // Extract customer identifier
    const profileData = payload.data as { attributes?: { email?: string } };
    const customerEmail = profileData?.attributes?.email;

    switch (topic) {
      case "email.opened":
        return {
          customerEmail,
          action: "email.opened",
          data: {
            campaignId: payload.campaign_id,
            subject: payload.subject,
            openedAt: payload.timestamp,
          },
          shouldAwardPoints: true,
          pointsContext: {
            basePoints: 5,
            bonusConditions: {},
          },
        };

      case "email.clicked":
        return {
          customerEmail,
          action: "email.clicked",
          data: {
            campaignId: payload.campaign_id,
            url: payload.url,
            clickedAt: payload.timestamp,
          },
          shouldAwardPoints: true,
          pointsContext: {
            basePoints: 10,
            bonusConditions: {},
          },
        };

      case "email.unsubscribed":
        return {
          customerEmail,
          action: "email.unsubscribed",
          data: {
            listId: payload.list_id,
            unsubscribedAt: payload.timestamp,
          },
          shouldAwardPoints: false,
        };

      default:
        return {
          customerEmail,
          action: topic,
          data: payload,
          shouldAwardPoints: false,
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Delivery Methods
  // ─────────────────────────────────────────────────────────────────────────

  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    const accessToken = await this.getValidAccessToken(integration);
    if (!accessToken) {
      return {
        success: false,
        error: "No valid access token",
        retryable: true,
      };
    }

    try {
      // Map loyalty event to Klaviyo event
      const klaviyoEvent = this.mapToKlaviyoEvent(event);

      const response = await fetch(`${this.config.api!.baseUrl}/events/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          revision: this.config.api!.version!,
        },
        body: JSON.stringify({ data: klaviyoEvent }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 429) {
          return {
            success: false,
            error: "Rate limited",
            retryable: true,
          };
        }

        return {
          success: false,
          error: `Klaviyo API error: ${response.status} - ${errorText}`,
          retryable: response.status >= 500,
        };
      }

      const result = await response.json();

      this.logger.debug("Klaviyo event sent successfully", {
        eventType: event.type,
        klaviyoId: result.data?.id,
      });

      return {
        success: true,
        externalId: result.data?.id,
      };
    } catch (error) {
      this.logger.error("Failed to send Klaviyo event", { error, event });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  }

  /**
   * Map loyalty event to Klaviyo event format
   */
  private mapToKlaviyoEvent(event: LoyaltyEvent): KlaviyoEvent {
    // Map event types to Klaviyo metric names
    const metricNames: Record<string, string> = {
      POINTS_EARNED: "Loyalty Points Earned",
      POINTS_REDEEMED: "Loyalty Points Redeemed",
      POINTS_EXPIRED: "Loyalty Points Expired",
      TIER_UPGRADED: "Loyalty Tier Upgraded",
      TIER_DOWNGRADED: "Loyalty Tier Downgraded",
      CUSTOMER_ENROLLED: "Loyalty Program Enrolled",
      REFERRAL_COMPLETED: "Referral Completed",
      REWARD_REDEEMED: "Loyalty Reward Redeemed",
    };

    const metricName = metricNames[event.type] || `Loyalty ${event.type}`;

    return {
      type: "event",
      attributes: {
        metric: {
          data: {
            type: "metric",
            attributes: {
              name: metricName,
            },
          },
        },
        profile: {
          data: {
            type: "profile",
            attributes: {
              external_id: event.shopifyCustomerId || event.customerId,
            },
          },
        },
        properties: {
          ...event.data,
          loyalty_event_type: event.type,
          customer_id: event.customerId,
          order_id: event.orderId,
        },
        time: new Date().toISOString(),
        value: (event.data.points as number) || 0,
        unique_id: `${event.type}_${event.customerId}_${Date.now()}`,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Test
  // ─────────────────────────────────────────────────────────────────────────

  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    const accessToken = await this.getValidAccessToken(integration);
    if (!accessToken) {
      return {
        success: false,
        message: "No valid access token. Please reconnect.",
      };
    }

    try {
      // Test by fetching account info
      const response = await fetch(`${this.config.api!.baseUrl}/accounts/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          revision: this.config.api!.version!,
        },
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          message: `API returned status ${response.status}`,
          latencyMs,
        };
      }

      const data = await response.json();
      const account = data.data?.[0]?.attributes;

      return {
        success: true,
        message: `Connected to Klaviyo account: ${account?.contact_information?.organization_name || "Unknown"}`,
        details: {
          accountId: data.data?.[0]?.id,
          organization: account?.contact_information?.organization_name,
        },
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sync customer profile to Klaviyo
   */
  async syncProfile(
    integration: Integration,
    customerData: {
      email: string;
      externalId?: string;
      firstName?: string;
      lastName?: string;
      properties?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; profileId?: string; error?: string }> {
    const accessToken = await this.getValidAccessToken(integration);
    if (!accessToken) {
      return { success: false, error: "No valid access token" };
    }

    try {
      const profilePayload = {
        data: {
          type: "profile",
          attributes: {
            email: customerData.email,
            external_id: customerData.externalId,
            first_name: customerData.firstName,
            last_name: customerData.lastName,
            properties: {
              ...customerData.properties,
              _source: "RewardsPro",
              _synced_at: new Date().toISOString(),
            },
          },
        },
      };

      const response = await fetch(`${this.config.api!.baseUrl}/profiles/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          revision: this.config.api!.version!,
        },
        body: JSON.stringify(profilePayload),
      });

      if (!response.ok) {
        // Check if profile already exists (409 Conflict)
        if (response.status === 409) {
          // Profile exists, try to update instead
          return this.updateProfile(integration, customerData);
        }

        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to create profile: ${errorText}`,
        };
      }

      const result = await response.json();

      return {
        success: true,
        profileId: result.data?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update existing Klaviyo profile
   */
  private async updateProfile(
    integration: Integration,
    customerData: {
      email: string;
      externalId?: string;
      firstName?: string;
      lastName?: string;
      properties?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; profileId?: string; error?: string }> {
    const accessToken = await this.getValidAccessToken(integration);
    if (!accessToken) {
      return { success: false, error: "No valid access token" };
    }

    try {
      // First, find the profile by email
      const searchParams = new URLSearchParams({
        "filter": `equals(email,"${customerData.email}")`,
      });

      const searchResponse = await fetch(
        `${this.config.api!.baseUrl}/profiles/?${searchParams.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            revision: this.config.api!.version!,
          },
        }
      );

      if (!searchResponse.ok) {
        return { success: false, error: "Failed to search for profile" };
      }

      const searchResult = await searchResponse.json();
      const existingProfile = searchResult.data?.[0];

      if (!existingProfile) {
        return { success: false, error: "Profile not found" };
      }

      // Update the profile
      const updatePayload = {
        data: {
          type: "profile",
          id: existingProfile.id,
          attributes: {
            first_name: customerData.firstName,
            last_name: customerData.lastName,
            properties: {
              ...customerData.properties,
              _source: "RewardsPro",
              _synced_at: new Date().toISOString(),
            },
          },
        },
      };

      const updateResponse = await fetch(
        `${this.config.api!.baseUrl}/profiles/${existingProfile.id}/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            revision: this.config.api!.version!,
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        return {
          success: false,
          error: `Failed to update profile: ${errorText}`,
        };
      }

      return {
        success: true,
        profileId: existingProfile.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update Klaviyo profile with loyalty data
   */
  async updateProfileLoyaltyData(
    integration: Integration,
    email: string,
    loyaltyData: {
      currentPoints?: number;
      totalPointsEarned?: number;
      currentTier?: string;
      tierExpiresAt?: Date;
      referralCode?: string;
      lifetimeValue?: number;
    }
  ): Promise<{ success: boolean; error?: string }> {
    return this.updateProfile(integration, {
      email,
      properties: {
        loyalty_current_points: loyaltyData.currentPoints,
        loyalty_total_points_earned: loyaltyData.totalPointsEarned,
        loyalty_tier: loyaltyData.currentTier,
        loyalty_tier_expires_at: loyaltyData.tierExpiresAt?.toISOString(),
        loyalty_referral_code: loyaltyData.referralCode,
        loyalty_lifetime_value: loyaltyData.lifetimeValue,
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

// Register the adapter when this module is imported
registerAdapter("KLAVIYO", () => new KlaviyoAdapter());

// Export for direct use
export const klaviyoAdapter = new KlaviyoAdapter();

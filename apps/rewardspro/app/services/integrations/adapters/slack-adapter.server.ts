/**
 * Slack Integration Adapter
 *
 * Handles integration with Slack for team notifications and commands.
 *
 * Features:
 * - Incoming Webhooks: Send notifications to Slack channels
 * - OAuth Bot: Slash commands and interactive messages
 * - Block Kit: Rich message formatting
 * - Request verification: HMAC signature validation
 *
 * Authentication:
 * - Simple: Incoming Webhook URL (no OAuth)
 * - Full: OAuth 2.0 with bot token
 */

import { createHmac, timingSafeEqual } from "crypto";
import { BaseIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
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

const SLACK_CONFIG: IntegrationConfig = {
  provider: "SLACK",
  name: "Slack",
  description: "Get loyalty alerts and use slash commands in your Slack workspace",
  icon: "slack",
  docsUrl: "https://api.slack.com/",

  authType: "oauth",

  oauth: {
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: [
      "chat:write",
      "commands",
      "incoming-webhook",
      "users:read",
    ],
    usePKCE: false, // Slack doesn't support PKCE
  },

  api: {
    baseUrl: "https://slack.com/api",
    version: undefined,
    rateLimit: {
      requests: 50,
      windowMs: 60000, // Tier 2: ~50 requests per minute
    },
  },

  webhooks: {
    supportedTopics: ["slash_command", "interaction"],
    signatureHeader: "X-Slack-Signature",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    // Notifications
    {
      id: "notify_tier_upgrade",
      name: "VIP Tier Alerts",
      description: "Get notified when customers reach VIP status",
      category: "notifications",
    },
    {
      id: "notify_large_redemption",
      name: "Large Redemption Alerts",
      description: "Alert when points redemption exceeds threshold",
      category: "notifications",
    },
    {
      id: "notify_raffle_winner",
      name: "Raffle Winner Alerts",
      description: "Announce raffle winners in Slack",
      category: "notifications",
    },
    {
      id: "notify_daily_digest",
      name: "Daily Digest",
      description: "Daily summary of loyalty program activity",
      category: "notifications",
    },
    // Commands
    {
      id: "command_lookup",
      name: "Customer Lookup",
      description: "/loyalty lookup command",
      category: "data",
      requiresOAuth: true,
    },
    {
      id: "command_points",
      name: "Award Points",
      description: "/loyalty points command",
      category: "rewards",
      requiresOAuth: true,
    },
    {
      id: "command_stats",
      name: "Program Stats",
      description: "/loyalty stats command",
      category: "data",
      requiresOAuth: true,
    },
  ],

  defaultPointsRules: [], // Slack doesn't award points
};

// ═══════════════════════════════════════════════════════════════════════════
// SLACK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SlackConfig {
  webhookUrl?: string;
  channel?: string;
  botUserId?: string;
  teamId?: string;
  teamName?: string;
  incomingWebhook?: {
    url: string;
    channel: string;
    channelId: string;
  };
  enabledNotifications: string[];
  notificationThresholds?: {
    largeRedemptionPoints?: number;
    largeCashbackAmount?: number;
  };
}

export interface SlackBlock {
  type: string;
  text?: {
    type: "plain_text" | "mrkdwn";
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: "plain_text" | "mrkdwn";
    text: string;
  }>;
  accessory?: SlackBlockAccessory;
  elements?: SlackBlockElement[];
  block_id?: string;
}

export interface SlackBlockAccessory {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  value?: string;
  url?: string;
  action_id?: string;
}

export interface SlackBlockElement {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  value?: string;
  url?: string;
  action_id?: string;
  style?: "primary" | "danger";
}

export interface SlackMessage {
  text: string; // Fallback text
  blocks?: SlackBlock[];
  channel?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackInteractionPayload {
  type: "block_actions" | "view_submission" | "shortcut";
  user: { id: string; username: string; team_id: string };
  channel?: { id: string; name: string };
  actions?: Array<{
    action_id: string;
    block_id: string;
    value: string;
    type: string;
  }>;
  response_url?: string;
  trigger_id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SLACK ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

class SlackAdapter extends BaseIntegrationAdapter {
  constructor() {
    super(SLACK_CONFIG);
  }

  /**
   * Generate Slack OAuth authorization URL
   */
  async generateAuthUrl(
    shop: string,
    redirectUri: string
  ): Promise<OAuthAuthorizationResult> {
    const state = this.generateOAuthState(shop, redirectUri);
    const clientId = process.env.SLACK_CLIENT_ID?.trim();

    if (!clientId) {
      throw new Error("SLACK_CLIENT_ID not configured");
    }

    const scopes = this.config.oauth?.scopes.join(",") || "";

    const params = new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });

    const url = `${this.config.oauth?.authorizationUrl}?${params.toString()}`;

    return { url, state };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    const clientId = process.env.SLACK_CLIENT_ID?.trim();
    const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new Error("Slack OAuth credentials not configured");
    }

    const response = await fetch(this.config.oauth!.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${data.error}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scopes: data.scope?.split(",") || [],
    };
  }

  /**
   * Slack tokens don't expire, so refresh is not needed
   */
  async refreshAccessToken(): Promise<OAuthTokens> {
    throw new Error("Slack tokens do not expire and cannot be refreshed");
  }

  /**
   * Verify Slack request signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Slack signature format: v0=hash
    // The signature is computed over: v0:timestamp:body
    const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim() || secret;

    // Extract timestamp from the signature header context
    // In practice, this should come from the request headers
    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "v0") {
      return false;
    }

    // For verification, we need the timestamp which should be passed separately
    // This is a simplified version; full implementation needs timestamp from headers
    const expectedSignature = parts[1];

    // Compute our signature
    const hmac = createHmac("sha256", signingSecret);
    hmac.update(payload);
    const computedSignature = hmac.digest("hex");

    try {
      return timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(computedSignature, "hex")
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify Slack request with timestamp
   */
  verifySlackRequest(
    timestamp: string,
    body: string,
    signature: string
  ): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
    if (!signingSecret) {
      this.logger.error("SLACK_SIGNING_SECRET not configured");
      return false;
    }

    // Check timestamp is within 5 minutes
    const requestTimestamp = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTimestamp) > 300) {
      this.logger.warn("Slack request timestamp too old", {
        requestTimestamp,
        now,
        diff: Math.abs(now - requestTimestamp),
      });
      return false;
    }

    // Compute signature
    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = createHmac("sha256", signingSecret);
    hmac.update(sigBasestring);
    const computedSignature = `v0=${hmac.digest("hex")}`;

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Process incoming webhook (slash commands, interactions)
   */
  async processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult> {
    // Slack sends commands and interactions, not loyalty events
    return {
      action: topic,
      data: payload,
      shouldAwardPoints: false,
    };
  }

  /**
   * Send loyalty event as Slack notification
   */
  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    const config = integration.config as unknown as SlackConfig;

    // Check if this event type is enabled
    const eventType = this.mapEventToNotificationType(event.type);
    if (!config.enabledNotifications?.includes(eventType)) {
      return { success: true, externalId: "disabled" };
    }

    // Get webhook URL
    const webhookUrl =
      config.webhookUrl || config.incomingWebhook?.url;

    if (!webhookUrl) {
      // Try using bot token with chat.postMessage
      const accessToken = this.getAccessToken(integration);
      if (accessToken && config.channel) {
        return this.sendMessageWithBotToken(
          accessToken,
          config.channel,
          event,
          integration.shop
        );
      }

      return {
        success: false,
        error: "No webhook URL or bot token configured",
      };
    }

    // Build Slack message
    const message = this.buildSlackMessage(event, integration.shop);

    // Send to webhook
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack webhook failed: ${errorText}`);
      }

      this.logger.info("Slack notification sent", {
        shop: integration.shop,
        eventType: event.type,
      });

      return {
        success: true,
        externalId: `slack_${Date.now()}`,
      };
    } catch (error) {
      this.logger.error("Failed to send Slack notification", {
        shop: integration.shop,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  }

  /**
   * Send message using bot token (chat.postMessage)
   */
  private async sendMessageWithBotToken(
    accessToken: string,
    channel: string,
    event: LoyaltyEvent,
    shop: string
  ): Promise<EventDeliveryResult> {
    const message = this.buildSlackMessage(event, shop);

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        channel,
        ...message,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return {
        success: false,
        error: `Slack API error: ${data.error}`,
        retryable: data.error !== "channel_not_found",
      };
    }

    return {
      success: true,
      externalId: data.ts,
    };
  }

  /**
   * Test connection
   */
  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const config = integration.config as unknown as SlackConfig;

    // Check webhook URL
    const webhookUrl = config.webhookUrl || config.incomingWebhook?.url;

    if (webhookUrl) {
      // Send test message
      const testMessage: SlackMessage = {
        text: "RewardsPro connection test successful!",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":white_check_mark: *RewardsPro Connected*\nYour Slack integration is working correctly.",
            },
          },
        ],
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testMessage),
        });

        if (!response.ok) {
          return {
            success: false,
            message: `Webhook test failed: ${response.status}`,
          };
        }

        return {
          success: true,
          message: "Slack webhook is working. Test message sent!",
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Webhook test failed",
        };
      }
    }

    // Check bot token
    const accessToken = this.getAccessToken(integration);
    if (accessToken) {
      try {
        const response = await fetch("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (!data.ok) {
          return {
            success: false,
            message: `Bot token invalid: ${data.error}`,
          };
        }

        return {
          success: true,
          message: `Connected to ${data.team} as ${data.user}`,
          latencyMs: Date.now() - startTime,
          details: {
            team: data.team,
            user: data.user,
            teamId: data.team_id,
          },
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Auth test failed",
        };
      }
    }

    return {
      success: false,
      message: "No webhook URL or bot token configured",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Map event type to notification category
   */
  private mapEventToNotificationType(eventType: string): string {
    const mapping: Record<string, string> = {
      TIER_UPGRADED: "notify_tier_upgrade",
      TIER_DOWNGRADED: "notify_tier_downgrade",
      POINTS_EARNED: "notify_points",
      POINTS_REDEEMED: "notify_large_redemption",
      CASHBACK_EARNED: "notify_cashback",
      RAFFLE_WINNER_SELECTED: "notify_raffle_winner",
      CUSTOMER_ENROLLED: "notify_new_customer",
    };

    return mapping[eventType] || "notify_other";
  }

  /**
   * Build Slack Block Kit message from loyalty event
   */
  private buildSlackMessage(event: LoyaltyEvent, shop: string): SlackMessage {
    const blocks: SlackBlock[] = [];
    let text = "";

    switch (event.type) {
      case "TIER_UPGRADED":
        text = `${event.customerEmail} upgraded to ${event.data.newTier}!`;
        blocks.push(
          this.buildHeaderBlock(":star: VIP Tier Upgrade"),
          this.buildSectionBlock(
            `*${event.customerEmail}* has been upgraded to *${event.data.newTier}*!`
          ),
          this.buildFieldsBlock([
            { label: "Previous Tier", value: String(event.data.previousTier || "None") },
            { label: "New Tier", value: String(event.data.newTier) },
            { label: "Total Points", value: String(event.data.totalPoints || 0) },
          ]),
          this.buildActionsBlock(event.customerId, shop)
        );
        break;

      case "POINTS_REDEEMED":
        text = `${event.customerEmail} redeemed ${event.data.points} points`;
        blocks.push(
          this.buildHeaderBlock(":gift: Points Redeemed"),
          this.buildSectionBlock(
            `*${event.customerEmail}* redeemed *${event.data.points} points*`
          ),
          this.buildFieldsBlock([
            { label: "Points Redeemed", value: String(event.data.points) },
            { label: "Reward", value: String(event.data.reward || "Discount") },
            { label: "New Balance", value: String(event.data.newBalance || 0) },
          ]),
          this.buildActionsBlock(event.customerId, shop)
        );
        break;

      case "RAFFLE_WINNER_SELECTED":
        text = `Raffle winner: ${event.customerEmail}!`;
        blocks.push(
          this.buildHeaderBlock(":tada: Raffle Winner!"),
          this.buildSectionBlock(
            `*${event.customerEmail}* won the *${event.data.raffleName}* raffle!`
          ),
          this.buildFieldsBlock([
            { label: "Prize", value: String(event.data.prizeName || "TBD") },
            { label: "Raffle", value: String(event.data.raffleName) },
          ]),
          this.buildActionsBlock(event.customerId, shop)
        );
        break;

      case "CASHBACK_EARNED":
        text = `${event.customerEmail} earned $${event.data.amount} cashback`;
        blocks.push(
          this.buildHeaderBlock(":moneybag: Cashback Earned"),
          this.buildSectionBlock(
            `*${event.customerEmail}* earned *$${event.data.amount}* cashback`
          ),
          this.buildFieldsBlock([
            { label: "Amount", value: `$${event.data.amount}` },
            { label: "Order", value: String(event.data.orderId || event.orderId || "N/A") },
          ]),
          this.buildActionsBlock(event.customerId, shop)
        );
        break;

      default:
        text = `Loyalty event: ${event.type}`;
        blocks.push(
          this.buildHeaderBlock(`:bell: ${event.type.replace(/_/g, " ")}`),
          this.buildSectionBlock(
            `Event for *${event.customerEmail || "Unknown"}*`
          ),
          this.buildContextBlock(`Shop: ${shop}`)
        );
    }

    return { text, blocks };
  }

  private buildHeaderBlock(text: string): SlackBlock {
    return {
      type: "header",
      text: {
        type: "plain_text",
        text,
        emoji: true,
      },
    };
  }

  private buildSectionBlock(text: string): SlackBlock {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text,
      },
    };
  }

  private buildFieldsBlock(
    fields: Array<{ label: string; value: string }>
  ): SlackBlock {
    return {
      type: "section",
      fields: fields.map((f) => ({
        type: "mrkdwn" as const,
        text: `*${f.label}:*\n${f.value}`,
      })),
    };
  }

  private buildContextBlock(text: string): SlackBlock {
    return {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text,
        },
      ],
    };
  }

  private buildActionsBlock(customerId?: string, shop?: string): SlackBlock {
    const elements: SlackBlockElement[] = [];

    if (customerId) {
      elements.push({
        type: "button",
        text: {
          type: "plain_text",
          text: "View Customer",
          emoji: true,
        },
        url: `https://${shop}/admin/apps/rewardspro/members?customer=${customerId}`,
        action_id: "view_customer",
      });
    }

    elements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open Dashboard",
        emoji: true,
      },
      url: `https://${shop}/admin/apps/rewardspro`,
      action_id: "open_dashboard",
    });

    return {
      type: "actions",
      elements,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLASH COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build customer lookup response
 */
export function buildCustomerLookupResponse(customer: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  currentPoints: number;
  totalPointsEarned: number;
  tier?: { name: string; level: number } | null;
  lifetimeValue?: number;
}): SlackMessage {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";

  return {
    text: `Customer: ${customer.email}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:bust_in_silhouette: ${name}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Email:*\n${customer.email}` },
          { type: "mrkdwn", text: `*Tier:*\n${customer.tier?.name || "None"}` },
          { type: "mrkdwn", text: `*Points Balance:*\n${customer.currentPoints.toLocaleString()}` },
          { type: "mrkdwn", text: `*Lifetime Points:*\n${customer.totalPointsEarned.toLocaleString()}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Award Points", emoji: true },
            action_id: `award_points_${customer.email}`,
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "View Profile", emoji: true },
            action_id: `view_profile_${customer.email}`,
          },
        ],
      },
    ],
  };
}

/**
 * Build points awarded response
 */
export function buildPointsAwardedResponse(
  email: string,
  points: number,
  newBalance: number,
  reason: string
): SlackMessage {
  const emoji = points > 0 ? ":white_check_mark:" : ":heavy_minus_sign:";
  const action = points > 0 ? "awarded to" : "deducted from";

  return {
    text: `${Math.abs(points)} points ${action} ${email}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${Math.abs(points).toLocaleString()} points* ${action} *${email}*\n_${reason}_`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `New balance: *${newBalance.toLocaleString()} points*` },
        ],
      },
    ],
  };
}

/**
 * Build error response
 */
export function buildErrorResponse(message: string): SlackMessage {
  return {
    text: `Error: ${message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:x: *Error:* ${message}`,
        },
      },
    ],
  };
}

/**
 * Build stats response
 */
export function buildStatsResponse(stats: {
  period: string;
  pointsEarned: number;
  pointsRedeemed: number;
  newMembers: number;
  tierUpgrades: number;
}): SlackMessage {
  return {
    text: `Program stats for ${stats.period}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:chart_with_upwards_trend: Program Stats (${stats.period})`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Points Earned:*\n${stats.pointsEarned.toLocaleString()}` },
          { type: "mrkdwn", text: `*Points Redeemed:*\n${stats.pointsRedeemed.toLocaleString()}` },
          { type: "mrkdwn", text: `*New Members:*\n${stats.newMembers.toLocaleString()}` },
          { type: "mrkdwn", text: `*Tier Upgrades:*\n${stats.tierUpgrades.toLocaleString()}` },
        ],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

registerAdapter("SLACK", () => new SlackAdapter());

export { SLACK_CONFIG };

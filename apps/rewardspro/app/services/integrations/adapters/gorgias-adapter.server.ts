/**
 * Gorgias Integration Adapter
 *
 * Handles integration with Gorgias helpdesk for customer support.
 * Syncs loyalty data to customer sidebar, tracks support interactions,
 * and enables VIP customer prioritization.
 *
 * @see https://developers.gorgias.com/
 */

import { ApiKeyIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
import type { Integration } from "@prisma/client";
import type {
  IntegrationConfig,
  WebhookProcessingResult,
  EventDeliveryResult,
  ConnectionTestResult,
  LoyaltyEvent,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const GORGIAS_CONFIG: IntegrationConfig = {
  provider: "GORGIAS",
  name: "Gorgias",
  description: "Customer support helpdesk platform",
  icon: "gorgias",
  docsUrl: "https://developers.gorgias.com/",

  // Using API key auth (requires domain + API key + email in config)
  authType: "api_key",

  api: {
    baseUrl: "https://api.gorgias.com",
    rateLimit: {
      requests: 120,
      windowMs: 60000, // 120 requests per minute
    },
  },

  webhooks: {
    supportedTopics: [
      "ticket-created",
      "ticket-updated",
      "ticket-message-created",
      "customer-created",
      "customer-updated",
    ],
    signatureHeader: "X-Gorgias-Signature",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    {
      id: "sync_loyalty_data",
      name: "Loyalty Data Sync",
      description: "Display loyalty data in customer sidebar widget",
      category: "sync",
      requiresWebhook: false,
    },
    {
      id: "vip_prioritization",
      name: "VIP Prioritization",
      description: "Auto-prioritize tickets from VIP customers",
      category: "data",
      requiresWebhook: true,
    },
    {
      id: "ticket_tagging",
      name: "Tier-Based Tagging",
      description: "Automatically tag tickets with customer tier",
      category: "data",
      requiresWebhook: true,
    },
    {
      id: "points_on_resolution",
      name: "Resolution Points",
      description: "Award points for positive ticket resolutions",
      category: "points",
      requiresWebhook: true,
    },
  ],

  defaultPointsRules: [
    {
      triggerEvent: "ticket/resolved_positive",
      name: "Positive Resolution",
      description: "Points when a ticket is resolved positively",
      defaultPoints: 10,
    },
    {
      triggerEvent: "ticket/feedback_positive",
      name: "Positive Feedback",
      description: "Points for leaving positive support feedback",
      defaultPoints: 15,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// GORGIAS API TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GorgiasCustomer {
  id: number;
  email: string;
  name: string;
  firstname?: string;
  lastname?: string;
  external_id?: string; // Shopify customer ID
  data: Record<string, unknown>;
  tags: Array<{ name: string }>;
  created_datetime: string;
  updated_datetime: string;
}

interface GorgiasTicket {
  id: number;
  external_id?: string;
  customer: {
    id: number;
    email: string;
    name: string;
  };
  assignee_user?: {
    id: number;
    email: string;
    name: string;
  };
  channel: string;
  via: string;
  subject: string;
  status: "open" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  tags: Array<{ name: string }>;
  spam: boolean;
  trashed: boolean;
  satisfaction_survey?: {
    score: number;
    comment?: string;
    created_datetime: string;
  };
  created_datetime: string;
  updated_datetime: string;
  closed_datetime?: string;
}

interface GorgiasMessage {
  id: number;
  ticket_id: number;
  channel: string;
  via: string;
  from_agent: boolean;
  sender: {
    id: number;
    email: string;
    name: string;
  };
  body_text: string;
  body_html?: string;
  created_datetime: string;
}

interface GorgiasWebhookPayload {
  ticket?: GorgiasTicket;
  customer?: GorgiasCustomer;
  message?: GorgiasMessage;
  event: string;
}

interface GorgiasWidgetData {
  customer_email: string;
  widgets: Array<{
    type: "card";
    title: string;
    sections: Array<{
      type: "key_value_list";
      items: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class GorgiasAdapter extends ApiKeyIntegrationAdapter {
  constructor() {
    super(GORGIAS_CONFIG);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get Gorgias subdomain from integration config
   */
  private getGorgiasDomain(integration: Integration): string {
    const config = integration.config as Record<string, unknown>;
    return (config.gorgiasDomain as string) || "";
  }

  /**
   * Get Gorgias API email from integration config
   */
  private getGorgiasEmail(integration: Integration): string {
    const config = integration.config as Record<string, unknown>;
    return (config.gorgiasEmail as string) || "";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Make authenticated API request to Gorgias
   * Gorgias uses Basic Auth with email:api_key
   */
  protected async makeApiRequest<T>(
    integration: Integration,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const domain = this.getGorgiasDomain(integration);
    if (!domain) {
      throw new Error("Gorgias domain not configured");
    }

    const apiKey = this.getApiKey(integration);
    const email = this.getGorgiasEmail(integration);

    if (!apiKey || !email) {
      throw new Error("Gorgias API credentials not configured (need domain, email, and API key)");
    }

    // Gorgias uses Basic Auth with email:api_key
    const basicAuth = Buffer.from(`${email}:${apiKey}`).toString("base64");

    const baseUrl = `https://${domain}.gorgias.com/api`;
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gorgias API error ${response.status}: ${errorBody}`);
    }

    return response.json() as Promise<T>;
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
    this.logger.debug("Processing Gorgias webhook", { topic });

    const webhookData = payload as unknown as GorgiasWebhookPayload;

    switch (topic) {
      case "ticket-created":
        return this.processTicketCreated(webhookData);

      case "ticket-updated":
        return this.processTicketUpdated(webhookData);

      case "customer-created":
      case "customer-updated":
        return this.processCustomerEvent(topic, webhookData);

      default:
        return {
          action: topic,
          data: payload,
          shouldAwardPoints: false,
        };
    }
  }

  /**
   * Process ticket created webhook
   */
  private processTicketCreated(
    payload: GorgiasWebhookPayload
  ): WebhookProcessingResult {
    const ticket = payload.ticket;
    if (!ticket) {
      return {
        action: "ticket-created",
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      customerEmail: ticket.customer.email,
      action: "ticket-created",
      data: {
        ticketId: ticket.id,
        subject: ticket.subject,
        channel: ticket.channel,
        priority: ticket.priority,
        customerId: ticket.customer.id,
        customerName: ticket.customer.name,
        createdAt: ticket.created_datetime,
      },
      shouldAwardPoints: false, // Don't award points for creating tickets
    };
  }

  /**
   * Process ticket updated webhook
   */
  private processTicketUpdated(
    payload: GorgiasWebhookPayload
  ): WebhookProcessingResult {
    const ticket = payload.ticket;
    if (!ticket) {
      return {
        action: "ticket-updated",
        data: {},
        shouldAwardPoints: false,
      };
    }

    // Check for positive resolution
    const isResolved = ticket.status === "closed";
    const hasPositiveFeedback =
      ticket.satisfaction_survey && ticket.satisfaction_survey.score >= 4;

    // Determine if we should award points
    let shouldAwardPoints = false;
    let action = "ticket-updated";
    let basePoints = 0;

    if (isResolved && hasPositiveFeedback) {
      shouldAwardPoints = true;
      action = "ticket/feedback_positive";
      basePoints = 15;
    } else if (isResolved && !ticket.satisfaction_survey) {
      // Resolved but no feedback yet - could trigger feedback request
      action = "ticket/resolved";
    }

    return {
      customerEmail: ticket.customer.email,
      action,
      data: {
        ticketId: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        isResolved,
        satisfactionScore: ticket.satisfaction_survey?.score,
        satisfactionComment: ticket.satisfaction_survey?.comment,
        closedAt: ticket.closed_datetime,
        updatedAt: ticket.updated_datetime,
      },
      shouldAwardPoints,
      pointsContext: shouldAwardPoints
        ? {
            basePoints,
            bonusConditions: {
              excellentRating: ticket.satisfaction_survey?.score === 5,
              hasComment: !!ticket.satisfaction_survey?.comment,
            },
          }
        : undefined,
    };
  }

  /**
   * Process customer events
   */
  private processCustomerEvent(
    topic: string,
    payload: GorgiasWebhookPayload
  ): WebhookProcessingResult {
    const customer = payload.customer;
    if (!customer) {
      return {
        action: topic,
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      customerEmail: customer.email,
      shopifyCustomerId: customer.external_id,
      action: topic,
      data: {
        gorgiasCustomerId: customer.id,
        name: customer.name,
        firstName: customer.firstname,
        lastName: customer.lastname,
        tags: customer.tags?.map((t) => t.name),
        createdAt: customer.created_datetime,
      },
      shouldAwardPoints: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Delivery Methods
  // ─────────────────────────────────────────────────────────────────────────

  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    // For Gorgias, we sync loyalty data as customer attributes
    // rather than sending discrete events

    if (
      event.type === "CUSTOMER_PROFILE_UPDATED" ||
      event.type === "TIER_UPGRADED" ||
      event.type === "TIER_DOWNGRADED"
    ) {
      try {
        await this.syncCustomerLoyaltyData(integration, event);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return { success: true };
  }

  /**
   * Sync customer loyalty data to Gorgias
   */
  private async syncCustomerLoyaltyData(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<void> {
    const { customerEmail, customerId, data } = event;

    if (!customerEmail) {
      throw new Error("Customer email required for Gorgias sync");
    }

    // Find Gorgias customer by email
    const searchResult = await this.makeApiRequest<{ data: GorgiasCustomer[] }>(
      integration,
      `/customers?email=${encodeURIComponent(customerEmail)}`
    );

    const gorgiasCustomer = searchResult.data?.[0];
    if (!gorgiasCustomer) {
      this.logger.debug("Customer not found in Gorgias", { customerEmail });
      return;
    }

    // Build updated customer data with loyalty info
    const newTier = data.newTier as { name?: string } | undefined;
    const loyaltyData = {
      loyalty_points: data.currentPoints ?? data.pointsBalance,
      loyalty_tier: data.tierName ?? newTier?.name,
      loyalty_customer_id: customerId,
      loyalty_lifetime_value: data.lifetimeValue,
      loyalty_total_points_earned: data.totalPointsEarned,
    };

    // Update customer
    await this.makeApiRequest(
      integration,
      `/customers/${gorgiasCustomer.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...gorgiasCustomer.data,
            ...loyaltyData,
          },
        }),
      }
    );

    this.logger.info("Synced loyalty data to Gorgias", {
      gorgiasCustomerId: gorgiasCustomer.id,
      customerEmail,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Test
  // ─────────────────────────────────────────────────────────────────────────

  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    const domain = this.getGorgiasDomain(integration);
    if (!domain) {
      return {
        success: false,
        message: "Gorgias domain not configured - set gorgiasDomain in config",
      };
    }

    const apiKey = this.getApiKey(integration);
    const email = this.getGorgiasEmail(integration);

    if (!apiKey || !email) {
      return {
        success: false,
        message: "Gorgias API credentials not configured - need domain, email, and API key",
      };
    }

    try {
      const basicAuth = Buffer.from(`${email}:${apiKey}`).toString("base64");
      const baseUrl = `https://${domain}.gorgias.com/api`;

      const response = await fetch(`${baseUrl}/account`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: "Invalid API credentials",
            latencyMs,
          };
        }
        return {
          success: false,
          message: `API returned status ${response.status}`,
          latencyMs,
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: `Connected to Gorgias for ${data.domain || domain}`,
        details: {
          accountId: data.id,
          domain: data.domain,
          companyName: data.company_name,
          plan: data.plan,
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
   * Get customer by email
   */
  async getCustomerByEmail(
    integration: Integration,
    email: string
  ): Promise<{
    success: boolean;
    customer?: GorgiasCustomer;
    error?: string;
  }> {
    try {
      const data = await this.makeApiRequest<{ data: GorgiasCustomer[] }>(
        integration,
        `/customers?email=${encodeURIComponent(email)}`
      );

      return {
        success: true,
        customer: data.data?.[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get customer tickets
   */
  async getCustomerTickets(
    integration: Integration,
    customerId: number,
    options?: {
      status?: "open" | "closed";
      limit?: number;
    }
  ): Promise<{
    success: boolean;
    tickets?: GorgiasTicket[];
    error?: string;
  }> {
    try {
      let endpoint = `/tickets?customer_id=${customerId}`;
      if (options?.status) {
        endpoint += `&status=${options.status}`;
      }
      if (options?.limit) {
        endpoint += `&limit=${options.limit}`;
      }

      const data = await this.makeApiRequest<{ data: GorgiasTicket[] }>(
        integration,
        endpoint
      );

      return {
        success: true,
        tickets: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update ticket priority (for VIP prioritization)
   */
  async updateTicketPriority(
    integration: Integration,
    ticketId: number,
    priority: "low" | "normal" | "high" | "urgent"
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await this.makeApiRequest(integration, `/tickets/${ticketId}`, {
        method: "PUT",
        body: JSON.stringify({ priority }),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Add tag to ticket (for tier-based tagging)
   */
  async addTicketTag(
    integration: Integration,
    ticketId: number,
    tagName: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // First get current tags
      const ticket = await this.makeApiRequest<GorgiasTicket>(
        integration,
        `/tickets/${ticketId}`
      );

      const currentTags = ticket.tags?.map((t) => t.name) || [];

      if (!currentTags.includes(tagName)) {
        await this.makeApiRequest(integration, `/tickets/${ticketId}`, {
          method: "PUT",
          body: JSON.stringify({
            tags: [...currentTags, tagName].map((name) => ({ name })),
          }),
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create widget data for sidebar display
   */
  buildWidgetData(loyaltyData: {
    customerEmail: string;
    currentPoints: number;
    tierName: string;
    lifetimeValue: number;
    totalPointsEarned: number;
    rewardsAvailable: number;
  }): GorgiasWidgetData {
    return {
      customer_email: loyaltyData.customerEmail,
      widgets: [
        {
          type: "card",
          title: "Loyalty Status",
          sections: [
            {
              type: "key_value_list",
              items: [
                {
                  key: "Tier",
                  value: loyaltyData.tierName,
                },
                {
                  key: "Points Balance",
                  value: loyaltyData.currentPoints.toLocaleString(),
                },
                {
                  key: "Lifetime Points",
                  value: loyaltyData.totalPointsEarned.toLocaleString(),
                },
                {
                  key: "Lifetime Value",
                  value: `$${loyaltyData.lifetimeValue.toFixed(2)}`,
                },
                {
                  key: "Rewards Available",
                  value: String(loyaltyData.rewardsAvailable),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Calculate support metrics for a customer
   */
  async calculateSupportMetrics(
    integration: Integration,
    email: string
  ): Promise<{
    success: boolean;
    metrics?: {
      totalTickets: number;
      openTickets: number;
      closedTickets: number;
      averageSatisfaction: number | null;
      lastTicketAt: string | null;
    };
    error?: string;
  }> {
    try {
      const customerResult = await this.getCustomerByEmail(integration, email);

      if (!customerResult.success || !customerResult.customer) {
        return {
          success: false,
          error: "Customer not found in Gorgias",
        };
      }

      const ticketsResult = await this.getCustomerTickets(
        integration,
        customerResult.customer.id
      );

      if (!ticketsResult.success) {
        return {
          success: false,
          error: ticketsResult.error,
        };
      }

      const tickets = ticketsResult.tickets || [];
      const openTickets = tickets.filter((t) => t.status === "open").length;
      const closedTickets = tickets.filter((t) => t.status === "closed").length;

      // Calculate average satisfaction
      const ticketsWithSurvey = tickets.filter((t) => t.satisfaction_survey);
      const averageSatisfaction =
        ticketsWithSurvey.length > 0
          ? ticketsWithSurvey.reduce(
              (sum, t) => sum + (t.satisfaction_survey?.score || 0),
              0
            ) / ticketsWithSurvey.length
          : null;

      // Get most recent ticket date
      const sortedTickets = [...tickets].sort(
        (a, b) =>
          new Date(b.created_datetime).getTime() -
          new Date(a.created_datetime).getTime()
      );
      const lastTicketAt = sortedTickets[0]?.created_datetime || null;

      return {
        success: true,
        metrics: {
          totalTickets: tickets.length,
          openTickets,
          closedTickets,
          averageSatisfaction,
          lastTicketAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

// Register the adapter when this module is imported
registerAdapter("GORGIAS", () => new GorgiasAdapter());

// Export for direct use
export const gorgiasAdapter = new GorgiasAdapter();

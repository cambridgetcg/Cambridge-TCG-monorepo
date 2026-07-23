/**
 * Integration Types
 * Type definitions for the third-party integration system
 */

import type {
  Integration,
  IntegrationProvider,
  LoyaltyEventType,
  IntegrationPointsType,
} from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon?: string;
  docsUrl?: string;

  // Authentication method
  authType: "oauth" | "api_key" | "webhook_only";

  // OAuth configuration (if applicable)
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
    usePKCE: boolean;
  };

  // API configuration
  api?: {
    baseUrl: string;
    version?: string;
    rateLimit?: {
      requests: number;
      windowMs: number;
    };
  };

  // Webhook configuration
  webhooks?: {
    supportedTopics: string[];
    signatureHeader: string;
    signatureAlgorithm: "hmac-sha256" | "hmac-sha1";
  };

  // Available features
  features: IntegrationFeature[];

  // Default points rules
  defaultPointsRules: DefaultPointsRule[];
}

export interface IntegrationFeature {
  id: string;
  name: string;
  description: string;
  category: "sync" | "points" | "notifications" | "data" | "rewards" | "automation";
  requiresWebhook?: boolean;
  requiresOAuth?: boolean;
  isPremium?: boolean;
}

export interface DefaultPointsRule {
  triggerEvent: string;
  name: string;
  description: string;
  defaultPoints: number;
  conditions?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LoyaltyEvent {
  type: LoyaltyEventType;
  customerId?: string;
  shopifyCustomerId?: string;
  customerEmail?: string;
  orderId?: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EventDeliveryResult {
  success: boolean;
  externalId?: string;
  error?: string;
  retryable?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string[];
  tokenType?: string;
}

export interface OAuthAuthorizationResult {
  url: string;
  state: string;
  codeVerifier?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WebhookProcessingResult {
  customerEmail?: string;
  shopifyCustomerId?: string;
  action: string;
  data: Record<string, unknown>;
  shouldAwardPoints: boolean;
  pointsContext?: {
    basePoints: number;
    bonusConditions: Record<string, boolean>;
    orderValue?: number;
  };
}

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION TEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface IIntegrationAdapter {
  readonly config: IntegrationConfig;

  // OAuth methods
  generateAuthUrl(shop: string, redirectUri: string): Promise<OAuthAuthorizationResult>;
  exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  // Webhook methods
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  processWebhook(topic: string, payload: Record<string, unknown>): Promise<WebhookProcessingResult>;

  // Event delivery
  sendEvent(integration: Integration, event: LoyaltyEvent): Promise<EventDeliveryResult>;

  // Connection test
  testConnection(integration: Integration): Promise<ConnectionTestResult>;

  // Optional: Custom API methods
  apiRequest?<T>(
    integration: Integration,
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T>;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type IntegrationWithCredentials = Integration & {
  decryptedAccessToken?: string;
  decryptedRefreshToken?: string;
  decryptedApiKey?: string;
  decryptedApiSecret?: string;
};

export interface PointsCalculationContext {
  basePoints: number;
  bonusConditions: Record<string, boolean>;
  orderValue?: number;
  customerId?: string;
}

export interface PointsRule {
  triggerEvent: string;
  pointsAmount: number;
  pointsType: IntegrationPointsType;
  pointsPercent?: number;
  maxPoints?: number;
  conditions: Record<string, unknown>;
}

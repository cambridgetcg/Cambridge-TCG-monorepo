/**
 * Integration Services - Public API
 *
 * Central export for all integration-related services.
 */

// Core types
export * from "./types";

// Integration Manager - Core orchestration
export {
  registerAdapter,
  getAdapter,
  hasAdapter,
  getRegisteredProviders,
  getIntegrations,
  getConnectedIntegrations,
  getIntegration,
  getIntegrationById,
  upsertIntegration,
  updateIntegrationStatus,
  storeOAuthTokens,
  storeApiKey,
  disconnectIntegration,
  updateEnabledFeatures,
  testConnection,
  broadcastEvent,
  processEventQueue,
  getPointsRules,
  createDefaultPointsRules,
  getAvailableIntegrations,
  cleanupStaleOAuthStates,
  cleanupOldWebhooks,
} from "./integration-manager.server";

// Base Adapter - For creating new adapters
export {
  BaseIntegrationAdapter,
  ApiKeyIntegrationAdapter,
  WebhookOnlyIntegrationAdapter,
} from "./base-adapter.server";

// OAuth Handler - OAuth 2.0 + PKCE flows
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  createOAuthState,
  validateOAuthState,
  markStateAsUsed,
  deleteOAuthState,
  initiateOAuth,
  handleOAuthCallback,
  refreshIntegrationTokens,
  revokeOAuthTokens,
  buildRedirectUri,
  hasValidTokens,
} from "./oauth-handler.server";

// Event Dispatcher - Emit loyalty events
export {
  dispatchPointsEarned,
  dispatchPointsRedeemed,
  dispatchPointsExpired,
  dispatchPointsAdjusted,
  dispatchTierUpgraded,
  dispatchTierDowngraded,
  dispatchTierPurchased,
  dispatchSubscriptionCreated,
  dispatchSubscriptionCancelled,
  dispatchCustomerEnrolled,
  dispatchCustomerProfileUpdated,
  dispatchReferralSent,
  dispatchReferralCompleted,
  dispatchEvent,
  processEvents,
  getEventQueueStats,
  retryFailedEvents,
  clearDeliveredEvents,
} from "./event-dispatcher.server";

// Webhook Handler - Process incoming webhooks
export {
  processWebhook,
  getWebhookHistory,
  retryWebhook,
  getWebhookStats,
  cleanupOldWebhooks as cleanupProcessedWebhooks,
  extractSignature,
  getSignatureHeaderName,
} from "./webhook-handler.server";

// Re-export Prisma types for convenience
export type {
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  IntegrationEvent,
  IntegrationEventStatus,
  IntegrationWebhook,
  IntegrationWebhookStatus,
  IntegrationPointsRule,
  IntegrationPointsType,
  OAuthState,
  LoyaltyEventType,
} from "@prisma/client";

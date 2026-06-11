/**
 * Billing Services Index
 *
 * Central export for all billing-related services.
 * Import from here for cleaner imports throughout the app.
 *
 * @example
 * import { enforceUsageCap, checkWebhookIdempotency } from "~/services/billing";
 */

// Webhook Processing
export {
  checkWebhookIdempotency,
  markWebhookCompleted,
  markWebhookFailed,
  clearWebhookForRetry,
  extractTimestamps,
  hashPayload,
  cleanupOldWebhooks,
  getWebhookStats,
  type WebhookProcessingResult,
  type WebhookRejectionReason,
  type WebhookContext,
} from "./webhook-processing.server";

// Usage Enforcement
export {
  enforceUsageCap,
  checkUsageThresholds,
  recordThresholdAlert,
  getUsageSummary,
  requireUsageCapacity,
  type UsageEnforcementResult,
  type UsageBlockReason,
  type UsageThresholdAlert,
} from "./usage-enforcement.server";

// Subscription Expiry
export {
  isSubscriptionExpired,
  getSubscriptionStatus,
  findExpiredSubscriptions,
  markSubscriptionExpired,
  runExpiryCheckJob,
  hasActiveAccess,
  type ExpiredSubscription,
  type ExpiryCheckResult,
} from "./subscription-expiry.server";

// Reconciliation
export {
  reconcileLocalState,
  fixLocalStateInconsistencies,
  runReconciliationJob,
  getPendingReconciliationIssues,
  resolveReconciliationIssue,
  getReconciliationStats,
  type ReconciliationMismatch,
  type ReconciliationResult,
  type ReconciliationJobResult,
} from "./reconciliation.server";

// Trial Eligibility
export {
  checkTrialEligibility,
  markTrialUsed,
  logTrialAttempt,
  getTrialAuditHistory,
  getTrialAbuseStats,
  getTrialDaysForRequest,
  type TrialEligibilityResult,
  type TrialBlockReason,
  type TrialAuditLogInput,
} from "./trial-eligibility.server";

// Usage Tracker (class-based)
export { UsageTrackerService } from "./usage-tracker.service";

// Plan Configuration
export { getPlanConfig } from "./plan-subscription.server";

// GraphQL Billing (class-based)
export { GraphQLBillingService } from "./graphql-billing.service";

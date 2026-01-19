/**
 * RewardsPro Development Tools Library
 *
 * Exports all tool modules for programmatic usage.
 */

export {
  WebhookSimulator,
  WebhookSequences,
  WEBHOOK_TOPICS,
  WEBHOOK_SEQUENCES,
  createWebhookSimulator,
  generateOrderPayload,
  generateCustomerPayload,
  generateRefundPayload,
  generateAppUninstalledPayload,
  getAvailableSequences,
  type WebhookSimulatorConfig,
  type WebhookPayload,
  type WebhookResult,
  type WebhookSequence,
  type WebhookSequenceStep,
  type SequenceResult,
  type WebhookTopic,
} from './webhook-simulator.js';

export {
  ShopInspector,
  INSPECTION_SECTIONS,
  createInspector,
  createShopInspector,
  getDb,
  disconnectDb,
  checkDbConnection,
  type ShopInspectorConfig,
  type InspectionOptions,
  type ShopInspectionResult,
  type InspectionSection,
  type InspectionSummary,
} from './shop-inspector.js';

export {
  ScenarioRunner,
  BuiltInScenarios,
  createScenarioRunner,
  type ScenarioConfig,
  type ScenarioStep,
  type ScenarioDefinition,
  type ScenarioResult,
  type ScenarioContext,
  type ScenarioAssertion,
  type StepResult,
} from './scenario-runner.js';

// Validation utilities
export {
  validateShopDomain,
  assertValidShopDomain,
  validateWebhookSecret,
  assertValidWebhookSecret,
  validateWebhookTopic,
  assertValidWebhookTopic,
  validateUrl,
  assertValidUrl,
  validateDatabaseUrl,
  assertValidDatabaseUrl,
  validatePayload,
  assertValidPayload,
  validateShopifyId,
  normalizeToGid,
  validateAll,
  type ValidationResult,
  type ValidationOptions,
  type ValidWebhookTopic,
} from './validation.js';

// Retry utilities
export {
  withRetry,
  withRetryThrow,
  withTimeout,
  sleep,
  isNetworkError,
  isRetryableStatusCode,
  createHttpRetryPredicate,
  TimeoutError,
  type RetryOptions,
  type RetryResult,
} from './retry.js';

// Logging utilities
export {
  Logger,
  createLogger,
  logger,
  parseLogLevel,
  formatDuration,
  type LogLevel,
  type LogContext,
  type LogEntry,
  type LoggerConfig,
} from './logger.js';

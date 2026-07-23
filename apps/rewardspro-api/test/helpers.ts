import type { ApiConfig } from "../src/config.js";
import type { CommerceEventForNormalization } from "../src/domain/normalized-order-paid.js";

export const TEST_EVENT_ID = "10000000-0000-4000-8000-000000000001";
export const TEST_WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";
export const TEST_CONNECTION_ID = "30000000-0000-4000-8000-000000000003";

export function apiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    awsRegion: undefined,
    database: {
      connectTimeoutMs: 100,
      databaseUrl: "postgresql://test@localhost:5432/test",
      poolMax: 2,
      queryTimeoutMs: 100,
      source: "environment",
    },
    logLevel: "silent",
    nodeEnv: "test",
    operatorToken: "operator-test-token",
    port: 3000,
    shopifyApiSecret: "shopify-test-secret",
    shutdownGraceMs: 100,
    sqsQueueUrl: undefined,
    webhookBodyLimitBytes: 1024 * 1024,
    ...overrides,
  };
}

export function normalizableEvent(
  overrides: Partial<CommerceEventForNormalization> = {},
): CommerceEventForNormalization {
  return {
    commerceConnectionId: TEST_CONNECTION_ID,
    eventId: TEST_EVENT_ID,
    externalAccountId: "example.myshopify.com",
    externalEventId: "shopify-webhook-1",
    externalEventType: "orders/paid",
    occurredAt: "2026-07-23T10:00:01Z",
    payload: {
      currency: "GBP",
      current_total_price: "12.50",
      id: 42,
      line_items: [],
      processed_at: "2026-07-23T10:00:00Z",
    },
    payloadSha256: "a".repeat(64),
    provider: "shopify",
    receivedAt: "2026-07-23T10:00:02Z",
    workspaceId: TEST_WORKSPACE_ID,
    ...overrides,
  };
}

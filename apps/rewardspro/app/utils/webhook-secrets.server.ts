/**
 * Webhook Secrets Validation Utility
 * Ensures correct secrets are used for webhook HMAC verification
 *
 * Phase 0: Emergency Security Fix
 * Date: 2025-01-07
 */

import { createLogger } from '~/services/logger.server';

const logger = createLogger('WebhookSecrets');

/**
 * Gets the webhook secret for HMAC verification.
 * IMPORTANT: This should NEVER be the API secret!
 */
export function getWebhookSecret(): string {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    logger.error('SHOPIFY_WEBHOOK_SECRET not configured', {
      hint: 'Set SHOPIFY_WEBHOOK_SECRET environment variable'
    });
    throw new Error(
      'SHOPIFY_WEBHOOK_SECRET environment variable is required for webhook verification. ' +
      'Do NOT use SHOPIFY_API_SECRET for webhook HMAC verification.'
    );
  }

  return secret;
}

/**
 * Validates webhook configuration at startup.
 * Call this during server initialization.
 */
export function validateWebhookConfiguration(): void {
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  // Check webhook secret exists
  if (!webhookSecret) {
    throw new Error(
      '[CRITICAL] SHOPIFY_WEBHOOK_SECRET must be configured. ' +
      'Webhook verification will fail without it.'
    );
  }

  // Check they're not the same (common misconfiguration)
  if (webhookSecret === apiSecret) {
    logger.warn('Security Warning: SHOPIFY_WEBHOOK_SECRET equals SHOPIFY_API_SECRET', {
      warning: 'These should typically be different values',
      recommendation: 'Verify your Shopify app settings'
    });
  }

  // Check minimum length
  if (webhookSecret.length < 32) {
    logger.warn('Webhook secret appears short', {
      length: webhookSecret.length,
      recommendation: 'Shopify webhook secrets are typically 64+ characters'
    });
  }

  logger.info('Webhook configuration validated successfully');
}

/**
 * Gets the API secret for OAuth/session operations.
 * NOT for webhook HMAC verification!
 */
export function getApiSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    throw new Error('SHOPIFY_API_SECRET environment variable is required');
  }

  return secret;
}

/**
 * Type guard to ensure correct secret usage
 */
export type WebhookSecretType = 'webhook' | 'api';

export function getSecret(type: WebhookSecretType): string {
  switch (type) {
    case 'webhook':
      return getWebhookSecret();
    case 'api':
      return getApiSecret();
    default:
      throw new Error(`Unknown secret type: ${type}`);
  }
}

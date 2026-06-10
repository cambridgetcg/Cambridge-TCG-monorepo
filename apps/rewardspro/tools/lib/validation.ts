/**
 * Input Validation Utilities
 *
 * Centralized validation for all tool inputs.
 * Provides consistent error messages and validation patterns.
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidationOptions {
  /** Field name for error messages */
  fieldName?: string;
  /** Allow empty string */
  allowEmpty?: boolean;
}

// ============================================================================
// Shop Domain Validation
// ============================================================================

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Validate Shopify shop domain format
 */
export function validateShopDomain(shop: unknown, options?: ValidationOptions): ValidationResult {
  const fieldName = options?.fieldName || 'shop';

  if (shop === null || shop === undefined) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof shop !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = shop.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  if (!SHOPIFY_DOMAIN_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldName} must be a valid Shopify domain (e.g., store.myshopify.com)`,
    };
  }

  return { valid: true };
}

/**
 * Validate and normalize shop domain
 * Throws if invalid
 */
export function assertValidShopDomain(shop: unknown, fieldName = 'shop'): string {
  const result = validateShopDomain(shop, { fieldName });
  if (!result.valid) {
    throw new Error(result.error);
  }
  return (shop as string).trim().toLowerCase();
}

// ============================================================================
// Webhook Secret Validation
// ============================================================================

/**
 * Validate webhook secret is present and has minimum length
 */
export function validateWebhookSecret(secret: unknown, options?: ValidationOptions): ValidationResult {
  const fieldName = options?.fieldName || 'webhookSecret';

  if (secret === null || secret === undefined) {
    return { valid: false, error: `${fieldName} is required for HMAC signing` };
  }

  if (typeof secret !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (secret.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  // Shopify secrets are typically 32+ characters
  if (secret.length < 16) {
    return {
      valid: false,
      error: `${fieldName} appears too short - Shopify API secrets are typically 32+ characters`,
    };
  }

  return { valid: true };
}

/**
 * Validate webhook secret, throws if invalid
 */
export function assertValidWebhookSecret(secret: unknown, fieldName = 'webhookSecret'): string {
  const result = validateWebhookSecret(secret, { fieldName });
  if (!result.valid) {
    throw new Error(result.error);
  }
  return secret as string;
}

// ============================================================================
// Webhook Topic Validation
// ============================================================================

const VALID_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/cancelled',
  'orders/fulfilled',
  'orders/updated',
  'customers/create',
  'customers/update',
  'customers/delete',
  'refunds/create',
  'app/uninstalled',
  'shop/update',
  'products/create',
  'products/update',
  'products/delete',
] as const;

export type ValidWebhookTopic = (typeof VALID_WEBHOOK_TOPICS)[number];

/**
 * Validate webhook topic
 */
export function validateWebhookTopic(topic: unknown): ValidationResult {
  if (topic === null || topic === undefined) {
    return { valid: false, error: 'webhook topic is required' };
  }

  if (typeof topic !== 'string') {
    return { valid: false, error: 'webhook topic must be a string' };
  }

  if (!VALID_WEBHOOK_TOPICS.includes(topic as ValidWebhookTopic)) {
    return {
      valid: false,
      error: `Invalid webhook topic: ${topic}. Valid topics: ${VALID_WEBHOOK_TOPICS.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validate webhook topic, throws if invalid
 */
export function assertValidWebhookTopic(topic: unknown): ValidWebhookTopic {
  const result = validateWebhookTopic(topic);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return topic as ValidWebhookTopic;
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate URL format
 */
export function validateUrl(url: unknown, options?: ValidationOptions): ValidationResult {
  const fieldName = options?.fieldName || 'url';

  if (url === null || url === undefined) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof url !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: `${fieldName} must use http or https protocol` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `${fieldName} is not a valid URL` };
  }
}

/**
 * Validate URL, throws if invalid
 */
export function assertValidUrl(url: unknown, fieldName = 'url'): string {
  const result = validateUrl(url, { fieldName });
  if (!result.valid) {
    throw new Error(result.error);
  }
  return url as string;
}

// ============================================================================
// Database URL Validation
// ============================================================================

/**
 * Validate PostgreSQL connection URL
 */
export function validateDatabaseUrl(url: unknown, options?: ValidationOptions): ValidationResult {
  const fieldName = options?.fieldName || 'databaseUrl';

  if (url === null || url === undefined) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof url !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return {
      valid: false,
      error: `${fieldName} must be a PostgreSQL connection URL (postgres:// or postgresql://)`,
    };
  }

  return { valid: true };
}

/**
 * Validate database URL, throws if invalid
 */
export function assertValidDatabaseUrl(url: unknown, fieldName = 'databaseUrl'): string {
  const result = validateDatabaseUrl(url, { fieldName });
  if (!result.valid) {
    throw new Error(result.error);
  }
  return url as string;
}

// ============================================================================
// Payload Validation
// ============================================================================

/**
 * Validate webhook payload is an object
 */
export function validatePayload(payload: unknown): ValidationResult {
  if (payload === null || payload === undefined) {
    return { valid: true }; // Empty payload is OK, will default to {}
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'payload must be an object' };
  }

  return { valid: true };
}

/**
 * Validate payload, throws if invalid
 */
export function assertValidPayload(payload: unknown): Record<string, unknown> {
  const result = validatePayload(payload);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return (payload || {}) as Record<string, unknown>;
}

// ============================================================================
// Shopify ID Validation
// ============================================================================

const GID_REGEX = /^gid:\/\/shopify\/\w+\/\d+$/;
const NUMERIC_ID_REGEX = /^\d+$/;

/**
 * Validate Shopify ID (either GID or numeric)
 */
export function validateShopifyId(id: unknown, resourceType?: string): ValidationResult {
  if (id === null || id === undefined) {
    return { valid: false, error: 'Shopify ID is required' };
  }

  const idStr = String(id);

  // Accept numeric IDs
  if (NUMERIC_ID_REGEX.test(idStr)) {
    return { valid: true };
  }

  // Accept GID format
  if (GID_REGEX.test(idStr)) {
    if (resourceType) {
      const expectedPrefix = `gid://shopify/${resourceType}/`;
      if (!idStr.startsWith(expectedPrefix)) {
        return {
          valid: false,
          error: `Expected ${resourceType} ID but got: ${idStr}`,
        };
      }
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid Shopify ID format: ${idStr}. Expected numeric ID or gid://shopify/Type/123`,
  };
}

/**
 * Normalize Shopify ID to GID format
 */
export function normalizeToGid(id: string | number, resourceType: string): string {
  const idStr = String(id);

  if (GID_REGEX.test(idStr)) {
    return idStr;
  }

  if (NUMERIC_ID_REGEX.test(idStr)) {
    return `gid://shopify/${resourceType}/${idStr}`;
  }

  throw new Error(`Cannot normalize invalid ID: ${idStr}`);
}

// ============================================================================
// Composite Validation
// ============================================================================

/**
 * Validate multiple fields at once
 */
export function validateAll(
  validations: Array<{ field: string; value: unknown; validator: (v: unknown) => ValidationResult }>
): ValidationResult {
  const errors: string[] = [];

  for (const { field, value, validator } of validations) {
    const result = validator(value);
    if (!result.valid) {
      errors.push(`${field}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors.join('; '),
    };
  }

  return { valid: true };
}

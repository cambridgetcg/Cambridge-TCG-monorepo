/**
 * PII Masking Utilities
 *
 * Provides functions to mask personally identifiable information (PII)
 * for safe logging in production environments.
 *
 * NEVER log unmasked PII in production - this is a GDPR/CCPA violation risk.
 */

/**
 * Masks an email for safe logging
 * "john.doe@example.com" -> "j***e@e***.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]';

  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '[invalid-email]';

  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);

  const dotIndex = domain.lastIndexOf('.');
  if (dotIndex === -1) return '[invalid-email]';

  const domainName = domain.substring(0, dotIndex);
  const tld = domain.substring(dotIndex + 1);

  const maskedLocal = local.length > 2
    ? `${local[0]}***${local[local.length - 1]}`
    : '***';

  const maskedDomain = domainName.length > 2
    ? `${domainName[0]}***`
    : '***';

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Masks a phone number for safe logging
 * "+1234567890" -> "+1***890"
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '[no-phone]';

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[invalid-phone]';

  const prefix = phone.startsWith('+') ? '+' : '';
  return `${prefix}${digits.substring(0, 2)}***${digits.substring(digits.length - 3)}`;
}

/**
 * Masks a name for safe logging
 * "John Doe" -> "J*** D***"
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return '[no-name]';

  return name.split(' ')
    .map(part => part.length > 0 ? `${part[0]}***` : '')
    .join(' ');
}

/**
 * Creates a safe log string for a customer
 * In production: Shows masked email, in dev: shows full details
 */
export function logSafeCustomer(
  shopifyCustomerId: string | number | null | undefined,
  email?: string | null
): string {
  if (process.env.NODE_ENV !== 'production') {
    // In development, show full details for debugging
    return `${shopifyCustomerId || '[no-id]'} (${email || '[no-email]'})`;
  }

  // In production, mask the email
  const id = shopifyCustomerId ? `shopify:${shopifyCustomerId}` : '[no-id]';
  return `${id} (${maskEmail(email)})`;
}

/**
 * Creates a safe log string for an order
 * In production: Masks customer info
 */
export function logSafeOrder(
  orderId: string | number | null | undefined,
  customerEmail?: string | null
): string {
  if (process.env.NODE_ENV !== 'production') {
    return `order:${orderId || '[no-id]'} customer:${customerEmail || '[no-email]'}`;
  }

  return `order:${orderId || '[no-id]'} customer:${maskEmail(customerEmail)}`;
}

/**
 * Masks sensitive data in an object for safe logging
 * Recursively processes objects and masks known PII fields
 */
export function maskSensitiveData<T extends Record<string, unknown>>(
  data: T,
  sensitiveFields: string[] = ['email', 'phone', 'firstName', 'lastName', 'name', 'address']
): T {
  if (process.env.NODE_ENV !== 'production') {
    return data; // No masking in development
  }

  const masked = { ...data } as Record<string, unknown>;

  for (const key of Object.keys(masked)) {
    const value = masked[key];

    if (value === null || value === undefined) {
      continue;
    }

    // Check if this is a sensitive field
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive && typeof value === 'string') {
      if (lowerKey.includes('email')) {
        masked[key] = maskEmail(value);
      } else if (lowerKey.includes('phone')) {
        masked[key] = maskPhone(value);
      } else if (lowerKey.includes('name')) {
        masked[key] = maskName(value);
      } else {
        // Generic masking for other sensitive fields
        masked[key] = value.length > 2
          ? `${value[0]}***${value[value.length - 1]}`
          : '***';
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveData(value as Record<string, unknown>, sensitiveFields);
    }
  }

  return masked as T;
}

/**
 * Safe logging helper that automatically masks PII
 * Use this instead of console.log for any data that might contain PII
 */
export function safeLog(message: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(message, maskSensitiveData(data));
  } else {
    console.log(message);
  }
}

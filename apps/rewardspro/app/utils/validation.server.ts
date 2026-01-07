/**
 * Validation Utilities
 *
 * Centralized validation schemas and utilities using Zod
 * Used across the application for consistent input validation
 */

import { z } from 'zod';

// ============================================
// PAGINATION VALIDATION
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function validatePagination(params: URLSearchParams | Record<string, string | undefined>): PaginationInput {
  const input = params instanceof URLSearchParams
    ? { page: params.get('page'), pageSize: params.get('pageSize') }
    : params;

  return paginationSchema.parse(input);
}

// ============================================
// COLOR VALIDATION
// ============================================

// Validates hex colors (#RGB, #RRGGBB, #RRGGBBAA)
const hexColorRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;

// Validates rgb/rgba colors
const rgbColorRegex = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;

// Validates hsl/hsla colors
const hslColorRegex = /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;

export const colorSchema = z.string().refine(
  (color) => {
    return (
      hexColorRegex.test(color) ||
      rgbColorRegex.test(color) ||
      hslColorRegex.test(color)
    );
  },
  { message: 'Invalid CSS color format. Use hex (#RRGGBB), rgb(), rgba(), hsl(), or hsla()' }
);

export function isValidColor(color: string): boolean {
  return colorSchema.safeParse(color).success;
}

// ============================================
// FINANCIAL VALIDATION
// ============================================

export const percentageSchema = z.coerce.number().min(0).max(100);

export const currencyAmountSchema = z.coerce.number().min(0).finite();

export const priceSchema = z.coerce.number().min(0).finite().transform(val => Math.round(val * 100) / 100);

export const discountSchema = z.object({
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  value: z.coerce.number().min(0),
}).refine(
  (data) => {
    if (data.type === 'PERCENTAGE') {
      return data.value <= 100;
    }
    return true;
  },
  { message: 'Percentage discount cannot exceed 100%' }
);

// ============================================
// ID VALIDATION
// ============================================

export const shopifyIdSchema = z.string().regex(
  /^gid:\/\/shopify\/\w+\/\d+$/,
  'Invalid Shopify GID format'
);

export const numericIdSchema = z.string().regex(/^\d+$/, 'Must be a numeric ID');

export const uuidSchema = z.string().uuid('Invalid UUID format');

// ============================================
// SHOP VALIDATION
// ============================================

export const shopDomainSchema = z.string().regex(
  /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/,
  'Invalid Shopify shop domain'
);

// ============================================
// EMAIL VALIDATION
// ============================================

export const emailSchema = z.string().email('Invalid email address').max(254, 'Email too long');

// ============================================
// DATE VALIDATION
// ============================================

export const dateSchema = z.coerce.date();

export const dateRangeSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'Start date must be before or equal to end date' }
);

// ============================================
// TIER VALIDATION
// ============================================

export const tierSchema = z.object({
  name: z.string().min(1, 'Tier name required').max(100, 'Tier name too long'),
  minSpend: z.coerce.number().min(0, 'Minimum spend cannot be negative'),
  cashbackPercent: percentageSchema,
  evaluationPeriod: z.enum(['ANNUAL', 'LIFETIME', 'MONTHLY', 'QUARTERLY']),
  description: z.string().max(500, 'Description too long').optional(),
});

// ============================================
// WIDGET SETTINGS VALIDATION
// ============================================

export const widgetSettingsSchema = z.object({
  primaryColor: colorSchema.optional(),
  backgroundColor: colorSchema.optional(),
  textColor: colorSchema.optional(),
  accentColor: colorSchema.optional(),
  borderRadius: z.coerce.number().int().min(0).max(50).optional(),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  showOnMobile: z.boolean().optional(),
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Safely parse and validate input with a Zod schema
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, input: unknown): {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
} {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessage = result.error.errors
    .map(e => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  return { success: false, error: errorMessage };
}

/**
 * Validate form data and return errors object for forms
 */
export function validateFormData<T>(schema: z.ZodSchema<T>, formData: FormData): {
  success: true;
  data: T;
} | {
  success: false;
  errors: Record<string, string>;
} {
  const entries = Object.fromEntries(formData.entries());
  const result = schema.safeParse(entries);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const error of result.error.errors) {
    const path = error.path.join('.');
    if (!errors[path]) {
      errors[path] = error.message;
    }
  }

  return { success: false, errors };
}

/**
 * Extract numeric ID from Shopify GID
 */
export function extractNumericId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Convert numeric ID to Shopify GID
 */
export function toShopifyGid(type: string, id: string | number): string {
  return `gid://shopify/${type}/${id}`;
}

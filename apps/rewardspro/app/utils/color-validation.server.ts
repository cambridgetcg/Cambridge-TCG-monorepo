/**
 * Color Validation Utility
 * Prevents XSS/CSS injection attacks through color inputs
 *
 * Phase 0: Emergency Security Fix
 * Date: 2025-01-07
 */

// Strict regex patterns for valid CSS colors
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const RGB_REGEX = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
const RGBA_REGEX = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/;
const HSL_REGEX = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;
const HSLA_REGEX = /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*(0|1|0?\.\d+)\s*\)$/;

// Named colors that are safe to use
const SAFE_NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'gray', 'grey', 'cyan', 'magenta', 'brown', 'navy', 'teal',
  'olive', 'maroon', 'aqua', 'fuchsia', 'silver', 'lime', 'transparent'
]);

/**
 * Validates if a string is a safe CSS color value
 */
export function isValidColor(color: string | null | undefined): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }

  const trimmed = color.trim().toLowerCase();

  // Empty check
  if (trimmed.length === 0) {
    return false;
  }

  // Max length check to prevent DoS
  if (trimmed.length > 50) {
    return false;
  }

  // Check hex colors (most common)
  if (HEX_COLOR_REGEX.test(trimmed) || HEX_COLOR_REGEX.test(color.trim())) {
    return true;
  }

  // Check rgb/rgba
  if (RGB_REGEX.test(trimmed)) {
    const match = trimmed.match(RGB_REGEX);
    if (match) {
      const [, r, g, b] = match;
      return parseInt(r) <= 255 && parseInt(g) <= 255 && parseInt(b) <= 255;
    }
  }

  if (RGBA_REGEX.test(trimmed)) {
    const match = trimmed.match(RGBA_REGEX);
    if (match) {
      const [, r, g, b] = match;
      return parseInt(r) <= 255 && parseInt(g) <= 255 && parseInt(b) <= 255;
    }
  }

  // Check hsl/hsla
  if (HSL_REGEX.test(trimmed)) {
    const match = trimmed.match(HSL_REGEX);
    if (match) {
      const [, h, s, l] = match;
      return parseInt(h) <= 360 && parseInt(s) <= 100 && parseInt(l) <= 100;
    }
  }

  if (HSLA_REGEX.test(trimmed)) {
    const match = trimmed.match(HSLA_REGEX);
    if (match) {
      const [, h, s, l] = match;
      return parseInt(h) <= 360 && parseInt(s) <= 100 && parseInt(l) <= 100;
    }
  }

  // Check safe named colors
  if (SAFE_NAMED_COLORS.has(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Sanitizes a color input, returning fallback if invalid
 */
export function sanitizeColor(
  color: string | null | undefined,
  fallback: string = '#000000'
): string {
  if (isValidColor(color)) {
    return color!.trim();
  }
  return fallback;
}

/**
 * Validates and sanitizes a hex color specifically
 */
export function sanitizeHexColor(
  color: string | null | undefined,
  fallback: string = '#000000'
): string {
  if (!color || typeof color !== 'string') {
    return fallback;
  }

  const trimmed = color.trim();

  // Add # if missing
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

  if (HEX_COLOR_REGEX.test(withHash)) {
    return withHash.toUpperCase();
  }

  return fallback;
}

/**
 * Validates multiple colors at once
 */
export function validateColorPalette(colors: Record<string, string | null>): {
  valid: boolean;
  errors: string[];
  sanitized: Record<string, string>;
} {
  const errors: string[] = [];
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(colors)) {
    if (value !== null && !isValidColor(value)) {
      errors.push(`Invalid color for ${key}: ${value}`);
      sanitized[key] = '#000000'; // Default fallback
    } else {
      sanitized[key] = value || '#000000';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Default widget theme colors (safe values)
 */
export const DEFAULT_WIDGET_COLORS = {
  primary: '#6366F1',      // Indigo
  background: '#FFFFFF',   // White
  text: '#1F2937',         // Dark gray
  accent: '#10B981',       // Emerald
} as const;

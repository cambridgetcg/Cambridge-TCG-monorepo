/**
 * Color Utility Functions
 *
 * Provides conversion between HSB (Hue, Saturation, Brightness) and Hex color formats.
 * Used with Shopify Polaris ColorPicker which operates in HSB format.
 */

export interface HSBColor {
  hue: number;        // 0-360
  saturation: number; // 0-1
  brightness: number; // 0-1
  alpha?: number;     // 0-1 (optional)
}

export interface RGBColor {
  red: number;   // 0-255
  green: number; // 0-255
  blue: number;  // 0-255
  alpha?: number; // 0-1 (optional)
}

/**
 * Convert HSB color to RGB
 */
export function hsbToRgb(hsb: HSBColor): RGBColor {
  const { hue, saturation, brightness } = hsb;

  const chroma = brightness * saturation;
  const hueSegment = hue / 60;
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const m = brightness - chroma;

  let r = 0, g = 0, b = 0;

  if (hueSegment >= 0 && hueSegment < 1) {
    r = chroma; g = x; b = 0;
  } else if (hueSegment >= 1 && hueSegment < 2) {
    r = x; g = chroma; b = 0;
  } else if (hueSegment >= 2 && hueSegment < 3) {
    r = 0; g = chroma; b = x;
  } else if (hueSegment >= 3 && hueSegment < 4) {
    r = 0; g = x; b = chroma;
  } else if (hueSegment >= 4 && hueSegment < 5) {
    r = x; g = 0; b = chroma;
  } else if (hueSegment >= 5 && hueSegment < 6) {
    r = chroma; g = 0; b = x;
  }

  return {
    red: Math.round((r + m) * 255),
    green: Math.round((g + m) * 255),
    blue: Math.round((b + m) * 255),
    alpha: hsb.alpha,
  };
}

/**
 * Convert RGB color to HSB
 */
export function rgbToHsb(rgb: RGBColor): HSBColor {
  const { red, green, blue } = rgb;

  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  let saturation = 0;
  const brightness = max;

  if (delta !== 0) {
    saturation = delta / max;

    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    hue,
    saturation,
    brightness,
    alpha: rgb.alpha,
  };
}

/**
 * Convert RGB color to Hex string
 */
export function rgbToHex(rgb: RGBColor): string {
  const toHex = (value: number): string => {
    const hex = Math.max(0, Math.min(255, Math.round(value))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hex = `#${toHex(rgb.red)}${toHex(rgb.green)}${toHex(rgb.blue)}`;

  if (rgb.alpha !== undefined && rgb.alpha < 1) {
    return hex + toHex(Math.round(rgb.alpha * 255));
  }

  return hex.toUpperCase();
}

/**
 * Convert Hex string to RGB color
 */
export function hexToRgb(hex: string): RGBColor | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Validate hex format
  if (!/^[0-9A-Fa-f]{3,8}$/.test(cleanHex)) {
    return null;
  }

  let r: number, g: number, b: number, a: number | undefined;

  if (cleanHex.length === 3) {
    // Short format: #RGB
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 4) {
    // Short format with alpha: #RGBA
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
    a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
  } else if (cleanHex.length === 6) {
    // Standard format: #RRGGBB
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else if (cleanHex.length === 8) {
    // Format with alpha: #RRGGBBAA
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
    a = parseInt(cleanHex.substring(6, 8), 16) / 255;
  } else {
    return null;
  }

  return { red: r, green: g, blue: b, alpha: a };
}

/**
 * Convert HSB color to Hex string
 */
export function hsbToHex(hsb: HSBColor): string {
  const rgb = hsbToRgb(hsb);
  return rgbToHex(rgb);
}

/**
 * Convert Hex string to HSB color
 */
export function hexToHsb(hex: string): HSBColor | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsb(rgb);
}

/**
 * Validate if a string is a valid hex color
 */
export function isValidHex(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

/**
 * Normalize hex to 6-character uppercase format with #
 */
export function normalizeHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex({ ...rgb, alpha: undefined });
}

/**
 * Get contrasting text color (black or white) for a background color
 */
export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';

  // Calculate relative luminance
  const luminance = (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255;

  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * PointsIcon Component
 *
 * A reusable component for displaying points currency icons.
 * DESIGN GUIDELINE: Minimalistic solid LINE icons only.
 *
 * Supports:
 * - Custom uploaded images
 * - Vector icons from the icon library
 *
 * Note: Emoji mode has been deprecated in favor of clean vector icons.
 *
 * Usage:
 *   <PointsIcon
 *     iconType="library"
 *     iconId="star"
 *     iconColor="#F59E0B"
 *     size={24}
 *   />
 */

import { useMemo } from "react";
import { getVectorIcon, getIconDisplay, DEFAULT_ICON_CONFIG } from "../utils/points-icon-library";
import type { CurrencyIconType } from "../services/points-config.server";

// Re-export DEFAULT_ICON_CONFIG for convenience
export { DEFAULT_ICON_CONFIG };

export interface PointsIconProps {
  /** The type of icon to display */
  iconType: CurrencyIconType;
  /** @deprecated Kept for backwards compatibility - will be ignored */
  iconEmoji?: string;
  /** URL for custom uploaded icon */
  iconUrl?: string | null;
  /** ID for library icon (e.g., "star", "gem") */
  iconId?: string | null;
  /** Color for library icons */
  iconColor?: string | null;
  /** Size in pixels (default: 24) */
  size?: number;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Display a points currency icon based on configuration
 */
export function PointsIcon({
  iconType,
  iconEmoji = "", // Deprecated, ignored
  iconUrl,
  iconId,
  iconColor,
  size = 24,
  className = "",
  style = {},
}: PointsIconProps) {
  // Get the display configuration
  const display = useMemo(
    () => getIconDisplay(iconType, iconEmoji, iconUrl, iconId, iconColor),
    [iconType, iconEmoji, iconUrl, iconId, iconColor]
  );

  // Common wrapper styles
  const wrapperStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    flexShrink: 0,
    ...style,
  };

  if (display.type === "image") {
    return (
      <span className={`points-icon points-icon--image ${className}`} style={wrapperStyle}>
        <img
          src={display.value}
          alt="Points icon"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </span>
    );
  }

  // SVG type (default)
  return (
    <span className={`points-icon points-icon--svg ${className}`} style={wrapperStyle}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={display.color || DEFAULT_ICON_CONFIG.iconColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block" }}
      >
        <path d={display.value} />
      </svg>
    </span>
  );
}

/**
 * Helper component for inline points display with value
 * Example: [star icon] 1,250 Points
 */
export interface PointsDisplayProps extends PointsIconProps {
  /** Points value to display */
  value: number;
  /** Currency name (singular) */
  currencyName?: string;
  /** Currency name (plural) */
  currencyNamePlural?: string;
  /** Show currency name after value */
  showLabel?: boolean;
  /** Format number with commas */
  formatNumber?: boolean;
  /** Font weight for value */
  fontWeight?: "normal" | "medium" | "semibold" | "bold";
  /** Text color */
  textColor?: string;
}

export function PointsDisplay({
  value,
  currencyName = "Point",
  currencyNamePlural = "Points",
  showLabel = true,
  formatNumber = true,
  fontWeight = "semibold",
  textColor,
  ...iconProps
}: PointsDisplayProps) {
  // Format the number
  const formattedValue = formatNumber ? value.toLocaleString() : value.toString();

  // Determine label
  const label = value === 1 ? currencyName : currencyNamePlural;

  // Font weight mapping
  const fontWeightMap = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  };

  return (
    <span
      className="points-display"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: textColor,
      }}
    >
      <PointsIcon {...iconProps} />
      <span
        style={{
          fontWeight: fontWeightMap[fontWeight],
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formattedValue}
        {showLabel && ` ${label}`}
      </span>
    </span>
  );
}

export default PointsIcon;

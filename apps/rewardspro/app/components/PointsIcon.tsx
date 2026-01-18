/**
 * PointsIcon Component
 *
 * A reusable component for displaying points currency icons.
 * Supports all three icon types: emoji, custom upload, and icon library.
 *
 * Usage:
 *   <PointsIcon
 *     iconType="library"
 *     iconEmoji="⭐"
 *     iconId="star"
 *     iconColor="#F59E0B"
 *     size={24}
 *   />
 */

import { useMemo } from "react";
import { getVectorIcon, getIconDisplay } from "../utils/points-icon-library";
import type { CurrencyIconType } from "../services/points-config.server";

export interface PointsIconProps {
  /** The type of icon to display */
  iconType: CurrencyIconType;
  /** Fallback emoji (always used for emoji type) */
  iconEmoji: string;
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
  iconEmoji,
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

  switch (display.type) {
    case "image":
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

    case "svg":
      const icon = iconId ? getVectorIcon(iconId) : null;
      if (!icon) {
        // Fallback to emoji if icon not found
        return (
          <span className={`points-icon points-icon--emoji ${className}`} style={wrapperStyle}>
            <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{iconEmoji}</span>
          </span>
        );
      }

      return (
        <span className={`points-icon points-icon--svg ${className}`} style={wrapperStyle}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={display.color || "#5C6AC4"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "block" }}
          >
            <path d={icon.path} />
          </svg>
        </span>
      );

    case "emoji":
    default:
      return (
        <span className={`points-icon points-icon--emoji ${className}`} style={wrapperStyle}>
          <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{display.value}</span>
        </span>
      );
  }
}

/**
 * Helper component for inline points display with value
 * Example: ⭐ 1,250 Points
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

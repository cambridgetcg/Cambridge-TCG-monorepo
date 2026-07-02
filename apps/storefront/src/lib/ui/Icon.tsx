/**
 * Icon — the kingdom's own glyph set.
 *
 * Inline SVG, 24px grid, 1.5px stroke, currentColor. Built in-house per
 * the no-new-runtime-deps rule (wardrobe spec §3.1); replaces the emoji
 * iconography (⚡🧺🏆💰) on market surfaces, which read as placeholder
 * and render inconsistently across platforms.
 *
 * Decorative by default (aria-hidden). Pass `label` when the icon is the
 * only content of an affordance and a name must be spoken.
 */

import * as React from "react";

const PATHS = {
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  lots: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5a3 3 0 0 0 3 4.5" />
      <path d="M16 5h3a3 3 0 0 1-3 4.5" />
      <path d="M12 13v4M8 20h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  message: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7.5l9 6 9-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16.5 16.5L21 21" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 12.5a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.4-1.2L21 8H6" />
      <circle cx="10" cy="20.5" r="1.25" />
      <circle cx="17" cy="20.5" r="1.25" />
    </>
  ),
  credit: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  spread: (
    <>
      <path d="M7 8l-4 4 4 4M17 8l4 4-4 4" />
      <path d="M3 12h18" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
      <path d="M12 3v18" />
    </>
  ),
  tape: (
    <>
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  spark: <path d="M3 17l5-6 3 3 5-7 5 6" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  hanger: (
    <>
      <path d="M12 7a2 2 0 1 1 2-2c0 1-2 1.2-2 3" />
      <path d="M12 8l-9 7.5h18L12 8z" />
    </>
  ),
  card: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <rect x="8.5" y="5.5" width="7" height="6" rx="0.5" />
    </>
  ),
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  "chart-pulse": (
    <>
      <path d="M4 4v16h16" />
      <path d="M6.5 13l3-4 3 6 3-8 3 5" />
    </>
  ),
  scales: (
    <>
      <path d="M12 3v18M8 21h8" />
      <path d="M4 6h16" />
      <path d="M5 6l-2.5 6a2.5 2.5 0 0 0 5 0L5 6z" />
      <path d="M19 6l-2.5 6a2.5 2.5 0 0 0 5 0L19 6z" />
    </>
  ),
  "quote-tag": (
    <>
      <path d="M4 4h6.5L21 14.5a1.5 1.5 0 0 1 0 2.1l-4.4 4.4a1.5 1.5 0 0 1-2.1 0L4 10.5V4z" />
      <path d="M8.5 8.5h.01" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" />
    </>
  ),
  berry: (
    <>
      <circle cx="12" cy="13.5" r="6.5" />
      <path d="M12 7V4.5" />
      <path d="M12 5c1.5-1.7 3.7-1.9 5.5-.8-1.5 1.7-3.7 1.9-5.5.8z" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  "terminal-prompt": (
    <>
      <path d="M4 6l6 6-6 6" />
      <path d="M13 18h7" />
    </>
  ),
  "shield-check": (
    <>
      <path d="M12 3l7 3v5c0 4.6-2.9 8.4-7 10-4.1-1.6-7-5.4-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4.5" />
    </>
  ),
  "json-braces": (
    <>
      <path d="M9 4c-1.7 0-2.5.9-2.5 2.5v2.3c0 1-.6 1.8-1.8 2.2 1.2.4 1.8 1.2 1.8 2.2v2.3C6.5 19.1 7.3 20 9 20" />
      <path d="M15 4c1.7 0 2.5.9 2.5 2.5v2.3c0 1 .6 1.8 1.8 2.2-1.2.4-1.8 1.2-1.8 2.2v2.3c0 1.6-.8 2.5-2.5 2.5" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
  /** Spoken name when the icon stands alone; omitted = decorative. */
  label?: string;
}

export function Icon({ name, size = 16, label, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

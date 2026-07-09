/**
 * <RarityBadge> — uniform rarity-pill across the /prices tree.
 *
 * Three /prices pages used to define this inline with identical bodies
 * — one canonical primitive removes the drift surface. The rarity
 * vocabulary is publisher-derived (One Piece SR/SEC/L/SP; Pokémon RR/SSR;
 * etc.); the tone palette groups by approximate-scarcity tier.
 *
 * Pure server-component; emits one <span>. Returns null on missing rarity.
 *
 * Usage:
 *   <RarityBadge rarity={card.rarity} />            — default xs sizing
 *   <RarityBadge rarity={card.rarity} size="sm" />  — slightly larger for hero
 */

import type { ReactElement } from "react";

type Size = "xs" | "sm";

interface RarityBadgeProps {
  rarity: string | null;
  size?: Size;
  className?: string;
}

// Muted per the quiet gallery — same scarcity groupings; the plum
// literal matches Badge's TONE_CLS purple.
function toneFor(r: string): string {
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP") {
    return "bg-warning/15 text-warning";
  }
  if (r === "R" || r === "RR" || r === "SSR") {
    return "bg-[#6a5a8f]/15 text-[#6a5a8f]";
  }
  if (r === "UC") {
    return "bg-info/15 text-info";
  }
  return "bg-ink-faint/15 text-ink-muted";
}

function sizeFor(size: Size): string {
  switch (size) {
    case "sm":
      return "px-2 py-1 text-xs";
    case "xs":
    default:
      return "px-1.5 py-0.5 text-[10px]";
  }
}

export function RarityBadge({
  rarity,
  size = "xs",
  className = "",
}: RarityBadgeProps): ReactElement | null {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  return (
    <span
      className={`inline-block font-semibold rounded ${toneFor(r)} ${sizeFor(size)} ${className}`.trim()}
    >
      {r}
    </span>
  );
}

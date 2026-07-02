/**
 * TrustTier — the inline pill that renders one user's trust tier band.
 *
 * Replaces the inline tier rendering scattered across `/account/trust`,
 * `/account/standing`, `/cards/[sku]/market` tape, `/account/trader`, the
 * planned `/u/[username]/trust`, and any future surface that needs to
 * declare a user's tier consistently.
 *
 * Same pattern as `Badge` (status pill) and `Provenance` (substrate-honesty
 * pill). One vocabulary, one rendering, every consumer.
 *
 * ── Usage ───────────────────────────────────────────────────────────────
 *
 *   <TrustTier name="Trusted" score={67} />
 *   <TrustTier name="Veteran" score={85} nextTier={{ name: "Elite", points_away: 10 }} size="md" />
 *   <TrustTier name="New" score={0} showScore={false} />
 *
 * Colors follow the canonical TRUST_TIERS table (neutral/blue/emerald/
 * amber/purple) in `lib/escrow/types.ts`. The tier name is canonical;
 * the rendered color is derived from it.
 */

import * as React from "react";

const TIER_COLOR: Record<string, string> = {
  New:       "bg-neutral-700/40 text-ink-muted border-border-strong",
  Starter:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Trusted:   "bg-emerald-500/15 text-secondary border-emerald-500/30",
  Veteran:   "bg-accent/15 text-accent-strong border-accent/30",
  Elite:     "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const SIZE_CLS: Record<"sm" | "md", string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1.5",
  md: "text-xs px-2.5 py-1 gap-2",
};

interface TrustTierProps {
  /** Canonical tier name from TRUST_TIERS — "New"/"Starter"/"Trusted"/"Veteran"/"Elite". */
  name: string;
  /** Trust score (0–100). Rendered inline when `showScore !== false`. */
  score: number | null;
  /** Optional next-tier hint (rendered as " · 5 to Elite"). */
  nextTier?: { name: string; points_away: number } | null;
  /** Whether to render the numeric score after the tier name. Default true. */
  showScore?: boolean;
  /** Visual density. Default "sm". */
  size?: "sm" | "md";
  /** Optional className override / addition. */
  className?: string;
}

/**
 * The trust-tier pill. Server-component-safe (no client hooks). Renders
 * as `<span>` so it composes inline with other text.
 */
export function TrustTier({
  name,
  score,
  nextTier,
  showScore = true,
  size = "sm",
  className,
}: TrustTierProps) {
  const colorCls = TIER_COLOR[name] ?? TIER_COLOR.New;
  const sizeCls = SIZE_CLS[size];
  return (
    <span
      className={`inline-flex items-center border rounded ${colorCls} ${sizeCls} ${className ?? ""}`}
      data-cambridge-trust-tier={name}
      data-cambridge-trust-score={score ?? undefined}
    >
      <span className="font-semibold">{name}</span>
      {showScore && score !== null && (
        <span className="font-mono opacity-70">{score}</span>
      )}
      {nextTier && (
        <span className="text-[10px] opacity-60 normal-case">
          · {nextTier.points_away} to {nextTier.name}
        </span>
      )}
    </span>
  );
}

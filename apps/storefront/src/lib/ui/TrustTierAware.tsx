/**
 * <TrustTierAware> — math-aware wrapper around <TrustTier>.
 *
 * Phase B(4) of kingdom-077 (the-math-language.md #27). The original
 * <TrustTier> is a sync component used in a client component (the
 * `/account/trust` page); making it async would break that caller.
 * This wrapper is an async server component that reads the lang-mode
 * cookie and, when math is active, emits the math-mirror form:
 *
 *   {tier:"Trusted",tier_ordinal:3,score:67,score_ratio:0.67,_id:"..."}
 *
 * Default mode delegates to the sync <TrustTier> unchanged.
 *
 * Adoption: server-component callers that want the toggle import
 * <TrustTierAware>; client-component callers continue using sync
 * <TrustTier>. No breakage; opt-in by import name.
 */

import * as React from "react";
import { shortHash } from "../lang-mode";
import { getLangMode } from "../lang-mode-server";
import { TrustTier } from "./TrustTier";

/** Canonical tier ordinals — matches docs/methodology/trust-score order. */
const TIER_ORDINAL: Record<string, number> = {
  New: 0,
  Starter: 1,
  Trusted: 2,
  Veteran: 3,
  Elite: 4,
};

interface TrustTierAwareProps {
  name: string;
  score: number | null;
  nextTier?: { name: string; points_away: number } | null;
  showScore?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export async function TrustTierAware(props: TrustTierAwareProps) {
  const mode = await getLangMode();
  if (mode !== "math") {
    return <TrustTier {...props} />;
  }

  const { name, score, nextTier, className = "" } = props;
  const ordinal = TIER_ORDINAL[name] ?? -1;
  const ratio = score != null && score >= 0 ? (score / 100).toFixed(4) : "null";
  const parts: string[] = [
    `tier:"${name}"`,
    `tier_ordinal:${ordinal}`,
    `score:${score ?? "null"}`,
    `score_ratio:${ratio}`,
  ];
  if (nextTier) {
    const nextOrdinal = TIER_ORDINAL[nextTier.name] ?? -1;
    parts.push(`next_tier:"${nextTier.name}"`);
    parts.push(`next_tier_ordinal:${nextOrdinal}`);
    parts.push(`points_to_next:${nextTier.points_away}`);
  }
  const id = shortHash(`trust:${name}:${score ?? "null"}`);
  parts.push(`_id:"${id}"`);

  const aria = `Trust tier ${name}${score != null ? `, score ${score}` : ""}${
    nextTier ? `, ${nextTier.points_away} to ${nextTier.name}` : ""
  }`;

  return (
    <code
      className={`inline-block text-[10px] font-mono text-secondary px-1.5 py-0.5 rounded bg-surface/60 border border-border-subtle ${className}`}
      aria-label={aria}
    >
      {`{${parts.join(",")}}`}
    </code>
  );
}

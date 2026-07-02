/**
 * Card — the bg-surface rounded-xl shell that wraps almost every
 * piece of content on /account/* and /market.
 *
 * Three visual variants reflect the existing usage:
 *   default  — bg-surface border border-border-subtle (the standard card)
 *   elevated — same but with a soft amber glow border (used for primary CTA)
 *   subtle   — bg-surface/50 border-border-subtle/60 (lower visual weight)
 */

import * as React from "react";

type Variant = "default" | "elevated" | "subtle" | "mat";
type Padding = "none" | "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  default:  "bg-surface border border-border-subtle",
  elevated: "bg-surface border border-accent/30 shadow-lg shadow-amber-500/5",
  subtle:   "bg-surface/50 border border-border-subtle/60",
  mat:      "wardrobe-mat",
};

const PAD_CLS: Record<Padding, string> = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-6",
};

interface CardProps {
  variant?: Variant;
  padding?: Padding;
  className?: string;
  children: React.ReactNode;
}

export function Card({ variant = "default", padding = "md", className = "", children }: CardProps) {
  return (
    <div className={`rounded-xl ${VARIANT_CLS[variant]} ${PAD_CLS[padding]} ${className}`.trim()}>
      {children}
    </div>
  );
}

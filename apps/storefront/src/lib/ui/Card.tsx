/**
 * Card — the bg-neutral-900 rounded-xl shell that wraps almost every
 * piece of content on /account/* and /market.
 *
 * Three visual variants reflect the existing usage:
 *   default  — bg-neutral-900 border border-neutral-800 (the standard card)
 *   elevated — same but with a soft amber glow border (used for primary CTA)
 *   subtle   — bg-neutral-900/50 border-neutral-800/60 (lower visual weight)
 */

import * as React from "react";

type Variant = "default" | "elevated" | "subtle";
type Padding = "none" | "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  default:  "bg-neutral-900 border border-neutral-800",
  elevated: "bg-neutral-900 border border-amber-500/30 shadow-lg shadow-amber-500/5",
  subtle:   "bg-neutral-900/50 border border-neutral-800/60",
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

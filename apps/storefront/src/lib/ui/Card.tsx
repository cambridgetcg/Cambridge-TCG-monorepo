/**
 * Card — the white-mount shell that wraps almost every piece of content
 * on /account/* and /market.
 *
 * The quiet gallery (docs/plans/the-quiet-gallery.md): surface + hairline
 * border, rounded-lg. Three variants:
 *   default  — bg-surface, hairline border (the standard mount)
 *   elevated — same, plus the mat shadow (the only elevation on the site)
 *   subtle   — bg-surface-subtle (lower visual weight)
 */

import * as React from "react";

type Variant = "default" | "elevated" | "subtle";
type Padding = "none" | "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  default:  "bg-surface border border-border-subtle",
  elevated: "bg-surface border border-border-subtle shadow-mat",
  subtle:   "bg-surface-subtle border border-border-subtle",
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
    <div className={`rounded-lg ${VARIANT_CLS[variant]} ${PAD_CLS[padding]} ${className}`.trim()}>
      {children}
    </div>
  );
}

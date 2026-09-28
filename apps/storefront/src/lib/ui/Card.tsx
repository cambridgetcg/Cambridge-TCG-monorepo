/**
 * Card — a simple surface for a related group of content.
 * Variants change surface and border emphasis without decorative shadows.
 */

import * as React from "react";

type Variant = "default" | "elevated" | "subtle";
type Padding = "none" | "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  default:  "bg-surface border border-border-subtle",
  elevated: "bg-surface-elevated border border-border-strong",
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

/**
 * Button — the canonical primary/secondary/ghost/danger button.
 *
 * Storefront accent is amber; secondary is neutral-800; danger is red. The
 * variants here standardise the half-dozen inline button styles that
 * landed across /account/* and the trade-in flow.
 */

import * as React from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  primary:   "bg-amber-500 text-black font-bold hover:bg-amber-400",
  secondary: "bg-neutral-800 text-white font-medium hover:bg-neutral-700 border border-neutral-800",
  ghost:     "text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800",
  danger:    "bg-red-500 text-white font-bold hover:bg-red-400",
};

const SIZE_CLS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-lg",
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

interface ButtonProps extends BaseProps {
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

interface LinkButtonProps extends BaseProps {
  href: string;
  /** External links open in a new tab with rel="noopener noreferrer". */
  external?: boolean;
}

const baseCls = "inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
  onClick,
  children,
}: ButtonProps) {
  const cls = `${baseCls} ${SIZE_CLS[size]} ${VARIANT_CLS[variant]} ${className}`.trim();
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  href,
  external,
  children,
}: LinkButtonProps) {
  const cls = `${baseCls} ${SIZE_CLS[size]} ${VARIANT_CLS[variant]} ${className}`.trim();
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

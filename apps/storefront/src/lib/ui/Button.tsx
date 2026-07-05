/**
 * Button — the canonical primary/secondary/ghost/danger button.
 *
 * The quiet gallery (docs/plans/the-quiet-gallery.md): primary is solid
 * ink — the single strongest thing on a page; secondary is a hairline
 * border + ink text; ghost is bare ink-muted text; danger is solid
 * danger. The old amber-on-black primary died with the old theme.
 */

import * as React from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  primary:   "bg-ink text-page font-semibold hover:bg-ink/85 border border-transparent",
  secondary: "bg-surface text-ink font-medium hover:bg-surface-subtle border border-border-subtle",
  ghost:     "text-ink-muted hover:text-ink hover:bg-surface-subtle border border-transparent",
  danger:    "bg-danger text-page font-semibold hover:bg-danger/85 border border-transparent",
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

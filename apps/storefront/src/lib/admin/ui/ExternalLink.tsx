import * as React from "react";

/**
 * ExternalLink — the canonical "Open in legacy admin ↗" CTA.
 *
 * Two variants:
 *   primary — used at the page header (right side of <PageHeader action={...} />)
 *   inline  — used inside tables and section headers ("Manage ↗")
 *
 * Always opens in a new tab with rel="noopener noreferrer".
 */

interface ExternalLinkProps {
  href: string;
  /** Display label without the arrow. */
  children: React.ReactNode;
  variant?: "primary" | "inline";
}

export function ExternalLink({ href, children, variant = "inline" }: ExternalLinkProps) {
  if (variant === "primary") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 text-sm bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition"
      >
        {children} ↗
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-400 hover:text-blue-300 transition whitespace-nowrap"
    >
      {children} ↗
    </a>
  );
}

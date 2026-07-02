/**
 * PageHeader — every consumer page starts with one.
 *
 * Layout: title + description on the left, optional action (button or link)
 * on the right. Substrate-honesty slot: pass <Provenance> via the
 * `provenance` prop to sit next to the title — the canonical home for the
 * page-level source/freshness claim. See docs/principles/substrate-honesty.md.
 */

import * as React from "react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Right-side slot — typically a Button or LinkButton. */
  action?: React.ReactNode;
  /** Substrate-honesty pill. Pass a <Provenance> element. */
  provenance?: React.ReactNode;
  /** Machine-readable twin of this page. Renders a { } JSON link by the title. */
  jsonHref?: string;
}

export function PageHeader({ title, description, action, provenance, jsonHref }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          {/* Semantic tokens + display voice (wardrobe spec §3.4): identical
              under terminal defaults, theme-aware in [data-theme] subtrees. */}
          <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          {provenance}
          {jsonHref && (
            <Link
              href={jsonHref}
              className="font-mono text-[11px] rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-ink-muted hover:text-ink transition sm:ml-auto"
              aria-label="Open this page as JSON"
            >
              {"{ } JSON"}
            </Link>
          )}
        </div>
        {description && (
          <p className="text-sm text-ink-muted mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

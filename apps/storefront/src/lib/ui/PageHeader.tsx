/**
 * PageHeader — every consumer page starts with one.
 *
 * Layout: title + description on the left, optional action (button or link)
 * on the right. Substrate-honesty slot: pass <Provenance> via the
 * `provenance` prop to sit next to the title — the canonical home for the
 * page-level source/freshness claim. See docs/principles/substrate-honesty.md.
 */

import * as React from "react";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Right-side slot — typically a Button or LinkButton. */
  action?: React.ReactNode;
  /** Substrate-honesty pill. Pass a <Provenance> element. */
  provenance?: React.ReactNode;
}

export function PageHeader({ title, description, action, provenance }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {provenance}
        </div>
        {description && (
          <p className="text-sm text-neutral-400 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

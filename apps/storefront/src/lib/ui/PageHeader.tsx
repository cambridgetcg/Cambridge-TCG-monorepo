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
  /** Larger title and description for tool pages; other pages keep the default. */
  size?: "default" | "large";
  /** Right-side slot — typically a Button or LinkButton. */
  action?: React.ReactNode;
  /** Substrate-honesty pill. Pass a <Provenance> element. */
  provenance?: React.ReactNode;
}

export function PageHeader({ title, description, size = "default", action, provenance }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className={`font-display ${size === "large" ? "text-3xl leading-9" : "text-2xl"} font-semibold text-ink`}>{title}</h1>
          {provenance}
        </div>
        {description && (
          <p className={`max-w-prose text-base text-ink-muted leading-7 ${size === "large" ? "mt-3" : "mt-2"}`}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

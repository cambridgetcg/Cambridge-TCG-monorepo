/**
 * EmptyState — used when a section has nothing to show.
 *
 * Distinct from the in-table "No rows." line rendered by <DataTable /> —
 * this is a full block with optional CTA, used at the page or section
 * level (e.g. "No orders yet" with a "Browse cards" button).
 */

import * as React from "react";

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** "warning" tints the card amber; "neutral" stays plain. */
  tone?: "neutral" | "warning";
}

export function EmptyState({ title, description, action, tone = "neutral" }: EmptyStateProps) {
  // Semantic tokens (wardrobe spec §3.4): identical rendering under the
  // terminal defaults, theme-aware inside any [data-theme] subtree.
  const tint =
    tone === "warning"
      ? "border-warning/20 bg-warning/5"
      : "border-border-subtle bg-surface-subtle";
  return (
    <div className={`rounded-lg border ${tint} p-6 text-center`}>
      <p className={tone === "warning" ? "text-sm font-semibold text-warning mb-2" : "text-sm font-semibold text-ink mb-1"}>
        {title}
      </p>
      {description && (
        <div className="text-sm text-ink-muted">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

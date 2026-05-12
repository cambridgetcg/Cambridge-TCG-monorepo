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
  const tint =
    tone === "warning"
      ? "border-amber-500/20 bg-amber-500/5"
      : "border-neutral-800 bg-neutral-900/50";
  return (
    <div className={`rounded-xl border ${tint} p-6 text-center`}>
      <p className={tone === "warning" ? "text-sm font-bold text-amber-400 mb-2" : "text-sm font-semibold text-white mb-1"}>
        {title}
      </p>
      {description && (
        <div className="text-sm text-neutral-400">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

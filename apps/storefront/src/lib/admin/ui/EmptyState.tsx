import * as React from "react";

/**
 * EmptyState — used when a section has nothing to show.
 *
 * Distinct from the in-table "No rows." text rendered by <DataTable /> —
 * this is a full block with optional CTA, used at the page or section level
 * (e.g. "Market not yet active" on /commerce/market when the table is missing).
 */
export function EmptyState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** "warning" tints the card amber; "neutral" stays plain. */
  tone?: "neutral" | "warning";
}) {
  const tint =
    tone === "warning"
      ? "border-accent/20 bg-accent/5"
      : "border-border-subtle bg-surface/50";
  return (
    <div className={`rounded-xl border ${tint} p-6`}>
      <p className={tone === "warning" ? "text-sm font-bold text-accent-strong mb-2" : "text-sm font-semibold text-ink mb-1"}>
        {title}
      </p>
      {description && (
        <div className="text-sm text-ink-muted">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

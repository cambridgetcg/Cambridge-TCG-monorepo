import * as React from "react";

/**
 * ActionBanner — call-to-action box highlighting urgent work on a page.
 *
 * Used at the top of Dashboard pages when one or more queues need attention
 * (e.g. "Disputed trades require intervention"). Always pairs with a list
 * underneath — the banner just sets the framing.
 */
export function ActionBanner({
  tone = "warning",
  title,
  children,
}: {
  tone?: "warning" | "critical" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const tint = {
    warning:  "border-accent/20 bg-accent/5",
    critical: "border-danger/20 bg-danger/5",
    info:     "border-blue-500/20 bg-blue-500/5",
  }[tone];
  const titleColor = {
    warning:  "text-accent-strong",
    critical: "text-red-400",
    info:     "text-blue-400",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${tint}`}>
      <p className={`text-sm font-bold mb-1 ${titleColor}`}>{title}</p>
      {children && <div className="text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

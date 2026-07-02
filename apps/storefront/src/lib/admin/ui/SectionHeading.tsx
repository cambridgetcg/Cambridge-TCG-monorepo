import * as React from "react";

/**
 * Subtle section heading used between rows of a Dashboard page.
 * Matches the style used across overview/, market/, etc.
 */
export function SectionHeading({
  children,
  count,
  trailing,
}: {
  children: React.ReactNode;
  /** Optional count appended in muted style: "Live Now (3)". */
  count?: number;
  /** Right-side slot, e.g. a "see all" link. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3 mt-8 first:mt-0 gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        {children}
        {typeof count === "number" && (
          <span className="ml-2 text-neutral-600 font-normal normal-case tracking-normal">
            ({count})
          </span>
        )}
      </h2>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

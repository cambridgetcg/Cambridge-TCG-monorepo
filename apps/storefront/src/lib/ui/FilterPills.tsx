/**
 * FilterPills — a row of "All / open / shipped / completed" filter pills.
 *
 * Selected pill sits on the accent wash (the quiet gallery — docs/plans/
 * the-quiet-gallery.md). Clicking a pill navigates via Link — the URL
 * carries the filter intent. Pages drive this with a buildHref helper
 * that preserves other search params.
 */

import * as React from "react";
import Link from "next/link";

export interface FilterPill {
  label: React.ReactNode;
  /** Value compared with `selected`. Empty string = the "All" pill. */
  value: string;
  /** Optional count badge — "All (123)". */
  count?: number | string;
  href: string;
}

interface FilterPillsProps {
  pills: FilterPill[];
  /** Currently selected value — empty/undefined matches the "All" pill. */
  selected?: string;
}

export function FilterPills({ pills, selected = "" }: FilterPillsProps) {
  return (
    <nav className="flex flex-wrap gap-2 text-xs">
      {pills.map((p) => {
        const active = selected === p.value;
        return (
          <Link
            key={p.value || "_all"}
            href={p.href}
            className={[
              "px-3 py-1.5 rounded-full transition border",
              active
                ? "bg-accent-wash text-accent-strong font-medium border-accent/30"
                : "bg-surface text-ink-muted hover:text-ink border-border-subtle",
            ].join(" ")}
          >
            {p.label}
            {p.count != null && <span className="ml-1.5 opacity-70">({p.count})</span>}
          </Link>
        );
      })}
    </nav>
  );
}

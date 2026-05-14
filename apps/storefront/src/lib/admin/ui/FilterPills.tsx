import * as React from "react";
import Link from "next/link";

/**
 * FilterPills — a row of "All / pending / shipped / completed" filter pills.
 *
 * Selected pill is highlighted blue. Clicking a pill is a navigation,
 * not a state change — links carry the URL intent.
 *
 * Subsumes the duplicated filter-pill nav in catalog/users and ops/orders.
 */

export interface FilterPill {
  label: React.ReactNode;
  /** Value compared with `selected` — null/empty = the "All" pill. */
  value: string;
  /** Optional count badge — "All (123)". */
  count?: number | string;
  href: string;
}

interface FilterPillsProps {
  pills: FilterPill[];
  /** Currently selected value — empty/undefined matches the "All" pill (value=""). */
  selected?: string;
}

export function FilterPills({ pills, selected = "" }: FilterPillsProps) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {pills.map((p) => {
        const active = selected === p.value;
        return (
          <Link
            key={p.value || "_all"}
            href={p.href}
            className={[
              "px-3 py-1 rounded-full border transition-colors",
              active
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700",
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

/**
 * Tabs — the segmented control used by /account/{trades,offers,returns}
 * to switch between "incoming" / "outgoing" or "open" / "history".
 *
 * Two flavours:
 *   <Tabs>           — controlled (state lives in parent)
 *   <Tabs href="…">  — link-driven (URL carries the active tab)
 *
 * Both share the same visual surface: accent-wash pill with a hairline
 * border on a subtle track (the quiet gallery — docs/plans/
 * the-quiet-gallery.md). The old amber-on-black pill died with the old
 * theme.
 */

import * as React from "react";
import Link from "next/link";

export interface Tab<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Optional right-aligned counter — "(3)". */
  count?: number | string;
}

interface ControlledProps<T extends string> {
  tabs: ReadonlyArray<Tab<T>>;
  selected: T;
  onSelect: (value: T) => void;
}

interface LinkedProps<T extends string> {
  tabs: ReadonlyArray<Tab<T> & { href: string }>;
  selected: T;
}

const tabBase = "px-4 py-2 text-sm font-medium rounded-md transition border";
const tabActive = "bg-accent-wash text-accent-strong border-accent/30";
const tabIdle = "border-transparent text-ink-muted hover:text-ink";
const wrapper = "flex gap-1 bg-surface-subtle rounded-lg p-1 mb-6 w-fit";

export function Tabs<T extends string>({ tabs, selected, onSelect }: ControlledProps<T>) {
  return (
    <div className={wrapper}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onSelect(t.value)}
          className={`${tabBase} ${selected === t.value ? tabActive : tabIdle}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 opacity-80">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function LinkedTabs<T extends string>({ tabs, selected }: LinkedProps<T>) {
  return (
    <div className={wrapper}>
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          className={`${tabBase} ${selected === t.value ? tabActive : tabIdle}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 opacity-80">({t.count})</span>}
        </Link>
      ))}
    </div>
  );
}

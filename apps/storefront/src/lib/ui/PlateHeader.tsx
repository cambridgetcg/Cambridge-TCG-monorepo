/**
 * PlateHeader — a section heading with optional context, number and action.
 *
 * No hooks — safe in server and client trees alike. Sibling of
 * PageHeader (which keeps the page-level Provenance slot); PlateHeader
 * is for section shelves and identity plates.
 */

import * as React from "react";
import { InkRule } from "./InkRule";

interface PlateHeaderProps {
  /** Short context above the title. */
  kicker?: string;
  title: string;
  /** Optional section number. */
  plate?: number;
  /** Show a divider below the heading. */
  rule?: boolean;
  /** Right-side slot — a link or button. */
  action?: React.ReactNode;
  className?: string;
}

export function PlateHeader({ kicker, title, plate, rule = false, action, className = "" }: PlateHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker && (
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.16em] text-ink-muted">
              {kicker}
            </p>
          )}
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {action}
          {plate != null && (
            <span className="font-mono text-xs text-ink-muted tabular-nums whitespace-nowrap">
              Section {String(plate).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>
      {rule && <InkRule className="mt-3" />}
    </div>
  );
}

/**
 * ErrorAlert — used for failed required reads and recoverable error states.
 *
 * Two surfaces:
 *   - Page-level (passed as fallback to error.tsx) — the whole route failed.
 *   - Inline (rendered conditionally) — a section or action errored but the
 *     page is otherwise fine.
 *
 * For optional reads we show "—" inline (see lib/format helpers); reach
 * for ErrorAlert when the user needs to know something didn't work.
 */

import * as React from "react";

interface ErrorAlertProps {
  title?: string;
  description?: React.ReactNode;
  /** Optional retry action — typically a <Button>. */
  action?: React.ReactNode;
}

export function ErrorAlert({ title = "Could not load", description, action }: ErrorAlertProps) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-red-400 text-lg leading-none mt-0.5">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-400">{title}</p>
          {description && (
            <div className="text-sm text-neutral-300 mt-1">{description}</div>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

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
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-danger">{title}</p>
          {description && (
            <div className="text-sm text-ink-muted mt-1">{description}</div>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

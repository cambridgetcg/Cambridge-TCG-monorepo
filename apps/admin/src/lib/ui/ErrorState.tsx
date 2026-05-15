import * as React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * ErrorState — used for failed required reads at the page or section level.
 *
 * For optional reads we show "—" inline (see queries.ts UNAVAILABLE).
 * Reach for ErrorState only when the page can't render meaningfully without
 * the failed data.
 */
export function ErrorState({
  title = "Could not load data",
  description,
}: {
  title?: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-400 mb-1">{title}</p>
          {description && (
            <div className="text-sm text-neutral-300">{description}</div>
          )}
        </div>
      </div>
    </div>
  );
}

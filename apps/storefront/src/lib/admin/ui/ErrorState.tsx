import * as React from "react";

/** Inline AlertTriangle icon — avoids lucide-react dependency in storefront. */
function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

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

/**
 * LoadingSkeleton — shaped placeholder for in-flight content.
 *
 * Storefront convention: prefer skeletons over spinners on list/detail
 * pages — the user sees the layout settling, not an indeterminate wheel.
 * Used in route-level loading.tsx files plus inline where data fetches
 * gate a section.
 */

import * as React from "react";

interface SkeletonProps {
  /** Tailwind width/height classes — e.g. "h-4 w-32". */
  className?: string;
  /** Number of stacked rows. */
  rows?: number;
  /** Adds a subtle shimmer animation. */
  pulse?: boolean;
}

export function Skeleton({ className = "h-4 w-full", rows = 1, pulse = true }: SkeletonProps) {
  const blockCls = `bg-neutral-800/60 rounded ${pulse ? "animate-pulse" : ""} ${className}`;
  if (rows <= 1) return <div className={blockCls} />;
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={blockCls} />
      ))}
    </div>
  );
}

/** A list-page skeleton — heading bar plus a stack of card-sized rows. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-neutral-900 rounded-xl p-4 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A detail-page skeleton — title, sub-title, body block. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="bg-neutral-900 rounded-xl p-6 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

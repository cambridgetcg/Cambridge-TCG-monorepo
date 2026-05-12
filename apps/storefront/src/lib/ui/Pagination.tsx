/**
 * Pagination — route-agnostic prev/next + summary.
 *
 * Replaces the /catalog-hardcoded Pagination at
 * components/catalog/Pagination.tsx. Pages pass an `href(page)` factory so
 * the same component drives /catalog, /market, /account/* lists, etc.
 *
 * Returns null when there's only one page.
 */

import * as React from "react";
import Link from "next/link";

interface PaginationProps {
  /** 1-based page index. */
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  /** Build href for a given page (1-based). */
  href: (page: number) => string;
}

export function Pagination({ page, totalPages, totalRows, pageSize, href }: PaginationProps) {
  if (totalPages <= 1) return null;
  const offset = (page - 1) * pageSize;
  const from = totalRows === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, totalRows);

  const linkBase = "px-3 py-1.5 rounded-md text-sm font-medium transition";
  const active = "bg-neutral-800 text-white border border-neutral-700";
  const inactive = "bg-neutral-900 text-neutral-300 border border-neutral-800 hover:border-neutral-700";
  const disabled = "px-3 py-1.5 border border-neutral-900 text-neutral-700 rounded-md text-sm cursor-not-allowed";

  return (
    <div className="flex items-center justify-between text-sm mt-6 flex-wrap gap-3">
      <span className="text-neutral-500 tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {totalRows.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${linkBase} ${inactive}`}>
            ← Prev
          </Link>
        ) : (
          <span className={disabled}>← Prev</span>
        )}
        <span className={`${linkBase} ${active} tabular-nums`}>
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={href(page + 1)} className={`${linkBase} ${inactive}`}>
            Next →
          </Link>
        ) : (
          <span className={disabled}>Next →</span>
        )}
      </div>
    </div>
  );
}

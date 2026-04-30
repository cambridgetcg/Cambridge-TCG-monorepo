import * as React from "react";
import Link from "next/link";

/**
 * Pagination — server-rendered pagination using a `?page=` URL param.
 *
 * The page builds an href factory that preserves the rest of the search
 * params; this component just drives the prev/next links + summary.
 *
 * Subsumes the duplicated pagination blocks in catalog/users and ops/orders.
 * Returns null when there's only one page.
 */

interface PaginationProps {
  /** 1-based page index. */
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  /** Build href for a given page. Receives 1-based page number. */
  href: (page: number) => string;
}

export function Pagination({ page, totalPages, totalRows, pageSize, href }: PaginationProps) {
  if (totalPages <= 1) return null;
  const offset = (page - 1) * pageSize;
  const from = totalRows === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, totalRows);

  return (
    <div className="flex items-center justify-between text-sm mt-4">
      <span className="text-neutral-500">
        {from.toLocaleString()}–{to.toLocaleString()} of {totalRows.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded transition"
          >
            ← Prev
          </Link>
        ) : (
          <span className="px-3 py-1 border border-neutral-900 text-neutral-700 rounded cursor-not-allowed">
            ← Prev
          </span>
        )}
        <span className="px-3 py-1 text-neutral-400 tabular-nums">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded transition"
          >
            Next →
          </Link>
        ) : (
          <span className="px-3 py-1 border border-neutral-900 text-neutral-700 rounded cursor-not-allowed">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}

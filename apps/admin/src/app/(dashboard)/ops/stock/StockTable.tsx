"use client";

/**
 * StockTable — client-side search + pagination controls.
 *
 * Serialises filter state into URL search params so that:
 *   - Deep links work (share a filtered view)
 *   - The Server Component re-fetches on change (Next.js RSC navigation)
 *   - Browser back/forward work naturally
 *
 * The Server Component reads these params and passes them to data fetchers.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback } from "react";

// ─── Search box ───────────────────────────────────────────────────────────────

interface SearchBoxProps {
  /** Current value from URL params */
  value: string;
  placeholder?: string;
  /** URL param name to write to */
  paramName?: string;
}

export function SearchBox({
  value,
  placeholder = "Search…",
  paramName = "q",
}: SearchBoxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = new URLSearchParams(params.toString());
      if (e.target.value) {
        next.set(paramName, e.target.value);
      } else {
        next.delete(paramName);
      }
      // Reset page to 0 when search changes
      next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [router, pathname, params, paramName]
  );

  return (
    <div className="relative">
      <input
        type="search"
        defaultValue={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={[
          "w-full rounded-md border border-neutral-700 bg-neutral-900",
          "px-3 py-2 text-sm text-white placeholder:text-neutral-500",
          "focus:outline-none focus:ring-1 focus:ring-blue-500",
          "transition-opacity",
          isPending ? "opacity-60" : "opacity-100",
        ].join(" ")}
      />
      {isPending && (
        <span className="absolute right-2.5 top-2.5 text-neutral-500 text-xs">
          loading…
        </span>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
}

export function Pagination({
  page,
  totalPages,
  totalRows,
  pageSize,
}: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navigate = useCallback(
    (newPage: number) => {
      const next = new URLSearchParams(params.toString());
      if (newPage === 0) {
        next.delete("page");
      } else {
        next.set("page", String(newPage));
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, params]
  );

  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between mt-3 text-sm text-neutral-400">
      <span>
        {from}–{to} of {totalRows.toLocaleString()} rows
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(page - 1)}
          disabled={page === 0}
          className="px-2.5 py-1 rounded border border-neutral-700 hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <span className="text-neutral-500 text-xs">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-2.5 py-1 rounded border border-neutral-700 hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

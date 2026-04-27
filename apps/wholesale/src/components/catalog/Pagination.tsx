"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCatalogFilter } from "./CatalogFilterContext";

export default function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startFilter } = useCatalogFilter();

  if (totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    startFilter(() => router.push(`/catalog?${params.toString()}`));
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-sm text-gray-500">
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-1.5 text-sm hover:bg-[#1e1e2e] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-1.5 text-sm hover:bg-[#1e1e2e] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function StockFilters({
  sets,
  currentQuery,
  currentSet,
  currentSort,
  currentOrder,
  stockedOnly,
  ebayOnly,
}: {
  sets: { code: string; name: string }[];
  currentQuery: string;
  currentSet: string;
  currentSort: string;
  currentOrder: string;
  stockedOnly: boolean;
  ebayOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);

  useEffect(() => { setQuery(currentQuery); }, [currentQuery]);

  function pushParams(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`/admin/stock-levels?${params.toString()}`);
  }

  function submitSearch() {
    pushParams({ q: query });
  }

  return (
    <>
      <div className="flex w-full sm:w-auto">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
          placeholder="Search by name, card number, or SKU..."
          className="rounded-l bg-[#12121a] border border-[#1e1e2e] border-r-0 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none w-full sm:w-72"
        />
        <button
          onClick={submitSearch}
          className="rounded-r bg-brand-600 px-3 py-2 text-sm font-medium hover:bg-brand-700 transition"
        >
          Search
        </button>
      </div>
      <select
        value={currentSet}
        onChange={(e) => pushParams({ set: e.target.value })}
        className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      >
        <option value="">All Sets</option>
        {sets.map((s) => (
          <option key={s.code} value={s.code}>
            {s.code} — {s.name}
          </option>
        ))}
      </select>
      <select
        value={`${currentSort}-${currentOrder}`}
        onChange={(e) => {
          const [sort, order] = e.target.value.split("-");
          pushParams({ sort: sort === "cardNumber" ? "" : sort, order: order === "asc" ? "" : order });
        }}
        className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      >
        <option value="cardNumber-asc">Card # (A→Z)</option>
        <option value="cardNumber-desc">Card # (Z→A)</option>
        <option value="stock-desc">Stock: High → Low</option>
        <option value="stock-asc">Stock: Low → High</option>
        <option value="set-asc">Set (A→Z)</option>
        <option value="set-desc">Set (Z→A)</option>
        <option value="name-asc">Name (A→Z)</option>
        <option value="name-desc">Name (Z→A)</option>
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={stockedOnly}
          onChange={(e) => pushParams({ stocked: e.target.checked ? "1" : "" })}
          className="accent-brand-500"
        />
        In stock only
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={ebayOnly}
          onChange={(e) => pushParams({ ebay: e.target.checked ? "1" : "" })}
          className="accent-brand-500"
        />
        eBay eligible (£3–£30)
      </label>
    </>
  );
}

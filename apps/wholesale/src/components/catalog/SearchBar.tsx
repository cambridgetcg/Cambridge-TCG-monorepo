"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCatalogFilter } from "./CatalogFilterContext";

export default function SearchBar({
  sets,
  currentQuery,
  currentSet,
  currentSort,
  currentOrder,
  currentPriceMin,
  currentPriceMax,
  currentCategory = "singles",
}: {
  sets: { code: string; name: string }[];
  currentQuery: string;
  currentSet: string;
  currentSort: string;
  currentOrder: string;
  currentPriceMin: string;
  currentPriceMax: string;
  currentCategory?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startFilter } = useCatalogFilter();
  const [query, setQuery] = useState(currentQuery);
  const [priceMin, setPriceMin] = useState(currentPriceMin);
  const [priceMax, setPriceMax] = useState(currentPriceMax);

  useEffect(() => { setQuery(currentQuery); }, [currentQuery]);
  useEffect(() => { setPriceMin(currentPriceMin); }, [currentPriceMin]);
  useEffect(() => { setPriceMax(currentPriceMax); }, [currentPriceMax]);

  function pushParams(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // reset to page 1 on filter change
    startFilter(() => router.push(`/catalog?${params.toString()}`));
  }

  function submitSearch() {
    pushParams({ q: query });
  }

  function handleSetChange(value: string) {
    pushParams({ set: value });
  }

  function handlePriceChange(min: string, max: string) {
    setPriceMin(min);
    setPriceMax(max);
    pushParams({ priceMin: min, priceMax: max });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
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
        onChange={(e) => handleSetChange(e.target.value)}
        className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      >
        <option value="">All Sets</option>
        {sets.map((s) => (
          <option key={s.code} value={s.code}>
            {s.code} — {s.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">{"\u00a3"}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={priceMin}
          onChange={(e) => handlePriceChange(e.target.value, priceMax)}
          placeholder="Min"
          className="w-20 rounded bg-[#12121a] border border-[#1e1e2e] px-2 py-2 text-sm text-center focus:border-brand-500 focus:outline-none"
        />
        <span className="text-xs text-gray-500">–</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={priceMax}
          onChange={(e) => handlePriceChange(priceMin, e.target.value)}
          placeholder="Max"
          className="w-20 rounded bg-[#12121a] border border-[#1e1e2e] px-2 py-2 text-sm text-center focus:border-brand-500 focus:outline-none"
        />
      </div>
      <select
        value={`${currentSort}-${currentOrder}`}
        onChange={(e) => {
          const [sort, order] = e.target.value.split("-");
          pushParams({ sort: sort === "cardNumber" ? "" : sort, order: order === "asc" ? "" : order });
        }}
        className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      >
        {currentCategory === "sealed" ? (
          <>
            <option value="name-asc">Name (A→Z)</option>
            <option value="name-desc">Name (Z→A)</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="newest-desc">Newest First</option>
          </>
        ) : (
          <>
            <option value="cardNumber-asc">Card # (A→Z)</option>
            <option value="cardNumber-desc">Card # (Z→A)</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="set-asc">Set (A→Z)</option>
            <option value="set-desc">Set (Z→A)</option>
            <option value="newest-desc">Newest First</option>
          </>
        )}
      </select>
    </div>
  );
}

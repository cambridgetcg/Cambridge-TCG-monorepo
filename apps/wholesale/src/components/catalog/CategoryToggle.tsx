"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCatalogFilter } from "./CatalogFilterContext";

interface CategoryToggleProps {
  currentCategory: string;
}

export default function CategoryToggle({ currentCategory }: CategoryToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startFilter } = useCatalogFilter();

  function selectCategory(cat: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat === "singles") params.delete("category");
    else params.set("category", cat);
    params.delete("page");
    startFilter(() => router.push(`/catalog?${params.toString()}`));
  }

  const categories = [
    { value: "singles", label: "Singles" },
    { value: "sealed", label: "Sealed Products" },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-[#12121a] border border-[#1e1e2e] p-1">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => selectCategory(cat.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            currentCategory === cat.value
              ? "bg-brand-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

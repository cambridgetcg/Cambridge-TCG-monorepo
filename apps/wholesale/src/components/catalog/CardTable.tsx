"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart, type CardData } from "@/lib/cart-context";

import { useCatalogFilter } from "./CatalogFilterContext";
import WatermarkedImage from "./WatermarkedImage";

interface CardRow {
  id: number;
  cardNumber: string;
  sku: string;
  name: string | null;
  nameEn: string | null;
  setCode: string | null;
  setName: string | null;
  price: number | null;
  rarity: string | null;
  imageUrl: string | null;
  stock: number;
  pendingStock: number;
}

export default function CardTable({
  cards,
  currentSort,
  currentOrder,
  lastSynced,
  currentCategory = "singles",
  wantedIds = [],
}: {
  cards: CardRow[];
  currentSort: string;
  currentOrder: string;
  lastSynced: string | null;
  currentCategory?: string;
  wantedIds?: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addItem } = useCart();
  const { isPending, startFilter } = useCatalogFilter();

  function toggleSort(column: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (currentSort === column && currentOrder === "asc") {
      params.set("sort", column);
      params.set("order", "desc");
    } else {
      params.set("sort", column);
      params.set("order", "asc");
    }
    startFilter(() => router.push(`/catalog?${params.toString()}`));
  }

  function sortIndicator(column: string) {
    if (currentSort !== column) return null;
    return currentOrder === "asc" ? " \u2191" : " \u2193";
  }

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [expandedImage, setExpandedImage] = useState<{ url: string; alt: string } | null>(null);
  const [wanted, setWanted] = useState<Set<number>>(() => new Set(wantedIds));
  const [togglingWanted, setTogglingWanted] = useState<Set<number>>(new Set());

  async function toggleWanted(cardId: number) {
    setTogglingWanted((prev) => new Set(prev).add(cardId));
    try {
      const res = await fetch("/api/wanted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (res.ok) {
        const { wanted: isWanted } = await res.json();
        setWanted((prev) => {
          const next = new Set(prev);
          if (isWanted) next.add(cardId);
          else next.delete(cardId);
          return next;
        });
      }
    } finally {
      setTogglingWanted((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  }

  function handleAdd(card: CardRow) {
    const qty = quantities[card.id] || 1;
    addItem({
      id: card.id,
      cardNumber: card.cardNumber,
      sku: card.sku,
      name: card.name ?? "",
      setCode: card.setCode,
      setName: card.setName,
      price: card.price ?? 0,
    }, qty);
    setQuantities((prev) => ({ ...prev, [card.id]: 1 }));
  }

  return (
    <>
    <div className={`overflow-x-auto rounded-lg border border-[#1e1e2e] transition-opacity ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
      <table className="w-full text-sm">
        <thead className="bg-[#12121a]">
          <tr className="text-left text-gray-400">
            <th className="px-2 md:px-4 py-3 font-medium w-14"></th>
            {currentCategory === "sealed" ? (
              <th
                className="px-2 md:px-4 py-3 font-medium cursor-pointer hover:text-gray-200 transition select-none"
                onClick={() => toggleSort("name")}
              >
                Name{sortIndicator("name")}
              </th>
            ) : (
              <th
                className="px-2 md:px-4 py-3 font-medium cursor-pointer hover:text-gray-200 transition select-none"
                onClick={() => toggleSort("cardNumber")}
              >
                Card #{sortIndicator("cardNumber")}
              </th>
            )}
            <th className="hidden md:table-cell px-4 py-3 font-medium">SKU</th>
            <th
              className="hidden md:table-cell px-4 py-3 font-medium cursor-pointer hover:text-gray-200 transition select-none"
              onClick={() => toggleSort("set")}
            >
              Set{sortIndicator("set")}
            </th>
            <th className="hidden md:table-cell px-4 py-3 font-medium">Type</th>
            <th className="px-2 md:px-4 py-3 font-medium text-right">Stock</th>
            <th
              className="px-2 md:px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-200 transition select-none"
              onClick={() => toggleSort("price")}
            >
              Price{sortIndicator("price")}
              {lastSynced && (
                <div className="text-[10px] text-gray-500 font-normal">{lastSynced}</div>
              )}
            </th>
            <th className="px-2 md:px-4 py-3 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e1e2e]">
          {cards.map((card) => {
            const price = card.price ?? 0;

            return (
              <tr key={card.id} className="hover:bg-[#12121a] transition">
                <td className="px-2 md:px-4 py-1">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.cardNumber}
                      className="h-10 w-auto rounded cursor-pointer hover:opacity-80 transition select-none"
                      loading="lazy"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => setExpandedImage({ url: card.imageUrl!, alt: card.cardNumber })}
                    />
                  ) : (
                    <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                  )}
                </td>
                <td className="px-2 md:px-4 py-3 font-mono text-brand-500">
                  {currentCategory === "sealed" ? (card.name || card.cardNumber) : card.cardNumber}
                  {card.nameEn && (
                    <div className="text-xs text-gray-400 font-sans">{card.nameEn}</div>
                  )}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-gray-400 font-mono text-xs">
                  {card.sku}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-gray-400">{card.setCode}</td>
                <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs font-mono">
                  {card.rarity ?? "—"}
                </td>
                <td className={`px-2 md:px-4 py-3 text-right ${card.stock > 0 ? "text-green-400" : "text-gray-500"}`}>
                  {card.stock}
                  {card.pendingStock > 0 && (
                    <span className="ml-1 text-yellow-500 text-xs" title="Pending delivery">
                      (+{card.pendingStock})
                    </span>
                  )}
                </td>
                <td className="px-2 md:px-4 py-3 text-right">
                  <span className="font-medium text-green-400">
                    {"\u00a3"}{price.toFixed(2)}
                  </span>
                </td>
                <td className="px-2 md:px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 md:gap-2">
                    <input
                      type="number"
                      min={1}
                      value={quantities[card.id] || 1}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [card.id]: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-12 md:w-16 rounded bg-[#0a0a0f] border border-[#1e1e2e] px-1 md:px-2 py-1 text-xs text-center focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleAdd(card)}
                      className="rounded bg-brand-600 px-2 md:px-3 py-1 text-xs font-medium hover:bg-brand-700 transition whitespace-nowrap"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => toggleWanted(card.id)}
                      disabled={togglingWanted.has(card.id)}
                      className="p-1 transition disabled:opacity-50"
                      title={wanted.has(card.id) ? "Remove from wanted" : "Mark as wanted"}
                    >
                      {wanted.has(card.id) ? (
                        <svg className="w-4 h-4 text-pink-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500 hover:text-pink-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {cards.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                No cards found. Try adjusting your search or filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <WatermarkedImage
              src={expandedImage.url}
              alt={expandedImage.alt}
              style="diagonal-repeat"
            />
          </div>
        </div>
      )}
    </>
  );
}

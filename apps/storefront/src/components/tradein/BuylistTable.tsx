"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { BuylistItem } from "@/app/trade-in/page";
import { useSellCart } from "@/context/SellCartContext";
import { formatPrice } from "@/lib/format";

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  // One Piece parallels use /P and /SP suffixes; Dragon Ball uses ☆
  const isParallel = r.includes("/P") || r.includes("/SP") || r.includes("☆");

  let cls = "";
  let label = rarity;

  if (isParallel) {
    // Parallel cards labelled as AA (Alt Art)
    cls = "bg-pink-500/20 text-pink-400";
    label = "AA";
  } else if (r === "SR" || r === "SEC" || r === "SP" || r === "SCR" || r === "L" || r === "SEC/SP")
    cls = "bg-yellow-500/20 text-yellow-400";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-purple-500/20 text-purple-400";
  else if (r === "UC")
    cls = "bg-blue-500/20 text-blue-400";
  else if (r === "C")
    cls = "bg-neutral-700 text-neutral-400";
  else
    cls = "bg-neutral-700 text-neutral-400";

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function wantIndicator(cashWant: number, creditWant: number, mode: "cash" | "credit") {
  if (mode === "credit") {
    return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="Always buying" />;
  }
  if (cashWant >= 4) {
    return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="High demand" />;
  }
  if (cashWant >= 1) {
    return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="Limited" />;
  }
  return <span className="w-2 h-2 rounded-full bg-neutral-600 inline-block" title="Not buying for cash" />;
}

type SortKey = "card_number" | "cash_price" | "credit_price";

export default function BuylistTable({ buylist, game }: { buylist: BuylistItem[]; game: string }) {
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("card_number");
  const [mode, setMode] = useState<"cash" | "credit">("credit");
  const { items: cartItems, addItem, updateQty, openDrawer } = useSellCart();

  // Unique sets for filter dropdown
  const sets = useMemo(() => {
    const setMap = new Map<string, string>();
    for (const item of buylist) {
      if (item.set_code && item.set_name) {
        setMap.set(item.set_code, item.set_name);
      }
    }
    // One Piece has an established set-prefix ordering; other games sort
    // naturally by set code.
    const groupOrder: Record<string, number> =
      game === "one-piece"
        ? { OP: 0, EB: 1, ST: 2, PRB: 3, PCC: 4, P: 5, PROMO: 6, SEALED: 7 }
        : {};
    return Array.from(setMap.entries()).sort((a, b) => {
      const prefixA = a[0].replace(/[0-9-].*/,"");
      const prefixB = b[0].replace(/[0-9-].*/,"");
      const groupA = groupOrder[prefixA] ?? 8;
      const groupB = groupOrder[prefixB] ?? 8;
      if (groupA !== groupB) return groupA - groupB;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }, [buylist, game]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = buylist;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.card_number.toLowerCase().includes(q)
      );
    }

    if (setFilter) {
      result = result.filter((i) => i.set_code === setFilter);
    }

    result = [...result].sort((a, b) => {
      if (sort === "card_number") return a.card_number.localeCompare(b.card_number);
      if (sort === "cash_price") return b.cash_price - a.cash_price;
      return b.credit_price - a.credit_price;
    });

    return result;
  }, [buylist, search, setFilter, sort]);

  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cartItems) {
      map.set(item.sku, item.quantity);
    }
    return map;
  }, [cartItems]);

  function handleAdd(item: BuylistItem) {
    const existing = cartMap.get(item.sku);
    if (existing) {
      updateQty(item.sku, existing + 1);
    } else {
      addItem({
        sku: item.sku,
        game: item.game,
        card_number: item.card_number,
        name: item.name,
        set_code: item.set_code,
        image_url: item.image_url,
        cash_price: item.cash_price,
        credit_price: item.credit_price,
        quantity: 1,
      });
    }
    openDrawer();
  }

  const canAdd = (item: BuylistItem) => {
    if (mode === "credit") return item.credit_price > 0;
    return item.cash_want > 0 && item.cash_price > 0;
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        {/* Set filter */}
        <select
          value={setFilter}
          onChange={(e) => setSetFilter(e.target.value)}
          className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          <option value="">All sets</option>
          {sets.map(([code, name]) => (
            <option key={code} value={code}>
              {code} — {name}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          <option value="card_number">Card #</option>
          <option value="cash_price">Cash price</option>
          <option value="credit_price">Credit price</option>
        </select>

        {/* Payment mode toggle */}
        <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setMode("credit")}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              mode === "credit"
                ? "bg-amber-500 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Credit
          </button>
          <button
            onClick={() => setMode("cash")}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              mode === "cash"
                ? "bg-amber-500 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Cash
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-neutral-500 mb-4">
        {filtered.length} card{filtered.length !== 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="text-neutral-400 py-12 text-center">No cards found.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800 text-xs text-neutral-500 uppercase">
                  <th className="text-left py-3 px-2 w-12"></th>
                  <th className="text-left py-3 px-2">Card</th>
                  <th className="text-left py-3 px-2">Set</th>
                  <th className="text-center py-3 px-2">Rarity</th>
                  <th className="text-center py-3 px-2">Status</th>
                  <th className="text-right py-3 px-2">Cash</th>
                  <th className="text-right py-3 px-2">Credit</th>
                  <th className="text-right py-3 px-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const inCart = cartMap.get(item.sku);
                  const disabled = !canAdd(item);

                  return (
                    <tr
                      key={item.sku}
                      className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition"
                    >
                      <td className="py-2 px-2">
                        <div className="relative w-10 h-14 rounded overflow-hidden bg-neutral-800 shrink-0">
                          {item.image_url ? (
                            <Image
                              src={item.image_url}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-700" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-xs text-neutral-500">{item.card_number}</p>
                      </td>
                      <td className="py-2 px-2 text-xs text-neutral-400">
                        {item.set_name || item.set_code}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {rarityBadge(item.rarity)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {wantIndicator(item.cash_want, item.credit_want, mode)}
                      </td>
                      <td
                        className={`py-2 px-2 text-right text-sm font-medium ${
                          mode === "cash" ? "text-amber-400" : "text-neutral-400"
                        }`}
                      >
                        {item.cash_price > 0 ? formatPrice(item.cash_price) : "—"}
                      </td>
                      <td
                        className={`py-2 px-2 text-right text-sm font-medium ${
                          mode === "credit" ? "text-amber-400" : "text-neutral-400"
                        }`}
                      >
                        {item.credit_price > 0 ? formatPrice(item.credit_price) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {inCart ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => updateQty(item.sku, inCart - 1)}
                              className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition"
                            >
                              -
                            </button>
                            <span className="text-sm font-medium w-6 text-center">{inCart}</span>
                            <button
                              onClick={() => updateQty(item.sku, inCart + 1)}
                              className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAdd(item)}
                            disabled={disabled}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                              disabled
                                ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                                : "bg-amber-500 text-black hover:bg-amber-400"
                            }`}
                          >
                            Add
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((item) => {
              const inCart = cartMap.get(item.sku);
              const disabled = !canAdd(item);

              return (
                <div
                  key={item.sku}
                  className="flex gap-3 bg-neutral-900 rounded-xl p-3"
                >
                  <div className="relative w-16 h-22 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-neutral-500">
                          {item.card_number}
                          {item.rarity && (
                            <span className="ml-2">{rarityBadge(item.rarity)}</span>
                          )}
                        </p>
                      </div>
                      {wantIndicator(item.cash_want, item.credit_want, mode)}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <div>
                        <p className="text-[10px] text-neutral-500 uppercase">Cash</p>
                        <p className={`text-sm font-medium ${mode === "cash" ? "text-amber-400" : "text-neutral-400"}`}>
                          {item.cash_price > 0 ? formatPrice(item.cash_price) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-500 uppercase">Credit</p>
                        <p className={`text-sm font-medium ${mode === "credit" ? "text-amber-400" : "text-neutral-400"}`}>
                          {item.credit_price > 0 ? formatPrice(item.credit_price) : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(item.sku, inCart - 1)}
                            className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition"
                          >
                            -
                          </button>
                          <span className="text-sm font-medium w-5 text-center">{inCart}</span>
                          <button
                            onClick={() => updateQty(item.sku, inCart + 1)}
                            className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAdd(item)}
                          disabled={disabled}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                            disabled
                              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                              : "bg-amber-500 text-black hover:bg-amber-400"
                          }`}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

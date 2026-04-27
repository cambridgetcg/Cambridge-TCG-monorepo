"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------- Types ----------

interface CardRow {
  id: number;
  cardNumber: string;
  sku: string;
  name: string;
  nameEn: string | null;
  setCode: string | null;
  imageUrl: string | null;
  stock: number;
  pendingStock: number;
}

// ---------- Component ----------

export default function AdminStockEditPage() {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [sortCombo, setSortCombo] = useState("stock-desc");
  const [stockedOnly, setStockedOnly] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (query: string, stocked: boolean) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (stocked) params.set("stocked", "1");
    const res = await fetch(`/api/admin/stock/levels?${params}`);
    const data = await res.json();
    setRows(data);
    setLoading(false);
  }, []);

  // Fetch on mount (stocked cards) and when stockedOnly changes
  useEffect(() => {
    if (!search) fetchData("", stockedOnly);
  }, [stockedOnly, fetchData, search]);

  function handleSearch() {
    fetchData(search, stockedOnly);
  }

  // Derive unique sets from fetched data
  const sets = Array.from(
    new Set(rows.map((r) => r.setCode).filter((s): s is string => !!s))
  ).sort();

  // Client-side filter by set
  const filtered = setFilter
    ? rows.filter((r) => r.setCode === setFilter)
    : rows;

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const [sk, so] = sortCombo.split("-") as [string, string];
    const asc = so === "asc";
    let cmp = 0;
    switch (sk) {
      case "cardNumber":
        cmp = a.cardNumber.localeCompare(b.cardNumber);
        break;
      case "setCode":
        cmp =
          (a.setCode || "").localeCompare(b.setCode || "") ||
          a.cardNumber.localeCompare(b.cardNumber);
        break;
      case "stock":
        cmp = a.stock - b.stock;
        break;
      case "pendingStock":
        cmp = a.pendingStock - b.pendingStock;
        break;
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      default:
        cmp = a.stock - b.stock;
    }
    return asc ? cmp : -cmp;
  });

  // Summary
  const totalStock = filtered.reduce((s, r) => s + r.stock, 0);
  const totalPending = filtered.reduce((s, r) => s + r.pendingStock, 0);
  const uniqueCards = filtered.length;

  // Inline edit handlers
  function startEdit(card: CardRow) {
    setEditingId(card.id);
    setEditValue(String(card.stock));
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function saveEdit(cardId: number) {
    const newStock = Math.max(0, Math.floor(Number(editValue) || 0));
    setEditingId(null);
    setSaving(cardId);
    try {
      const res = await fetch("/api/admin/stock/adjust", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, stock: newStock }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === cardId ? { ...r, stock: newStock } : r))
        );
      }
    } finally {
      setSaving(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Stock Levels</h1>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={stockedOnly}
            onChange={(e) => setStockedOnly(e.target.checked)}
            className="accent-brand-500"
          />
          Stocked only
        </label>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">On Hand</div>
          <div className="text-2xl font-bold text-green-400">{totalStock}</div>
          <div className="text-xs text-gray-500">total qty</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Pending</div>
          <div className="text-2xl font-bold text-yellow-400">
            {totalPending}
          </div>
          <div className="text-xs text-gray-500">ordered / shipped</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Cards</div>
          <div className="text-2xl font-bold">{uniqueCards}</div>
          <div className="text-xs text-gray-500">shown</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Editing</div>
          <div className="text-xs text-gray-300 mt-1">
            Click stock number to edit
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input
            type="text"
            placeholder="Search card # or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                fetchData("", stockedOnly);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 transition"
        >
          Search
        </button>
        <select
          value={setFilter}
          onChange={(e) => setSetFilter(e.target.value)}
          className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sortCombo}
          onChange={(e) => setSortCombo(e.target.value)}
          className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
        >
          <option value="stock-desc">Stock (high→low)</option>
          <option value="stock-asc">Stock (low→high)</option>
          <option value="pendingStock-desc">Pending (high→low)</option>
          <option value="pendingStock-asc">Pending (low→high)</option>
          <option value="cardNumber-asc">Card # (A→Z)</option>
          <option value="cardNumber-desc">Card # (Z→A)</option>
          <option value="setCode-asc">Set (A→Z)</option>
          <option value="setCode-desc">Set (Z→A)</option>
          <option value="name-asc">Name (A→Z)</option>
          <option value="name-desc">Name (Z→A)</option>
        </select>
        {setFilter && (
          <span className="text-xs text-gray-500">
            {filtered.length} of {rows.length} cards
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-gray-400 py-8 text-center">Loading...</div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
          <table className="w-full text-sm">
            <thead className="bg-[#12121a]">
              <tr className="text-left text-gray-400">
                <th className="px-3 py-3 font-medium w-10"></th>
                <th className="px-3 py-3 font-medium">Card</th>
                <th className="hidden md:table-cell px-3 py-3 font-medium">
                  Set
                </th>
                <th className="hidden lg:table-cell px-3 py-3 font-medium">
                  SKU
                </th>
                <th className="px-3 py-3 font-medium text-right">Stock</th>
                <th className="px-3 py-3 font-medium text-right">Pending</th>
                <th className="px-3 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-[#12121a]">
                  <td className="px-3 py-1">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt={r.cardNumber}
                        className="h-10 w-auto rounded"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-brand-500">
                      {r.cardNumber}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">
                      {r.nameEn || r.name || "\u2014"}
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-400">
                    {r.setCode || "\u2014"}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-3 text-gray-400 font-mono text-xs">
                    {r.sku || "\u2014"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {editingId === r.id ? (
                      <input
                        ref={inputRef}
                        type="number"
                        min={0}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(r.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => saveEdit(r.id)}
                        className="w-16 rounded border border-brand-500 bg-[#12121a] px-2 py-1 text-right text-sm text-white focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(r)}
                        className={`font-bold cursor-pointer hover:underline ${
                          saving === r.id
                            ? "text-gray-500"
                            : r.stock > 0
                              ? "text-green-400"
                              : "text-gray-500"
                        }`}
                        title="Click to edit"
                      >
                        {saving === r.id ? "..." : r.stock}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={
                        r.pendingStock > 0
                          ? "text-yellow-400"
                          : "text-gray-500"
                      }
                    >
                      {r.pendingStock}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold">
                    {r.stock + r.pendingStock}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {search
                      ? "No cards found. Try a different search."
                      : "No stocked cards. Uncheck 'Stocked only' or search for a card."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

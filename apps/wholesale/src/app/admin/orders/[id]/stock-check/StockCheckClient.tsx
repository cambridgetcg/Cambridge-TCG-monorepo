"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CardThumbnail from "@/components/CardThumbnail";

interface LiveResult {
  priceJpy: number;
  stock: number;
}

interface StockItem {
  id: number;
  cardId: number;
  cardNumber: string;
  imageUrl: string | null;
  cardrushUrl: string | null;
  cardrushJpy: number | null;
  gbpJpyRate: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stockStatus: string;
  checkedPriceJpy: number | null;
  checkedQuantity: number | null;
  priceDiffPct: number | null;
  currentCalcPrice: number | null;
}

interface Props {
  orderId: number;
  clientName: string;
  clientCompany: string | null;
  orderTotal: number;
  items: StockItem[];
}

export default function StockCheckClient({ orderId, clientName, clientCompany, orderTotal, items: initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>(() => {
    const inputs: Record<number, string> = {};
    for (const item of initialItems) {
      if (item.checkedPriceJpy != null) {
        inputs[item.id] = item.checkedPriceJpy.toString();
      }
    }
    return inputs;
  });
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>(() => {
    const inputs: Record<number, string> = {};
    for (const item of initialItems) {
      if (item.checkedQuantity != null) {
        inputs[item.id] = item.checkedQuantity.toString();
      }
    }
    return inputs;
  });

  const [liveResults, setLiveResults] = useState<Record<number, LiveResult>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingItem, setCheckingItem] = useState<number | null>(null);
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cardNumber" | "priceDiff" | "stock" | "lineTotal">("cardNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const checkedCount = items.filter((i) => i.stockStatus !== "pending").length;
  const allChecked = checkedCount === items.length;

  const statusCounts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.stockStatus] = (acc[i.stockStatus] || 0) + 1;
    return acc;
  }, {});

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  const filteredItems = items
    .filter((i) => !statusFilter || i.stockStatus === statusFilter)
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return i.cardNumber.toLowerCase().startsWith(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "cardNumber") cmp = a.cardNumber.localeCompare(b.cardNumber);
      else if (sortBy === "priceDiff") cmp = (a.priceDiffPct ?? 0) - (b.priceDiffPct ?? 0);
      else if (sortBy === "stock") cmp = (a.checkedQuantity ?? 0) - (b.checkedQuantity ?? 0);
      else if (sortBy === "lineTotal") cmp = a.lineTotal - b.lineTotal;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const updateItemStatus = useCallback(async (itemId: number, stockStatus: string, checkedPriceJpy?: number, checkedQuantity?: number) => {
    setSaving(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/items/${itemId}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockStatus, checkedPriceJpy, checkedQuantity }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, stockStatus, checkedPriceJpy: checkedPriceJpy ?? null, checkedQuantity: checkedQuantity ?? null } : i
          )
        );
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to update item status");
      }
    } finally {
      setSaving(null);
    }
  }, [orderId]);

  async function completeStockCheck() {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/stock-check/complete`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/admin/orders");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to complete stock check");
      }
    } finally {
      setCompleting(false);
    }
  }

  const applyLiveResult = useCallback(async (item: StockItem, result: LiveResult) => {
    setLiveResults((prev) => ({ ...prev, [item.id]: result }));
    const dbPrice = item.cardrushJpy ?? 0;

    if (result.stock === 0) {
      // Out of stock — auto-mark
      await updateItemStatus(item.id, "out_of_stock");
    } else if (result.stock > 0 && result.priceJpy === dbPrice) {
      // In stock, price matches — auto-mark
      await updateItemStatus(item.id, "in_stock");
    } else if (result.stock > 0 && result.stock < item.quantity) {
      // Partial stock — pre-fill qty input, don't auto-submit
      setQtyInputs((prev) => ({ ...prev, [item.id]: result.stock.toString() }));
      if (result.priceJpy !== dbPrice && result.priceJpy > 0) {
        setPriceInputs((prev) => ({ ...prev, [item.id]: result.priceJpy.toString() }));
      }
    } else if (result.stock > 0 && result.priceJpy !== dbPrice && result.priceJpy > 0) {
      // Price changed — pre-fill price input, don't auto-submit
      setPriceInputs((prev) => ({ ...prev, [item.id]: result.priceJpy.toString() }));
    }
  }, [updateItemStatus]);

  const checkSingleItem = useCallback(async (item: StockItem) => {
    if (!item.cardrushUrl) return;
    setCheckingItem(item.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/stock-check/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [item.cardrushUrl] }),
      });
      if (!res.ok) throw new Error("Failed to check stock");
      const data = await res.json();
      const result = data.results[item.cardrushUrl];
      if (result && !result.error) {
        await applyLiveResult(item, result);
      } else {
        setError(`Check failed for ${item.cardNumber}: ${result?.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setCheckingItem(null);
    }
  }, [applyLiveResult]);

  const checkAllItems = useCallback(async () => {
    const unchecked = items.filter((i) => i.stockStatus === "pending" && i.cardrushUrl);
    if (unchecked.length === 0) return;

    setCheckingAll(true);
    setCheckProgress({ done: 0, total: unchecked.length });
    setError(null);

    const BATCH_SIZE = 20;
    let done = 0;

    for (let i = 0; i < unchecked.length; i += BATCH_SIZE) {
      const batch = unchecked.slice(i, i + BATCH_SIZE);
      const urls = batch.map((item) => item.cardrushUrl!);

      try {
        const res = await fetch("/api/admin/stock-check/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        if (!res.ok) throw new Error("Batch check failed");
        const data = await res.json();

        for (const item of batch) {
          const result = data.results[item.cardrushUrl!];
          if (result && !result.error) {
            await applyLiveResult(item, result);
          }
          done++;
          setCheckProgress({ done, total: unchecked.length });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Batch check failed");
        break;
      }
    }

    setCheckingAll(false);
  }, [items, applyLiveResult]);

  function statusClasses(itemStatus: string, buttonStatus: string) {
    const active = itemStatus === buttonStatus;
    const base = "rounded px-3 py-1 text-xs font-medium transition";
    if (buttonStatus === "in_stock") {
      return active
        ? `${base} bg-green-600 text-white`
        : `${base} bg-green-900/20 text-green-400 hover:bg-green-900/40`;
    }
    if (buttonStatus === "out_of_stock") {
      return active
        ? `${base} bg-red-600 text-white`
        : `${base} bg-red-900/20 text-red-400 hover:bg-red-900/40`;
    }
    if (buttonStatus === "price_changed") {
      return active
        ? `${base} bg-amber-600 text-white`
        : `${base} bg-amber-900/20 text-amber-400 hover:bg-amber-900/40`;
    }
    if (buttonStatus === "partial") {
      return active
        ? `${base} bg-orange-600 text-white`
        : `${base} bg-orange-900/20 text-orange-400 hover:bg-orange-900/40`;
    }
    return base;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Stock Check — Order #{orderId}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {clientName}{clientCompany ? ` (${clientCompany})` : ""} — £{orderTotal.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={checkAllItems}
            disabled={checkingAll || items.filter((i) => i.stockStatus === "pending" && i.cardrushUrl).length === 0}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkingAll
              ? `Checking ${checkProgress.done}/${checkProgress.total}...`
              : "Check All"}
          </button>
          <Link
            href="/admin/orders"
            className="rounded bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition"
          >
            Back to Orders
          </Link>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            Progress: <span className="font-medium text-white">{checkedCount}/{items.length}</span> items checked
          </span>
          {allChecked && (
            <span className="text-green-400 font-medium">All items checked</span>
          )}
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-800">
          <div
            className="h-2 rounded-full bg-brand-600 transition-all"
            style={{ width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Search + Sort */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search card number..."
          className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none w-48"
        />
        <span className="text-xs text-gray-500">Sort:</span>
        {(["cardNumber", "priceDiff", "stock", "lineTotal"] as const).map((col) => (
          <button
            key={col}
            onClick={() => toggleSort(col)}
            className={`rounded px-2 py-1 text-xs transition ${sortBy === col ? "bg-brand-600 text-white" : "bg-gray-800/50 text-gray-400 hover:bg-gray-800"}`}
          >
            {col === "cardNumber" ? "Card #" : col === "priceDiff" ? "Δ Price" : col === "stock" ? "Stock" : "Total"}
            {sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ))}
        {(search || sortBy !== "cardNumber") && (
          <button onClick={() => { setSearch(""); setSortBy("cardNumber"); setSortDir("asc"); }} className="text-xs text-gray-500 hover:text-gray-300">
            Reset
          </button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{filteredItems.length}/{items.length}</span>
      </div>

      {/* Status filter */}
      {checkedCount > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === null
                ? "bg-gray-600 text-white"
                : "bg-gray-800/50 text-gray-400 hover:bg-gray-800"
            }`}
          >
            All ({items.length})
          </button>
          {(statusCounts.in_stock ?? 0) > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "in_stock" ? null : "in_stock")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === "in_stock"
                  ? "bg-green-600 text-white"
                  : "bg-green-900/20 text-green-400 hover:bg-green-900/40"
              }`}
            >
              In Stock ({statusCounts.in_stock})
            </button>
          )}
          {(statusCounts.out_of_stock ?? 0) > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "out_of_stock" ? null : "out_of_stock")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === "out_of_stock"
                  ? "bg-red-600 text-white"
                  : "bg-red-900/20 text-red-400 hover:bg-red-900/40"
              }`}
            >
              Out of Stock ({statusCounts.out_of_stock})
            </button>
          )}
          {(statusCounts.price_changed ?? 0) > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "price_changed" ? null : "price_changed")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === "price_changed"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-900/20 text-amber-400 hover:bg-amber-900/40"
              }`}
            >
              Price Changed ({statusCounts.price_changed})
            </button>
          )}
          {(statusCounts.partial ?? 0) > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "partial" ? null : "partial")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === "partial"
                  ? "bg-orange-600 text-white"
                  : "bg-orange-900/20 text-orange-400 hover:bg-orange-900/40"
              }`}
            >
              Partial ({statusCounts.partial})
            </button>
          )}
          {(statusCounts.pending ?? 0) > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "pending" ? null : "pending")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === "pending"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-800/50 text-gray-400 hover:bg-gray-800"
              }`}
            >
              Pending ({statusCounts.pending})
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Items checklist */}
      <div className="space-y-3">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border p-4 transition ${
              item.stockStatus === "pending"
                ? "border-[#1e1e2e] bg-[#12121a]"
                : item.stockStatus === "in_stock"
                ? "border-green-900/50 bg-green-900/10"
                : item.stockStatus === "out_of_stock"
                ? "border-red-900/50 bg-red-900/10"
                : item.stockStatus === "partial"
                ? "border-orange-900/50 bg-orange-900/10"
                : "border-amber-900/50 bg-amber-900/10"
            }`}
          >
            {/* Item header */}
            <div className="flex items-start justify-between gap-4">
              <div className="shrink-0">
                {item.imageUrl ? (
                  <CardThumbnail src={item.imageUrl} alt={item.cardNumber} className="h-12 w-auto" />
                ) : (
                  <div className="h-12 w-9 rounded bg-[#1e1e2e]" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-medium text-brand-500">{item.cardNumber}</span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                  <span>¥{item.cardrushJpy?.toLocaleString() ?? "—"}</span>
                  <span>£{item.unitPrice.toFixed(2)}</span>
                  <span>Qty: {item.quantity}</span>
                  <span className="font-medium text-gray-400">
                    Line: £{item.lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Live check + CardRush link */}
              {item.cardrushUrl && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => checkSingleItem(item)}
                    disabled={checkingItem === item.id || checkingAll}
                    className="rounded bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/50 transition disabled:opacity-50"
                  >
                    {checkingItem === item.id ? "..." : "Check"}
                  </button>
                  <a
                    href={item.cardrushUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded px-1.5 py-1 text-xs text-gray-500 hover:text-blue-400 transition"
                    title="Open on CardRush"
                  >
                    ↗
                  </a>
                </div>
              )}
            </div>

            {/* Price discrepancy alert */}
            {item.priceDiffPct != null && (
              <div className="mt-2 rounded bg-amber-900/20 border border-amber-900/30 px-3 py-2 text-xs text-amber-400">
                Price may have changed since last sync — current calc: £{item.currentCalcPrice?.toFixed(2)} vs order: £{item.unitPrice.toFixed(2)} ({(item.priceDiffPct * 100).toFixed(1)}% diff)
              </div>
            )}

            {/* Live stock results */}
            {liveResults[item.id] && (
              <div className="mt-2 flex items-center gap-3 text-xs">
                {liveResults[item.id].stock > 0 ? (
                  <span className="text-green-400">{liveResults[item.id].stock} in stock</span>
                ) : (
                  <span className="text-red-400">Out of stock</span>
                )}
                {liveResults[item.id].priceJpy === (item.cardrushJpy ?? 0) ? (
                  <span className="text-green-400">¥{liveResults[item.id].priceJpy.toLocaleString()} ✓</span>
                ) : liveResults[item.id].priceJpy > 0 ? (
                  <span className="text-amber-400">
                    ¥{(item.cardrushJpy ?? 0).toLocaleString()} → ¥{liveResults[item.id].priceJpy.toLocaleString()}
                  </span>
                ) : null}
              </div>
            )}

            {/* Status buttons */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => updateItemStatus(item.id, "in_stock")}
                disabled={saving === item.id}
                className={statusClasses(item.stockStatus, "in_stock")}
              >
                In Stock
              </button>
              <button
                onClick={() => updateItemStatus(item.id, "out_of_stock")}
                disabled={saving === item.id}
                className={statusClasses(item.stockStatus, "out_of_stock")}
              >
                Out of Stock
              </button>
              <button
                onClick={() => {
                  const jpy = parseInt(priceInputs[item.id] || "");
                  if (!isNaN(jpy) && jpy > 0) {
                    updateItemStatus(item.id, "price_changed", jpy);
                  }
                }}
                disabled={saving === item.id || !priceInputs[item.id]}
                className={statusClasses(item.stockStatus, "price_changed")}
              >
                Price Changed
              </button>
              <button
                onClick={() => {
                  const qty = parseInt(qtyInputs[item.id] || "");
                  if (!isNaN(qty) && qty >= 1 && qty < item.quantity) {
                    const jpy = parseInt(priceInputs[item.id] || "");
                    updateItemStatus(item.id, "partial", !isNaN(jpy) && jpy > 0 ? jpy : undefined, qty);
                  }
                }}
                disabled={saving === item.id || !qtyInputs[item.id]}
                className={statusClasses(item.stockStatus, "partial")}
              >
                Partial
              </button>
              <div className="flex items-center gap-1 ml-1">
                <span className="text-xs text-gray-500">Qty</span>
                <input
                  type="number"
                  min="1"
                  max={item.quantity - 1}
                  placeholder={`/${item.quantity}`}
                  value={qtyInputs[item.id] || ""}
                  onChange={(e) => setQtyInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="w-16 rounded bg-[#1a1a2e] border border-[#2a2a3e] px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1 ml-1">
                <span className="text-xs text-gray-500">¥</span>
                <input
                  type="number"
                  min="1"
                  placeholder="New JPY"
                  value={priceInputs[item.id] || ""}
                  onChange={(e) => setPriceInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="w-24 rounded bg-[#1a1a2e] border border-[#2a2a3e] px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              {saving === item.id && <span className="text-xs text-gray-500 ml-2">Saving...</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Send Quote button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={completeStockCheck}
          disabled={!allChecked || completing}
          className="rounded bg-brand-600 px-6 py-3 text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {completing ? "Sending Quote..." : `Send Quote (${items.filter((i) => i.stockStatus !== "out_of_stock").length} items)`}
        </button>
      </div>
    </div>
  );
}

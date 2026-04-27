"use client";

import { useState, useEffect, useCallback } from "react";

interface CardRow {
  id: number;
  sku: string;
  cardNumber: string;
  name: string | null;
  setCode: string | null;
  cardrushJpy: number | null;
  price: number | null;
  lastSyncedAt: string | null;
}

export default function AdminPricesPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced?: number; error?: string; timestamp?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ updated?: number; errors?: string[]; error?: string } | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [search, setSearch] = useState("");

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/cards");
    const data = await res.json();
    setCards(data);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  async function syncPrices() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
      if (data.synced) fetchCards();
    } catch {
      setSyncResult({ error: "Sync failed" });
    }
    setSyncing(false);
  }

  async function uploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/prices/upload", { method: "POST", body: formData });
      const data = await res.json();
      setUploadResult(data);
      if (data.updated) fetchCards();
    } catch {
      setUploadResult({ error: "Upload failed" });
    }
    setUploading(false);
    e.target.value = "";
  }

  async function savePrice(cardId: number) {
    const price = parseFloat(editPrice);
    if (isNaN(price)) return;
    await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: price }),
    });
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, price: price } : c)));
    setEditingId(null);
  }

  const lastSync = cards.length > 0
    ? cards.reduce((latest, c) => {
        if (!c.lastSyncedAt) return latest;
        return !latest || c.lastSyncedAt > latest ? c.lastSyncedAt : latest;
      }, "" as string)
    : null;

  const filtered = search
    ? cards.filter((c) =>
        c.cardNumber.toLowerCase().includes(search.toLowerCase()) ||
        c.sku.toLowerCase().includes(search.toLowerCase()) ||
        (c.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : cards;

  const unavailable = filtered.filter((c) => !c.cardrushJpy || c.cardrushJpy <= 0);
  const available = filtered.filter((c) => c.cardrushJpy && c.cardrushJpy > 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Price Management</h1>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* Sync panel */}
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-6">
          <h2 className="mb-2 text-lg font-semibold">S3 Price Feed Sync</h2>
          {lastSync && (
            <p className="mb-3 text-xs text-gray-500">
              Last sync: {new Date(lastSync).toLocaleString()} · {cards.length} cards
            </p>
          )}
          <button
            onClick={syncPrices}
            disabled={syncing}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {syncResult && (
            <div className={`mt-3 rounded p-2 text-sm ${syncResult.error ? "bg-red-900/20 text-red-400" : "bg-green-900/20 text-green-400"}`}>
              {syncResult.error ? `Error: ${syncResult.error}` : `Synced ${syncResult.synced} cards`}
            </div>
          )}
        </div>

        {/* CSV upload panel */}
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-6">
          <h2 className="mb-2 text-lg font-semibold">Manual CSV Upload</h2>
          <p className="mb-3 text-xs text-gray-500">Columns: sku, jpy_price, gbp_jpy_rate (optional)</p>
          <input
            type="file"
            accept=".csv"
            onChange={uploadCSV}
            disabled={uploading}
            className="text-sm text-gray-400 file:mr-4 file:rounded file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 disabled:opacity-50"
          />
          {uploadResult && (
            <div className={`mt-3 rounded p-2 text-sm ${uploadResult.error ? "bg-red-900/20 text-red-400" : "bg-green-900/20 text-green-400"}`}>
              {uploadResult.error
                ? `Error: ${uploadResult.error}`
                : `Updated ${uploadResult.updated} cards${uploadResult.errors?.length ? ` (${uploadResult.errors.length} errors)` : ""}`}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search cards..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-[#1e1e2e] bg-[#12121a] px-4 py-2 text-sm outline-none focus:border-brand-500"
      />

      {/* Not Available cards */}
      {unavailable.length > 0 && (
        <div className="mb-4 rounded-lg bg-yellow-900/20 border border-yellow-700/30 px-4 py-3">
          <p className="text-sm font-medium text-yellow-300">
            {unavailable.length} card{unavailable.length !== 1 ? "s" : ""} with no price data
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {unavailable.slice(0, 20).map((c) => (
              <span key={c.id} className="rounded bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">{c.sku}</span>
            ))}
            {unavailable.length > 20 && <span className="text-xs text-yellow-500">+{unavailable.length - 20} more</span>}
          </div>
        </div>
      )}

      {/* Price table */}
      <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Card #</th>
              <th className="px-4 py-3 font-medium">Set</th>
              <th className="px-4 py-3 font-medium text-right">JPY</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium">Last Synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {available.map((card) => (
              <tr key={card.id} className="hover:bg-[#12121a]">
                <td className="px-4 py-3 font-mono text-xs">{card.sku}</td>
                <td className="px-4 py-3">{card.cardNumber}</td>
                <td className="px-4 py-3 text-gray-400">{card.setCode ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-400">¥{card.cardrushJpy?.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {editingId === card.id ? (
                    <span className="inline-flex gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-20 rounded border border-[#1e1e2e] bg-gray-800 px-2 py-0.5 text-right text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") savePrice(card.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button onClick={() => savePrice(card.id)} className="text-xs text-green-400">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">Cancel</button>
                    </span>
                  ) : (
                    <span
                      onClick={() => { setEditingId(card.id); setEditPrice(String(card.price ?? 0)); }}
                      className="cursor-pointer font-medium hover:text-brand-500 transition"
                    >
                      £{(card.price ?? 0).toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {card.lastSyncedAt ? new Date(card.lastSyncedAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

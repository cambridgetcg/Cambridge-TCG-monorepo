"use client";

import { useState, useEffect, useCallback } from "react";

interface Tier {
  id: number;
  priceMin: number;
  priceMax: number;
  targetQty: number;
}

export default function StockTargetsPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ priceMin: "", priceMax: "", targetQty: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchTiers = useCallback(async () => {
    const res = await fetch("/api/admin/stock-targets");
    const data = await res.json();
    setTiers(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTiers(); }, [fetchTiers]);

  function startEdit(tier: Tier) {
    setEditing(tier.id);
    setForm({
      priceMin: String(tier.priceMin),
      priceMax: String(tier.priceMax),
      targetQty: String(tier.targetQty),
    });
  }

  function startAdd() {
    setAdding(true);
    const lastMax = tiers.length > 0 ? tiers[tiers.length - 1].priceMax : 0;
    setForm({ priceMin: String(lastMax), priceMax: "", targetQty: "" });
  }

  async function saveEdit() {
    setSaving(true);
    await fetch("/api/admin/stock-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing,
        priceMin: Number(form.priceMin),
        priceMax: Number(form.priceMax),
        targetQty: Number(form.targetQty),
      }),
    });
    setEditing(null);
    setSaving(false);
    fetchTiers();
  }

  async function saveNew() {
    setSaving(true);
    await fetch("/api/admin/stock-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceMin: Number(form.priceMin),
        priceMax: Number(form.priceMax),
        targetQty: Number(form.targetQty),
      }),
    });
    setAdding(false);
    setSaving(false);
    fetchTiers();
  }

  async function deleteTier(id: number) {
    await fetch("/api/admin/stock-targets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTiers();
  }

  async function loadPreview() {
    setLoadingPreview(true);
    const res = await fetch("/api/admin/stock-targets/preview");
    const data = await res.json();
    setPreview(data);
    setLoadingPreview(false);
  }

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stock Targets</h1>
          <p className="text-sm text-gray-400 mt-1">
            Define target stock levels by card price. To order = target &minus; stock &minus; pending.
          </p>
        </div>
        <button
          onClick={loadPreview}
          disabled={loadingPreview}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50"
        >
          {loadingPreview ? "Loading..." : "Preview To-Order"}
        </button>
      </div>

      {/* Tier config table */}
      <div className="overflow-hidden rounded-lg border border-[#1e1e2e] mb-8">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium">Price Min (&pound;)</th>
              <th className="px-4 py-3 font-medium">Price Max (&pound;)</th>
              <th className="px-4 py-3 font-medium">Target Qty</th>
              <th className="px-4 py-3 font-medium w-40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {tiers.map((tier) => (
              <tr key={tier.id} className="hover:bg-[#12121a]">
                {editing === tier.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={form.priceMin}
                        onChange={(e) => setForm({ ...form, priceMin: e.target.value })}
                        className="w-24 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={form.priceMax}
                        onChange={(e) => setForm({ ...form, priceMax: e.target.value })}
                        className="w-24 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={form.targetQty}
                        onChange={(e) => setForm({ ...form, targetQty: e.target.value })}
                        className="w-20 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="rounded bg-green-900/40 px-3 py-1 text-green-400 text-xs hover:bg-green-900/60 transition"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded bg-gray-800 px-3 py-1 text-gray-400 text-xs hover:bg-gray-700 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono">&pound;{tier.priceMin.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">&pound;{tier.priceMax.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-brand-400">{tier.targetQty}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(tier)}
                          className="rounded bg-blue-900/40 px-3 py-1 text-blue-400 text-xs hover:bg-blue-900/60 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTier(tier.id)}
                          className="rounded bg-red-900/40 px-3 py-1 text-red-400 text-xs hover:bg-red-900/60 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {adding && (
              <tr className="bg-[#12121a]">
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={form.priceMin}
                    onChange={(e) => setForm({ ...form, priceMin: e.target.value })}
                    className="w-24 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={form.priceMax}
                    onChange={(e) => setForm({ ...form, priceMax: e.target.value })}
                    className="w-24 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={form.targetQty}
                    onChange={(e) => setForm({ ...form, targetQty: e.target.value })}
                    className="w-20 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={saveNew}
                      disabled={saving}
                      className="rounded bg-green-900/40 px-3 py-1 text-green-400 text-xs hover:bg-green-900/60 transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setAdding(false)}
                      className="rounded bg-gray-800 px-3 py-1 text-gray-400 text-xs hover:bg-gray-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!adding && (
        <button
          onClick={startAdd}
          className="rounded border border-dashed border-[#1e1e2e] px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-brand-500 transition mb-8"
        >
          + Add Tier
        </button>
      )}

      {/* Preview: cards that need ordering */}
      {preview && <ToOrderPreview rows={preview} />}
    </div>
  );
}

interface PreviewRow {
  cardId: number;
  cardNumber: string;
  name: string | null;
  setCode: string | null;
  imageUrl: string | null;
  price: number;
  stock: number;
  pendingStock: number;
  targetQty: number;
  toOrder: number;
}

function ToOrderPreview({ rows }: { rows: PreviewRow[] }) {
  const totalToOrder = rows.reduce((s, r) => s + r.toOrder, 0);
  const cardsNeedingOrder = rows.filter((r) => r.toOrder > 0);

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">
        To-Order Preview
        <span className="ml-2 text-sm font-normal text-gray-400">
          {cardsNeedingOrder.length} cards, {totalToOrder} total qty
        </span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-3 py-3 font-medium w-10"></th>
              <th className="px-3 py-3 font-medium">Card</th>
              <th className="hidden md:table-cell px-3 py-3 font-medium">Set</th>
              <th className="px-3 py-3 font-medium text-right">Price</th>
              <th className="px-3 py-3 font-medium text-right">Stock</th>
              <th className="px-3 py-3 font-medium text-right">Pending</th>
              <th className="px-3 py-3 font-medium text-right">Target</th>
              <th className="px-3 py-3 font-medium text-right">To Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {cardsNeedingOrder.map((r) => (
              <tr key={r.cardId} className="hover:bg-[#12121a]">
                <td className="px-3 py-1">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt={r.cardNumber} className="h-10 w-auto rounded" loading="lazy" />
                  ) : (
                    <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-brand-500">{r.cardNumber}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.name || "\u2014"}</div>
                </td>
                <td className="hidden md:table-cell px-3 py-3 text-gray-400">{r.setCode || "\u2014"}</td>
                <td className="px-3 py-3 text-right text-gray-400">&pound;{r.price.toFixed(2)}</td>
                <td className="px-3 py-3 text-right">
                  <span className={r.stock > 0 ? "text-green-400" : "text-gray-500"}>{r.stock}</span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className={r.pendingStock > 0 ? "text-yellow-400" : "text-gray-500"}>{r.pendingStock}</span>
                </td>
                <td className="px-3 py-3 text-right text-brand-400 font-bold">{r.targetQty}</td>
                <td className="px-3 py-3 text-right">
                  <span className="font-bold text-yellow-400">{r.toOrder}</span>
                </td>
              </tr>
            ))}
            {cardsNeedingOrder.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  All cards are at or above target stock levels.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

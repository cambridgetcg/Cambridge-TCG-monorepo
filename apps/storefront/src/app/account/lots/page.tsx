"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Audience, Money } from "@/lib/ui";
interface MyLot {
  id: string;
  title: string;
  price: string;
  status: string;
  item_count: number;
  total_quantity: number;
  created_at: string;
}

interface LotItem { sku: string; cardName?: string; quantity: number }

export default function MyLotsPage() {
  const [myLots, setMyLots] = useState<MyLot[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [items, setItems] = useState<LotItem[]>([{ sku: "", cardName: "", quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    if (!session?.user?.id) { setLoading(false); return; }
    const r = await fetch(`/api/market/lots?seller=${session.user.id}&status=active&limit=50`);
    if (r.ok) {
      const d = await r.json();
      setMyLots(d.lots || []);
    }
    // Also load sold + cancelled for full history
    const r2 = await fetch(`/api/market/lots?seller=${session.user.id}&status=sold&limit=50`);
    if (r2.ok) {
      const d = await r2.json();
      setMyLots((prev) => [...prev, ...(d.lots || [])]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function addItem() { setItems((p) => [...p, { sku: "", cardName: "", quantity: 1 }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, j) => j !== i)); }
  function updateItem(i: number, patch: Partial<LotItem>) {
    setItems((p) => p.map((it, j) => j === i ? { ...it, ...patch } : it));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanItems = items
        .map((it) => ({ ...it, sku: it.sku.trim(), quantity: Math.max(1, it.quantity | 0) }))
        .filter((it) => it.sku.length > 0);
      if (cleanItems.length === 0) { setSubmitError("Add at least one card"); return; }
      const res = await fetch("/api/market/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          price: parseFloat(price),
          imageUrl: imageUrl.trim() || undefined,
          items: cleanItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to create lot");
        return;
      }
      // Reset + reload
      setTitle(""); setDescription(""); setPrice(""); setImageUrl("");
      setItems([{ sku: "", cardName: "", quantity: 1 }]);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this lot?")) return;
    const res = await fetch(`/api/market/lots/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const d = await res.json();
      alert(d.error || "Failed");
    }
  }

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-display font-semibold text-ink mb-6">My Lots</h1>

      {/* Builder */}
      <section className="bg-surface rounded-lg p-5 mb-8">
        <h2 className="text-sm font-bold text-ink mb-3 uppercase tracking-wide">Build a lot</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Title</label>
            <input
              type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. OP01 Red Luffy Deck (60 cards)"
              className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-faint mb-1">Price (£)</label>
              <input
                type="number" required step="0.01" min="0.01" value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-faint mb-1">Image URL (optional)</label>
              <input
                type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Description (optional)</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-faint mb-1">Cards</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text" placeholder="SKU (e.g. OP-OP01-001-JP-V11D5)" required
                    value={it.sku} onChange={(e) => updateItem(i, { sku: e.target.value })}
                    className="flex-1 px-2 py-1.5 bg-surface-subtle border border-border-subtle rounded text-ink text-xs font-mono"
                  />
                  <input
                    type="text" placeholder="Name (optional)"
                    value={it.cardName} onChange={(e) => updateItem(i, { cardName: e.target.value })}
                    className="flex-1 px-2 py-1.5 bg-surface-subtle border border-border-subtle rounded text-ink text-xs"
                  />
                  <input
                    type="number" min="1" required value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: parseInt(e.target.value, 10) || 1 })}
                    className="w-16 px-2 py-1.5 bg-surface-subtle border border-border-subtle rounded text-ink text-xs"
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-xs text-danger hover:text-danger">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-xs text-accent hover:underline">+ Add card</button>
            </div>
          </div>
          {submitError && <p className="text-xs text-danger">{submitError}</p>}
          <button
            type="submit" disabled={submitting}
            className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Listing..." : "List lot"}
          </button>
        </form>
      </section>

      <h2 className="text-sm font-bold text-ink-muted uppercase tracking-wide mb-3">Your lots</h2>
      {loading ? (
        <p className="text-sm text-ink-faint">Loading...</p>
      ) : myLots.length === 0 ? (
        <p className="text-sm text-ink-faint">No lots yet.</p>
      ) : (
        <div className="bg-surface rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-faint text-xs uppercase border-b border-border-subtle">
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Price</th>
                <th className="text-right p-3">Items</th>
                <th className="text-right p-3">Listed</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {myLots.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle">
                  <td className="p-3">
                    <Link href={`/market/lots/${l.id}`} className="text-ink hover:text-accent transition">
                      {l.title}
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                      l.status === "active" ? "bg-ok/15 text-ok"
                      : l.status === "sold" ? "bg-info/15 text-info"
                      : "bg-surface-subtle text-ink-muted"
                    }`}>{l.status}</span>
                  </td>
                  <td className="p-3 text-right font-mono text-accent"><Money value={parseFloat(l.price)} /></td>
                  <td className="p-3 text-right text-ink-muted text-xs">{l.item_count} cards · {l.total_quantity} units</td>
                  <td className="p-3 text-right text-xs text-ink-faint">
                    {new Date(l.created_at).toLocaleDateString("en-GB")}
                  </td>
                  <td className="p-3 text-right">
                    {l.status === "active" && (
                      <button onClick={() => cancel(l.id)} className="text-xs text-danger hover:text-danger">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

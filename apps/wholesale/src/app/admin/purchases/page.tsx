"use client";

import { useState, useEffect, useCallback } from "react";

interface Purchase {
  id: number;
  remambo_order_id: string;
  supplier: string;
  parcel_id: string | null;
  ordered_at: string;
  shipped_at: string | null;
  received_at: string | null;
  status: string;
  items_total_jpy: number;
  service_fee_jpy: number;
  shipping_jpy: number;
  notes: string | null;
  item_count: number;
  total_qty: number;
  linked_order_items: number;
}

interface PurchaseItem {
  id: number;
  card_id: number;
  order_item_id: number | null;
  condition: string;
  quantity: number;
  unit_price_jpy: number;
  cardrush_url: string | null;
  card_number: string;
  sku: string;
  image_url: string | null;
  card_name: string;
  order_id: number | null;
}

interface ReviewItem {
  id: number;
  purchase_id: number;
  card_id: number;
  condition: string;
  quantity: number;
  unit_price_jpy: number;
  cardrush_url: string | null;
  card_number: string;
  sku: string;
  image_url: string | null;
  card_name: string;
  stock: number;
  pending_stock: number;
  remambo_order_id: string;
  purchase_status: string;
  parcel_id: string | null;
}

const statusColors: Record<string, string> = {
  ordered: "bg-yellow-900/40 text-yellow-400",
  shipped: "bg-blue-900/40 text-blue-400",
  received: "bg-green-900/40 text-green-400",
};

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewActioning, setReviewActioning] = useState<number | null>(null);

  const fetchPurchases = useCallback(async () => {
    const res = await fetch("/api/admin/purchases");
    const data = await res.json();
    setPurchases(data);
    setLoading(false);
  }, []);

  const fetchReview = useCallback(async () => {
    const res = await fetch("/api/admin/purchases/review");
    const data = await res.json();
    setReviewItems(data);
  }, []);

  useEffect(() => { fetchPurchases(); fetchReview(); }, [fetchPurchases, fetchReview]);

  async function handleReviewAction(id: number, action: "approve" | "reject") {
    setReviewActioning(id);
    await fetch("/api/admin/purchases/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setReviewItems((prev) => prev.filter((r) => r.id !== id));
    setReviewActioning(null);
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setItemsLoading(true);
    const res = await fetch(`/api/admin/purchases/${id}`);
    const data = await res.json();
    setItems(data);
    setItemsLoading(false);
  }

  // Summary stats
  const totalJpy = purchases.reduce((s, p) => s + p.items_total_jpy, 0);
  const totalQty = purchases.reduce((s, p) => s + (p.total_qty || 0), 0);

  if (loading) return <div className="text-gray-400">Loading purchases...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <span className="text-sm text-gray-400">
          {purchases.length} orders &middot; {totalQty} items &middot; &yen;{totalJpy.toLocaleString()}
        </span>
      </div>

      <p className="mb-6 text-sm text-gray-500">
        Import a Remambo order: <code className="bg-[#1e1e2e] px-2 py-0.5 rounded text-xs">npx tsx tools/import-remambo-order.ts --order=XXXXXXX</code>
      </p>

      {/* A- Condition Review Panel */}
      {reviewItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-900/50 bg-yellow-900/10">
          <div className="px-4 py-3 border-b border-yellow-900/30">
            <h2 className="text-sm font-bold text-yellow-400">
              Condition Review ({reviewItems.length} items, {reviewItems.reduce((s, r) => s + r.quantity, 0)} qty)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              These A- condition cards need inspection. Approve to count as Mint stock, or reject to remove.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs">
                <th className="px-4 py-2 w-10"></th>
                <th className="px-4 py-2">Card</th>
                <th className="hidden md:table-cell px-4 py-2">Name</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">&yen;/unit</th>
                <th className="hidden sm:table-cell px-4 py-2">Order</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-900/20">
              {reviewItems.map((item) => (
                <tr key={item.id} className="hover:bg-yellow-900/5">
                  <td className="px-4 py-2">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.card_number} className="h-10 w-auto rounded" loading="lazy" />
                    ) : (
                      <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-brand-500">{item.card_number}</div>
                    <div className="text-xs text-gray-500">{item.sku}</div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-2 text-gray-400 text-xs max-w-[200px] truncate">
                    {item.card_name}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-yellow-900/40 text-yellow-400">
                      {item.condition}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 text-right text-gray-400">&yen;{item.unit_price_jpy.toLocaleString()}</td>
                  <td className="hidden sm:table-cell px-4 py-2 text-gray-400 text-xs">
                    {item.remambo_order_id}
                    {item.parcel_id && <span className="ml-1 text-gray-500">({item.parcel_id})</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleReviewAction(item.id, "approve")}
                        disabled={reviewActioning === item.id}
                        className="rounded bg-green-900/40 px-2.5 py-1 text-green-400 text-xs font-medium hover:bg-green-900/60 transition disabled:opacity-30"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewAction(item.id, "reject")}
                        disabled={reviewActioning === item.id}
                        className="rounded bg-red-900/40 px-2.5 py-1 text-red-400 text-xs font-medium hover:bg-red-900/60 transition disabled:opacity-30"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-4">
        {purchases.map((p) => (
          <div key={p.id} className="rounded-lg border border-[#1e1e2e] bg-[#12121a]">
            {/* Purchase header row */}
            <button
              onClick={() => toggleExpand(p.id)}
              className="w-full px-4 py-4 text-left hover:bg-[#1e1e2e]/50 transition"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono font-bold text-brand-500">{p.remambo_order_id}</span>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || "bg-gray-800 text-gray-400"}`}>
                  {p.status}
                </span>
                {p.parcel_id && (
                  <span className="text-xs text-gray-400">Parcel: {p.parcel_id}</span>
                )}
                <span className="ml-auto text-sm text-gray-400">
                  {p.item_count} items ({p.total_qty} qty)
                </span>
                <span className="text-sm font-medium">&yen;{p.items_total_jpy.toLocaleString()}</span>
                <span className="text-gray-500">{expandedId === p.id ? "\u25B2" : "\u25BC"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Ordered: {formatDate(p.ordered_at)}</span>
                <span>Shipped: {formatDate(p.shipped_at)}</span>
                <span>Received: {formatDate(p.received_at)}</span>
                {p.linked_order_items > 0 && (
                  <span className="text-blue-400">{p.linked_order_items} linked to client orders</span>
                )}
                {p.service_fee_jpy > 0 && <span>Fee: &yen;{p.service_fee_jpy}</span>}
                {p.shipping_jpy > 0 && <span>Shipping: &yen;{p.shipping_jpy}</span>}
              </div>
            </button>

            {/* Expanded items */}
            {expandedId === p.id && (
              <div className="border-t border-[#1e1e2e] px-4 py-3">
                {itemsLoading ? (
                  <div className="text-sm text-gray-400">Loading items...</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs">
                        <th className="py-2 pr-3 w-10"></th>
                        <th className="py-2 pr-3">Card</th>
                        <th className="hidden md:table-cell py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Condition</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3 text-right">&yen;/unit</th>
                        <th className="py-2 pr-3 text-right">Subtotal</th>
                        <th className="hidden sm:table-cell py-2 pr-3">Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e2e]">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-3">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.card_number} className="h-8 w-6 rounded object-cover" />
                            ) : (
                              <div className="h-8 w-6 rounded bg-gray-800" />
                            )}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{item.card_number}</td>
                          <td className="hidden md:table-cell py-2 pr-3 text-gray-400 text-xs max-w-[200px] truncate">
                            {item.card_name}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                              item.condition === "Mint"
                                ? "bg-green-900/40 text-green-400"
                                : "bg-yellow-900/40 text-yellow-400"
                            }`}>
                              {item.condition}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">{item.quantity}</td>
                          <td className="py-2 pr-3 text-right text-gray-400">&yen;{item.unit_price_jpy.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right font-medium">
                            &yen;{(item.quantity * item.unit_price_jpy).toLocaleString()}
                          </td>
                          <td className="hidden sm:table-cell py-2 pr-3 text-gray-400 text-xs">
                            {item.order_id ? `#${item.order_id}` : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}

        {purchases.length === 0 && (
          <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-4 py-8 text-center text-gray-500">
            No purchase orders yet. Import one with the CLI tool above.
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import StatusBadge from "@/components/StatusBadge";
import CardThumbnail from "@/components/CardThumbnail";

interface Order {
  id: number;
  clientId: number;
  clientName: string | null;
  clientCompany: string | null;
  status: string;
  total: number;
  volumeDiscount: number;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  clientOrderNumber: string | null;
  stockCheckedAt: string | null;
  channel: string | null;
}

interface OrderItemRow {
  id: number;
  cardId: number;
  cardNumber: string;
  imageUrl: string | null;
  cardrushJpy: number | null;
  cardrushUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stockStatus: string | null;
  removedAt: string | null;
}

interface EditableItem {
  id: number;
  unitPrice: number;
  quantity: number;
  available: boolean;
}

interface NotificationRow {
  id: number;
  orderId: number;
  type: string;
  recipient: string;
  status: string;
  error: string | null;
  sentAt: string | null;
}

const statusFilters = ["all", "submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered", "cancelled"] as const;

const nextAction: Record<string, { label: string; next: string } | null> = {
  submitted: null, // Handled by the quote editor now
  quoted: null, // Handled by the quote editor now
  confirmed: { label: "Mark Paid", next: "paid" },
  paid: { label: "Mark Ordered", next: "ordered" },
  ordered: { label: "Mark Shipped", next: "shipped" },
  shipped: { label: "Mark Delivered", next: "delivered" },
  delivered: null,
  cancelled: null,
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [items, setItems] = useState<Record<number, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(true);

  // Editable state for quote adjustments
  const [editItems, setEditItems] = useState<Record<number, EditableItem[]>>({});
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [notifs, setNotifs] = useState<Record<number, NotificationRow[]>>({});

  const fetchOrders = useCallback(async () => {
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    setOrders(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function toggleExpand(orderId: number) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (!items[orderId]) {
      const res = await fetch(`/api/orders/${orderId}/items`);
      const data: OrderItemRow[] = await res.json();
      setItems((prev) => ({ ...prev, [orderId]: data }));
      // Fetch notification history
      const notifRes = await fetch(`/api/admin/orders/${orderId}/notifications`);
      const notifData: NotificationRow[] = await notifRes.json();
      setNotifs((prev) => ({ ...prev, [orderId]: notifData }));

      // Initialize editable state for submitted/quoted orders
      const order = orders.find((o) => o.id === orderId);
      if ((order?.status === "submitted" || order?.status === "quoted") && !editItems[orderId]) {
        setEditItems((prev) => ({
          ...prev,
          [orderId]: data.map((item) => ({
            id: item.id,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            available: !item.removedAt,
          })),
        }));
      }
    }
  }

  function updateEditItem(orderId: number, itemId: number, field: keyof EditableItem, value: number | boolean) {
    setEditItems((prev) => ({
      ...prev,
      [orderId]: prev[orderId].map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      ),
    }));
  }

  function getEditTotal(orderId: number): number {
    const edits = editItems[orderId];
    if (!edits) return 0;
    return edits
      .filter((e) => e.available)
      .reduce((sum, e) => sum + Math.round(e.unitPrice * e.quantity * 100) / 100, 0);
  }

  async function sendQuote(orderId: number) {
    const edits = editItems[orderId];
    if (!edits) return;
    const order = orders.find((o) => o.id === orderId);
    setSending(true);
    try {
      await fetch(`/api/orders/${orderId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: edits,
          adminNotes: adminNotes[orderId] || "",
        }),
      });
      // Refresh orders and clear edit state
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, status: order?.status === "submitted" ? "quoted" : o.status, total: getEditTotal(orderId) } : o
      ));
      setEditItems((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      setItems((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      setExpandedId(null);
    } finally {
      setSending(false);
    }
  }

  async function confirmOrder(orderId: number) {
    const edits = editItems[orderId];
    if (!edits) return;
    setSending(true);
    try {
      // Save edits + transition to confirmed via status endpoint
      const availableEdits = edits.filter((e) => e.available);
      await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "confirmed",
          items: availableEdits.map((e) => ({ id: e.id, unitPrice: e.unitPrice })),
        }),
      });
      // Update local state
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, status: "confirmed", total: getEditTotal(orderId) } : o
      ));
      setEditItems((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      setItems((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      setExpandedId(null);
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(orderId: number, status: string) {
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
  }

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  if (loading) return <div className="text-gray-400">Loading orders...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Manage Orders</h1>

      {/* Status filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === s
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1 text-gray-500">
                ({orders.filter((o) => o.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-2 md:px-4 py-3 font-medium w-8"></th>
              <th className="px-2 md:px-4 py-3 font-medium">Order #</th>
              <th className="hidden md:table-cell px-4 py-3 font-medium">Client</th>
              <th className="hidden md:table-cell px-4 py-3 font-medium">Date</th>
              <th className="px-2 md:px-4 py-3 font-medium text-right">Total</th>
              <th className="px-2 md:px-4 py-3 font-medium">Status</th>
              <th className="px-2 md:px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {filtered.map((order) => (
              <Fragment key={order.id}>
                <tr className="hover:bg-[#12121a] cursor-pointer" onClick={() => toggleExpand(order.id)}>
                  <td className="px-2 md:px-4 py-3 text-gray-500">{expandedId === order.id ? "\u25BC" : "\u25B6"}</td>
                  <td className="px-2 md:px-4 py-3 font-medium">
                    {order.channel === "shopify-cambridge" && (
                      <span className="mr-1" title="Shopify order">🛒</span>
                    )}
                    #{order.id}
                    {order.clientOrderNumber && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">{order.clientOrderNumber}</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <span>{order.clientName ?? `Client #${order.clientId}`}</span>
                    {order.clientCompany && <span className="ml-1 text-gray-500 text-xs">({order.clientCompany})</span>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-400">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "\u2014"}</td>
                  <td className="px-2 md:px-4 py-3 text-right font-medium">&pound;{order.total.toFixed(2)}</td>
                  <td className="px-2 md:px-4 py-3">
                    <StatusBadge status={order.status} />
                    {order.stockCheckedAt && (
                      <span className="hidden sm:inline ml-2 text-xs text-green-500">
                        Stock verified: {new Date(order.stockCheckedAt).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      {order.status === "submitted" && (
                        <a
                          href={`/admin/orders/${order.id}/stock-check`}
                          className="rounded bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/50 transition"
                        >
                          Check Stock
                        </a>
                      )}
                      {nextAction[order.status] && (
                        <button
                          onClick={() => updateStatus(order.id, nextAction[order.status]!.next)}
                          className="rounded bg-brand-600 px-2 py-1 text-xs font-medium hover:bg-brand-700 transition"
                        >
                          {nextAction[order.status]!.label}
                        </button>
                      )}
                      {!["delivered", "cancelled"].includes(order.status) && (
                        <button
                          onClick={() => updateStatus(order.id, "cancelled")}
                          className="rounded bg-red-900/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-900/50 transition"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded detail — submitted orders get editable quote view */}
                {expandedId === order.id && (
                  <tr>
                    <td colSpan={7} className="bg-[#0e0e16] px-4 md:px-8 py-4">
                      {!items[order.id] ? (
                        <span className="text-gray-500">Loading items...</span>
                      ) : (order.status === "submitted" || order.status === "quoted") && editItems[order.id] ? (
                        /* ── Editable quote view for submitted orders ── */
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-300">
                              {order.status === "quoted" ? "Edit Quote" : "Adjust Quote"}
                            </h3>
                            <span className="text-xs text-gray-500">
                              Edit prices and quantities{order.status === "submitted" ? ", uncheck unavailable items" : ""}
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="py-1 text-left w-8">
                                  <span title="Available">✓</span>
                                </th>
                                <th className="py-1 text-left w-10"></th>
                                <th className="py-1 text-left">Card #</th>
                                <th className="py-1 text-right">CardRush ¥</th>
                                <th className="py-1 text-right">Unit Price (£)</th>
                                <th className="py-1 text-right">Qty</th>
                                <th className="py-1 text-right">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items[order.id].map((item) => {
                                const edit = editItems[order.id].find((e) => e.id === item.id)!;
                                const lineTotal = Math.round(edit.unitPrice * edit.quantity * 100) / 100;
                                return (
                                  <tr
                                    key={item.id}
                                    className={`border-t border-[#1e1e2e] ${!edit.available ? "opacity-40" : ""}`}
                                  >
                                    <td className="py-1">
                                      <input
                                        type="checkbox"
                                        checked={edit.available}
                                        onChange={(e) => updateEditItem(order.id, item.id, "available", e.target.checked)}
                                        className="accent-brand-500"
                                      />
                                    </td>
                                    <td className="py-1">
                                      {item.imageUrl ? (
                                        <CardThumbnail src={item.imageUrl} alt={item.cardNumber} className="h-8 w-auto" />
                                      ) : (
                                        <div className="h-8 w-6 rounded bg-[#1e1e2e]" />
                                      )}
                                    </td>
                                    <td className="py-1 font-mono text-brand-500">{item.cardNumber}</td>
                                    <td className="py-1 text-right text-gray-500">
                                      {item.cardrushJpy != null ? `¥${item.cardrushJpy.toLocaleString()}` : "—"}
                                    </td>
                                    <td className="py-1 text-right">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={edit.unitPrice}
                                        onChange={(e) => updateEditItem(order.id, item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                        disabled={!edit.available}
                                        className="w-20 rounded bg-[#1a1a2e] border border-[#2a2a3e] px-2 py-0.5 text-right text-xs focus:border-brand-500 focus:outline-none disabled:opacity-40"
                                      />
                                    </td>
                                    <td className="py-1 text-right">
                                      <input
                                        type="number"
                                        min="1"
                                        value={edit.quantity}
                                        onChange={(e) => updateEditItem(order.id, item.id, "quantity", parseInt(e.target.value) || 1)}
                                        disabled={!edit.available}
                                        className="w-14 rounded bg-[#1a1a2e] border border-[#2a2a3e] px-2 py-0.5 text-right text-xs focus:border-brand-500 focus:outline-none disabled:opacity-40"
                                      />
                                    </td>
                                    <td className="py-1 text-right font-medium">
                                      {edit.available ? `£${lineTotal.toFixed(2)}` : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-[#2a2a3e]">
                                <td colSpan={6} className="py-2 text-right font-semibold text-gray-300">
                                  Quoted Total:
                                </td>
                                <td className="py-2 text-right font-bold text-green-400">
                                  £{getEditTotal(order.id).toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                          </div>

                          {/* Admin notes */}
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">Admin Notes (internal only)</label>
                            <textarea
                              value={adminNotes[order.id] || ""}
                              onChange={(e) => setAdminNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                              rows={2}
                              className="w-full rounded bg-[#1a1a2e] border border-[#2a2a3e] px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                              placeholder="Internal notes about this order..."
                            />
                          </div>

                          {/* Action buttons */}
                          <div className="flex justify-end gap-2">
                            {order.status === "quoted" ? (
                              <>
                                <button
                                  onClick={() => sendQuote(order.id)}
                                  disabled={sending || editItems[order.id].every((e) => !e.available)}
                                  className="rounded bg-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {sending ? "Updating..." : "Update Quote"}
                                </button>
                                <button
                                  onClick={() => confirmOrder(order.id)}
                                  disabled={sending || editItems[order.id].every((e) => !e.available)}
                                  className="rounded bg-green-700 px-4 py-2 text-sm font-medium hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {sending ? "Confirming..." : "Confirm Order"}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => sendQuote(order.id)}
                                disabled={sending || editItems[order.id].every((e) => !e.available)}
                                className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {sending ? "Sending..." : "Send Quote"}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* ── Read-only items view for non-submitted orders ── */
                        <div className="space-y-3">
                        {/* Stock status summary for quoted+ orders */}
                        {(() => {
                          const orderItems = items[order.id];
                          const removed = orderItems.filter((i) => !!i.removedAt);
                          const outOfStock = orderItems.filter((i) => !i.removedAt && i.stockStatus === "out_of_stock");
                          const partial = orderItems.filter((i) => !i.removedAt && i.stockStatus === "partial");
                          const priceChanged = orderItems.filter((i) => !i.removedAt && i.stockStatus === "price_changed");
                          const hasIssues = removed.length > 0 || outOfStock.length > 0 || partial.length > 0 || priceChanged.length > 0;
                          if (!hasIssues) return null;
                          return (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {removed.length > 0 && (
                                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400 font-medium">
                                  {removed.length} removed
                                </span>
                              )}
                              {outOfStock.length > 0 && (
                                <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-red-400 font-medium">
                                  {outOfStock.length} out of stock
                                </span>
                              )}
                              {partial.length > 0 && (
                                <span className="rounded-full bg-orange-900/30 px-2 py-0.5 text-orange-400 font-medium">
                                  {partial.length} partial
                                </span>
                              )}
                              {priceChanged.length > 0 && (
                                <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-amber-400 font-medium">
                                  {priceChanged.length} price changed
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="py-1 text-left w-10"></th>
                              <th className="py-1 text-left">Card #</th>
                              <th className="py-1 text-right">Unit Price</th>
                              <th className="py-1 text-right">Qty</th>
                              <th className="py-1 text-right">Line Total</th>
                              <th className="py-1 text-left">Stock</th>
                              <th className="py-1 text-left">CardRush</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items[order.id].map((item) => {
                              const isRemoved = !!item.removedAt;
                              const statusColor =
                                isRemoved ? "text-gray-600" :
                                item.stockStatus === "out_of_stock" ? "text-red-400" :
                                item.stockStatus === "partial" ? "text-orange-400" :
                                item.stockStatus === "price_changed" ? "text-amber-400" :
                                item.stockStatus === "in_stock" ? "text-green-500" :
                                "text-gray-600";
                              const statusLabel =
                                isRemoved ? "Removed" :
                                item.stockStatus === "out_of_stock" ? "Out of stock" :
                                item.stockStatus === "partial" ? "Partial" :
                                item.stockStatus === "price_changed" ? "Price changed" :
                                item.stockStatus === "in_stock" ? "In stock" :
                                item.stockStatus ?? "—";
                              const rowBg =
                                isRemoved ? "bg-gray-900/20" :
                                item.stockStatus === "out_of_stock" ? "bg-red-900/10" :
                                item.stockStatus === "partial" ? "bg-orange-900/10" :
                                item.stockStatus === "price_changed" ? "bg-amber-900/10" :
                                "";
                              return (
                              <tr key={item.id} className={`border-t border-[#1e1e2e] ${rowBg} ${isRemoved ? "opacity-40 line-through" : ""}`}>
                                <td className="py-1">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.cardNumber} className="h-8 w-auto rounded" loading="lazy" />
                                  ) : (
                                    <div className="h-8 w-6 rounded bg-[#1e1e2e]" />
                                  )}
                                </td>
                                <td className="py-1 font-mono text-brand-500">{item.cardNumber}</td>
                                <td className="py-1 text-right">&pound;{item.unitPrice.toFixed(2)}</td>
                                <td className="py-1 text-right">{item.quantity}</td>
                                <td className="py-1 text-right font-medium">&pound;{item.lineTotal.toFixed(2)}</td>
                                <td className={`py-1 text-left font-medium ${statusColor}`}>{statusLabel}</td>
                                <td className="py-1 text-left">
                                  {item.cardrushUrl && (
                                    <a href={item.cardrushUrl} target="_blank" rel="noopener noreferrer"
                                       className="text-blue-400 hover:text-blue-300">
                                      Check ↗
                                    </a>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                        </div>
                      )}

                      {/* Notification history */}
                      {notifs[order.id] && notifs[order.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
                          <h4 className="text-xs font-semibold text-gray-400 mb-2">Notification History</h4>
                          <div className="space-y-1">
                            {notifs[order.id].map((n) => (
                              <div key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${n.status === "sent" ? "bg-green-500" : "bg-red-500"}`} />
                                <span className="text-gray-300">
                                  {n.type.replace(/_/g, " ")}
                                </span>
                                <span className="text-gray-500 truncate">{n.recipient}</span>
                                <span className="text-gray-600 ml-auto flex-shrink-0">
                                  {n.sentAt ? new Date(n.sentAt).toLocaleString() : "—"}
                                </span>
                                {n.error && (
                                  <span className="text-red-400 flex-shrink-0" title={n.error}>error</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

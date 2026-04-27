"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import StatusBadge from "@/components/StatusBadge";

interface ClientRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  currentMonthSpend: number;
  priorMonthSpend: number;
  volumeDiscountPct: number;
}

interface OrderRow {
  id: number;
  status: string;
  total: number;
  createdAt: string | null;
}

export default function AdminClientsPage() {
  const [clientsList, setClients] = useState<ClientRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [clientOrders, setClientOrders] = useState<Record<number, OrderRow[]>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDiscount, setEditDiscount] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", company: "", password: "" });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    const res = await fetch("/api/admin/clients");
    const data = await res.json();
    setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  async function toggleExpand(clientId: number) {
    if (expandedId === clientId) { setExpandedId(null); return; }
    setExpandedId(clientId);
    if (!clientOrders[clientId]) {
      const res = await fetch(`/api/admin/clients/${clientId}/orders`);
      const data = await res.json();
      setClientOrders((prev) => ({ ...prev, [clientId]: data }));
    }
  }

  async function saveDiscount(clientId: number) {
    const pct = parseFloat(editDiscount) / 100;
    if (isNaN(pct) || pct < 0 || pct > 1) return;
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumeDiscountPct: pct }),
    });
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, volumeDiscountPct: pct } : c)));
    setEditingId(null);
  }

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const data = await res.json();
      setFormError(data.error || "Failed to create client");
      return;
    }
    setShowAddForm(false);
    setFormData({ name: "", email: "", company: "", password: "" });
    fetchClients();
  }

  if (loading) return <div className="text-gray-400">Loading clients...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Client Management</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition"
        >
          {showAddForm ? "Cancel" : "Add Client"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={addClient} className="mb-6 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <input
              required placeholder="Name" value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              required type="email" placeholder="Email" value={formData.email}
              onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
              className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              placeholder="Company (optional)" value={formData.company}
              onChange={(e) => setFormData((f) => ({ ...f, company: e.target.value }))}
              className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              required type="password" placeholder="Password" value={formData.password}
              onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
              className="rounded border border-[#1e1e2e] bg-gray-800 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}
          <button type="submit" className="mt-4 rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition">
            Create Client
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium text-right">Current Month</th>
              <th className="px-4 py-3 font-medium text-right">Prior Month</th>
              <th className="px-4 py-3 font-medium text-right">Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {clientsList.map((client) => (
              <Fragment key={client.id}>
                <tr className="hover:bg-[#12121a] cursor-pointer" onClick={() => toggleExpand(client.id)}>
                  <td className="px-4 py-3 text-gray-500">{expandedId === client.id ? "\u25BC" : "\u25B6"}</td>
                  <td className="px-4 py-3 font-medium">{client.name}</td>
                  <td className="px-4 py-3 text-gray-400">{client.email}</td>
                  <td className="px-4 py-3 text-gray-400">{client.company || "\u2014"}</td>
                  <td className="px-4 py-3 text-right">\u00A3{client.currentMonthSpend.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">\u00A3{client.priorMonthSpend.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {editingId === client.id ? (
                      <span className="inline-flex gap-1 items-center">
                        <input
                          type="number" step="1" min="0" max="100"
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                          className="w-16 rounded border border-[#1e1e2e] bg-gray-800 px-2 py-0.5 text-right text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDiscount(client.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <span className="text-xs text-gray-500">%</span>
                        <button onClick={() => saveDiscount(client.id)} className="text-xs text-green-400">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">Cancel</button>
                      </span>
                    ) : (
                      <span
                        onClick={() => { setEditingId(client.id); setEditDiscount(String(Math.round(client.volumeDiscountPct * 100))); }}
                        className="cursor-pointer font-medium text-green-400 hover:text-green-300 transition"
                      >
                        {(client.volumeDiscountPct * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
                {expandedId === client.id && (
                  <tr>
                    <td colSpan={7} className="bg-[#0e0e16] px-8 py-4">
                      <h4 className="mb-2 text-xs font-medium text-gray-400">Order History</h4>
                      {clientOrders[client.id] ? (
                        clientOrders[client.id].length > 0 ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="py-1 text-left">Order #</th>
                                <th className="py-1 text-left">Date</th>
                                <th className="py-1 text-left">Status</th>
                                <th className="py-1 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientOrders[client.id].map((order) => (
                                <tr key={order.id} className="border-t border-[#1e1e2e]">
                                  <td className="py-1">#{order.id}</td>
                                  <td className="py-1 text-gray-400">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "\u2014"}</td>
                                  <td className="py-1"><StatusBadge status={order.status} /></td>
                                  <td className="py-1 text-right font-medium">\u00A3{order.total.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-gray-500">No orders yet</p>
                        )
                      ) : (
                        <p className="text-xs text-gray-500">Loading...</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { formatPrice } from "@/lib/format";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface OGClaim {
  id: string;
  email: string;
  platform: string;
  order_ref: string | null;
  platform_username: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
};

const PLATFORM_LABELS: Record<string, string> = {
  ebay: "🏷️ eBay",
  cardmarket: "🃏 Cardmarket",
  shopify: "🛒 Shopify",
  etsy: "🧵 Etsy",
  instore: "🏪 In-Store",
  other: "📦 Other",
};

export default function AdminOGPage() {
  const [claims, setClaims] = useState<OGClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string | null>("pending");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    const url = filter ? `/api/og/claim?status=${filter}` : "/api/og/claim";
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setClaims(data.claims || []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  async function handleAction(claimId: string, action: "approve" | "reject") {
    setProcessing(claimId);
    await fetch("/api/og/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, claimId, adminNotes: adminNotes[claimId] || "" }),
    });
    setProcessing(null);
    fetchClaims();
  }

  const pending = claims.filter(c => c.status === "pending").length;
  const approved = claims.filter(c => c.status === "approved").length;

  return (
    <AdminShell
      title="OG Claims"
      authProbe="/api/og/claim"
      actions={
        <button onClick={fetchClaims} disabled={loading} className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition">
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-white">{claims.length}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{pending}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase">Approved</p>
            <p className="text-2xl font-bold text-emerald-400">{approved}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {[{ v: "pending", l: "Pending" }, { v: null, l: "All" }, { v: "approved", l: "Approved" }, { v: "rejected", l: "Rejected" }].map(f => (
            <button key={f.l} onClick={() => setFilter(f.v)}
              className={`px-4 py-2 text-sm rounded-lg transition ${filter === f.v ? "bg-amber-500 text-black font-bold" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}>
              {f.l}
            </button>
          ))}
        </div>

        {/* Claims */}
        <div className="space-y-3">
          {claims.map(claim => (
            <div key={claim.id} className="bg-neutral-900 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-white font-medium">{claim.email}</p>
                  <p className="text-xs text-neutral-500">
                    {PLATFORM_LABELS[claim.platform] || claim.platform} · {new Date(claim.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[claim.status] || "bg-neutral-700 text-neutral-300"}`}>
                  {claim.status}
                </span>
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 text-sm mb-3">
                {claim.order_ref && (
                  <div><span className="text-neutral-500">Order ref:</span> <span className="text-white">{claim.order_ref}</span></div>
                )}
                {claim.platform_username && (
                  <div><span className="text-neutral-500">Username:</span> <span className="text-white">{claim.platform_username}</span></div>
                )}
              </div>

              {claim.notes && (
                <p className="text-sm text-neutral-400 mb-3 bg-neutral-800 rounded-lg px-3 py-2">{claim.notes}</p>
              )}

              {claim.status === "pending" && (
                <div className="space-y-3 pt-3 border-t border-neutral-800">
                  <input
                    type="text"
                    placeholder="Admin notes (optional)"
                    value={adminNotes[claim.id] || ""}
                    onChange={(e) => setAdminNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAction(claim.id, "approve")}
                      disabled={processing === claim.id}
                      className="flex-1 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                    >
                      {processing === claim.id ? "..." : "✓ Approve OG"}
                    </button>
                    <button
                      onClick={() => handleAction(claim.id, "reject")}
                      disabled={processing === claim.id}
                      className="flex-1 py-2 bg-red-500/20 text-red-400 text-sm font-bold rounded-lg hover:bg-red-500/30 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {claim.status === "approved" && claim.reviewed_at && (
                <p className="text-xs text-emerald-400 mt-2">Approved {new Date(claim.reviewed_at).toLocaleDateString("en-GB")}</p>
              )}
            </div>
          ))}

          {claims.length === 0 && !loading && (
            <p className="text-neutral-500 text-center py-12">No claims found.</p>
          )}
        </div>
    </AdminShell>
  );
}

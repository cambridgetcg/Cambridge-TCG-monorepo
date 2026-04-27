"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import AdminShell from "@/components/admin/AdminShell";

interface Stats {
  windowDays: number;
  paidCount: number;
  tradeCount: number;
  auctionCount: number;
  paidTotalGbp: number;
  commissionTotalGbp: number;
  avgTurnaroundHours: number;
}

interface Balance {
  available: { currency: string; amount: number }[];
  pending: { currency: string; amount: number }[];
}

interface OutstandingRow {
  kind: "trade" | "auction";
  id: string;
  label: string;
  amount: number | string;
  seller_email: string;
  seller_name: string | null;
  has_connect: boolean;
  connect_ready: boolean;
  connect_status: string | null;
  available_at: string;
  dueNow: boolean;
  payout_hold_days: number | null;
}

interface HistoryRow {
  kind: "trade" | "auction";
  id: string;
  seller_paid_at: string;
  payout_method: string | null;
  payout_reference: string | null;
  stripe_transfer_id: string | null;
  amount: number | string;
  label: string;
  seller_email: string;
}

type Tab = "outstanding" | "history";

export default function AdminPayoutsPage() {
  const [tab, setTab] = useState<Tab>("outstanding");

  const [stats, setStats] = useState<Stats | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [outstanding, setOutstanding] = useState<{ rows: OutstandingRow[]; totalOwedGbp: number; overdueCount: number } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, balanceRes, outstandingRes, historyRes] = await Promise.all([
        fetch("/api/admin/payouts/stats?days=7"),
        fetch("/api/admin/payouts/balance"),
        fetch("/api/admin/payouts/outstanding"),
        fetch("/api/admin/payouts/history?limit=100"),
      ]);
      if (statsRes.ok)       setStats(await statsRes.json());
      if (balanceRes.ok)     setBalance(await balanceRes.json());
      if (outstandingRes.ok) setOutstanding(await outstandingRes.json());
      if (historyRes.ok)     setHistory((await historyRes.json()).history || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function payViaConnect(row: OutstandingRow) {
    const endpoint = row.kind === "trade"
      ? `/api/market/trades/${row.id}/payout`
      : `/api/auctions/${row.id}/payout`;
    setPaying(row.id);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "stripe_connect" }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Payout failed");
        return;
      }
      await load();
    } finally {
      setPaying(null);
    }
  }

  async function recordManual(row: OutstandingRow) {
    const method = window.prompt(
      "Method (bank_transfer / paypal / crypto / store_credit / other):",
      "bank_transfer"
    );
    if (!method || method === "stripe_connect") return;
    const reference = window.prompt("Reference (optional):") ?? "";
    const endpoint = row.kind === "trade"
      ? `/api/market/trades/${row.id}/payout`
      : `/api/auctions/${row.id}/payout`;
    setPaying(row.id);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error || "Failed"); return; }
      await load();
    } finally {
      setPaying(null);
    }
  }

  const gbpAvailable = balance?.available.find((b) => b.currency === "gbp")?.amount ?? 0;
  const gbpPending = balance?.pending.find((b) => b.currency === "gbp")?.amount ?? 0;

  return (
    <AdminShell
      title="Payouts"
      authProbe="/api/admin/payouts/outstanding"
      actions={
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {/* Top tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Tile label="Stripe available" value={formatPrice(gbpAvailable)} accent="emerald" />
          <Tile label="Stripe pending" value={formatPrice(gbpPending)} accent="neutral" />
          <Tile label="Paid (7d)" value={formatPrice(stats?.paidTotalGbp ?? 0)}
                sub={`${stats?.paidCount ?? 0} payouts`} accent="amber" />
          <Tile label="Commission (7d)" value={formatPrice(stats?.commissionTotalGbp ?? 0)}
                sub={`${stats?.avgTurnaroundHours ? `${stats.avgTurnaroundHours.toFixed(1)}h turnaround` : ""}`}
                accent="purple" />
        </div>

        {/* Balance warning */}
        {outstanding && outstanding.totalOwedGbp > gbpAvailable && gbpAvailable > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 text-sm text-red-300">
            Outstanding payouts ({formatPrice(outstanding.totalOwedGbp)}) exceed available Stripe balance ({formatPrice(gbpAvailable)}).
            Some Connect transfers will fail until the balance is topped up.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6 w-fit">
          <TabButton active={tab === "outstanding"} onClick={() => setTab("outstanding")}>
            Outstanding {outstanding && outstanding.rows.length > 0 ? `(${outstanding.rows.length})` : ""}
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => setTab("history")}>
            History
          </TabButton>
        </div>

        {tab === "outstanding" && (
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            {!outstanding || outstanding.rows.length === 0 ? (
              <p className="p-8 text-center text-neutral-500 text-sm">No outstanding payouts.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-800">
                    <th className="text-left p-3">Kind</th>
                    <th className="text-left p-3">Item</th>
                    <th className="text-left p-3">Seller</th>
                    <th className="text-left p-3">Connect</th>
                    <th className="text-left p-3">Available</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {outstanding.rows.map((row) => (
                    <tr key={`${row.kind}:${row.id}`}
                        className={`border-b border-neutral-800/50 ${row.dueNow ? "" : "opacity-60"}`}>
                      <td className="p-3 text-neutral-400">{row.kind}</td>
                      <td className="p-3 text-white truncate max-w-[220px]">{row.label}</td>
                      <td className="p-3 text-neutral-300 truncate max-w-[160px]">
                        {row.seller_name || row.seller_email}
                      </td>
                      <td className="p-3">
                        {row.connect_ready ? (
                          <span className="text-xs text-emerald-400">✓ Ready</span>
                        ) : row.has_connect ? (
                          <span className="text-xs text-amber-400">{row.connect_status || "incomplete"}</span>
                        ) : (
                          <span className="text-xs text-neutral-500">Not connected</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-neutral-500">
                        {row.dueNow
                          ? <span className="text-amber-400 font-medium">now</span>
                          : new Date(row.available_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="p-3 text-right font-mono text-white">
                        {formatPrice(Number(row.amount))}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {row.connect_ready && (
                            <button
                              onClick={() => payViaConnect(row)}
                              disabled={paying === row.id}
                              className="px-2 py-1 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 disabled:opacity-50"
                            >
                              {paying === row.id ? "..." : "Pay via Connect"}
                            </button>
                          )}
                          <button
                            onClick={() => recordManual(row)}
                            disabled={paying === row.id}
                            className="px-2 py-1 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 disabled:opacity-50"
                          >
                            Manual
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {outstanding && (
              <div className="p-3 border-t border-neutral-800 flex items-center justify-between text-xs">
                <span className="text-neutral-500">
                  {outstanding.overdueCount} overdue &middot; {outstanding.rows.length} total
                </span>
                <span className="text-white font-mono">
                  Owed: <span className="text-amber-400 font-bold">{formatPrice(outstanding.totalOwedGbp)}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            <div className="flex justify-end mb-3">
              <a
                href="/api/admin/payouts/export"
                download
                className="px-3 py-1.5 bg-neutral-800 text-xs text-neutral-300 rounded-lg hover:bg-neutral-700 transition"
              >
                Export CSV (90d)
              </a>
            </div>
            <div className="bg-neutral-900 rounded-xl overflow-hidden">
              {history.length === 0 ? (
                <p className="p-8 text-center text-neutral-500 text-sm">No payouts recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-800">
                      <th className="text-left p-3">When</th>
                      <th className="text-left p-3">Kind</th>
                      <th className="text-left p-3">Item</th>
                      <th className="text-left p-3">Seller</th>
                      <th className="text-left p-3">Method</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-left p-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={`${h.kind}:${h.id}`} className="border-b border-neutral-800/50">
                        <td className="p-3 text-xs text-neutral-400">
                          {new Date(h.seller_paid_at).toLocaleString("en-GB")}
                        </td>
                        <td className="p-3 text-neutral-400">{h.kind}</td>
                        <td className="p-3 text-white truncate max-w-[200px]">{h.label}</td>
                        <td className="p-3 text-neutral-300 truncate max-w-[160px]">{h.seller_email}</td>
                        <td className="p-3 text-neutral-400">{h.payout_method || "—"}</td>
                        <td className="p-3 text-right font-mono text-white">{formatPrice(Number(h.amount))}</td>
                        <td className="p-3 text-xs font-mono text-neutral-500 truncate max-w-[200px]">
                          {h.stripe_transfer_id || h.payout_reference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
    </AdminShell>
  );
}

function Tile({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent: "emerald" | "amber" | "purple" | "neutral";
}) {
  const accentClass = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    purple: "text-purple-400",
    neutral: "text-neutral-300",
  }[accent];
  return (
    <div className="bg-neutral-900 rounded-xl p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${accentClass}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition ${
        active ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

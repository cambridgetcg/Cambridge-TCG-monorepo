"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface Watch {
  sku: string;
  card_name: string | null;
  image_url: string | null;
  best_bid: string | null;
  best_ask: string | null;
  last_trade_price: string | null;
  created_at: string;
}

interface Alert {
  id: string;
  sku: string;
  threshold_price: string;
  direction: "below" | "above";
  active: boolean;
  last_fired_at: string | null;
  created_at: string;
}

export default function WatchlistPage() {
  const [tab, setTab] = useState<"watches" | "alerts">("watches");
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, a] = await Promise.all([
      fetch("/api/market/watches").then((r) => r.ok ? r.json() : { watches: [] }),
      fetch("/api/market/alerts").then((r) => r.ok ? r.json() : { alerts: [] }),
    ]);
    setWatches(w.watches || []);
    setAlerts(a.alerts || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function unwatch(sku: string) {
    await fetch("/api/market/watches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku }),
    });
    setWatches((p) => p.filter((w) => w.sku !== sku));
  }

  async function deleteAlert(id: string) {
    await fetch(`/api/market/alerts?id=${id}`, { method: "DELETE" });
    setAlerts((p) => p.filter((a) => a.id !== id));
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-6">Watchlist</h1>

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("watches")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "watches" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Cards ({watches.length})
        </button>
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "alerts" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Price alerts ({alerts.length})
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : tab === "watches" ? (
        watches.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-8 text-center">
            <p className="text-neutral-400 text-sm">You haven&rsquo;t watched any cards yet.</p>
            <p className="text-xs text-neutral-500 mt-2">
              Click the star on any card&rsquo;s market page to add it here.
            </p>
          </div>
        ) : (
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-800">
                  <th className="text-left p-3">Card</th>
                  <th className="text-right p-3">Best Bid</th>
                  <th className="text-right p-3">Best Ask</th>
                  <th className="text-right p-3">Last Trade</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {watches.map((w) => (
                  <tr key={w.sku} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                    <td className="p-3">
                      <Link href={`/market/${w.sku}`} className="flex items-center gap-3 group">
                        {w.image_url ? (
                          <img src={w.image_url} alt="" className="w-8 h-11 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-11 bg-neutral-800 rounded" />
                        )}
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate max-w-[180px] group-hover:text-amber-400 transition">
                            {w.card_name || w.sku}
                          </p>
                          <p className="text-[11px] text-neutral-500 font-mono truncate max-w-[180px]">{w.sku}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-400">
                      {w.best_bid ? formatPrice(parseFloat(w.best_bid)) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-red-400">
                      {w.best_ask ? formatPrice(parseFloat(w.best_ask)) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-neutral-300">
                      {w.last_trade_price ? formatPrice(parseFloat(w.last_trade_price)) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => unwatch(w.sku)}
                        className="text-xs text-neutral-500 hover:text-red-400 transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        alerts.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-8 text-center">
            <p className="text-neutral-400 text-sm">No price alerts set.</p>
            <p className="text-xs text-neutral-500 mt-2">
              Set one from any card&rsquo;s market page.
            </p>
          </div>
        ) : (
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-800">
                  <th className="text-left p-3">Card</th>
                  <th className="text-left p-3">Condition</th>
                  <th className="text-right p-3">Threshold</th>
                  <th className="text-right p-3">Last Fired</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-neutral-800/50">
                    <td className="p-3">
                      <Link href={`/market/${a.sku}`} className="text-amber-400 hover:underline text-xs font-mono">
                        {a.sku}
                      </Link>
                    </td>
                    <td className="p-3 text-neutral-300 text-xs">
                      {a.direction === "below" ? "Ask drops to" : "Sells at"}
                    </td>
                    <td className="p-3 text-right font-mono text-white">
                      {formatPrice(parseFloat(a.threshold_price))}
                    </td>
                    <td className="p-3 text-right text-xs text-neutral-500">
                      {a.last_fired_at ? new Date(a.last_fired_at).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => deleteAlert(a.id)}
                        className="text-xs text-neutral-500 hover:text-red-400 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

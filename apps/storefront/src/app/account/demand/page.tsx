"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface DemandRow {
  sku: string;
  cardName: string | null;
  imageUrl: string | null;
  setCode: string | null;
  watchCount: number;
  alertCount: number;
  askDepth: number;
  bestAsk: number | null;
  lastTradePrice: number | null;
  demandScore: number;
  opportunityScore: number;
}

export default function DemandSignalsPage() {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market/demand-signals?limit=60")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRows(d.rows || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-2">Demand signals</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Cards buyers are watching and alerting on, weighted against current ask depth.
        High opportunity = strong demand with thin supply.
      </p>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">No demand data yet.</p>
          <p className="text-xs text-neutral-500 mt-2">
            Signals appear as buyers add cards to watchlists and set price alerts.
          </p>
        </div>
      ) : (
        <div className="bg-neutral-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 text-xs uppercase border-b border-neutral-800">
                <th className="text-left p-3">Card</th>
                <th className="text-right p-3">Watches</th>
                <th className="text-right p-3">Alerts</th>
                <th className="text-right p-3">Ask depth</th>
                <th className="text-right p-3">Best ask</th>
                <th className="text-right p-3">Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                  <td className="p-3">
                    <Link href={`/market/${r.sku}`} className="flex items-center gap-3 group">
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt="" className="w-8 h-11 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-11 bg-neutral-800 rounded" />
                      )}
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate max-w-[200px] group-hover:text-amber-400 transition">
                          {r.cardName || r.sku}
                        </p>
                        {r.setCode && (
                          <p className="text-[11px] text-neutral-500">{r.setCode}</p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="p-3 text-right text-neutral-300 font-mono">{r.watchCount}</td>
                  <td className="p-3 text-right text-amber-400 font-mono">{r.alertCount}</td>
                  <td className="p-3 text-right text-neutral-400 font-mono">
                    {r.askDepth === 0 ? <span className="text-red-400">0</span> : r.askDepth}
                  </td>
                  <td className="p-3 text-right text-neutral-300 font-mono">
                    {r.bestAsk ? formatPrice(r.bestAsk) : "—"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={r.opportunityScore >= 5 ? "text-emerald-400 font-bold"
                                   : r.opportunityScore >= 2 ? "text-amber-400"
                                   : "text-neutral-500"}>
                      {r.opportunityScore.toFixed(1)}
                    </span>
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

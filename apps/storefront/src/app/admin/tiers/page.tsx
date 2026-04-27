"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

interface TierRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  isPaid: boolean;
  minSpend: number;
  perks: {
    cashbackPct: number;
    pointsMultiplier: number;
    tradeinBonusPct: number;
    p2pRate: number | null;
    auctionRate: number | null;
    priorityApproval: boolean;
    storeDiscountPct: number;
  };
  userCount: number;
  totalAnnualSpend: number;
  avgAnnualSpend: number;
  sourceBreakdown: {
    subscription: number;
    manual: number;
    spending: number;
  };
}

const fmt = (n: number) => `£${n.toFixed(2)}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const rate = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

export default function AdminTiersPage() {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tiers");
      if (res.ok) setTiers((await res.json()).tiers || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalUsers = tiers.reduce((s, t) => s + t.userCount, 0);
  const totalSpend = tiers.reduce((s, t) => s + t.totalAnnualSpend, 0);

  return (
    <AdminShell
      title="Membership Tiers"
      subtitle={`${totalUsers.toLocaleString()} users · ${fmt(totalSpend)} total annual spend tracked`}
      authProbe="/api/admin/tiers"
      actions={
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 bg-neutral-800 text-sm text-neutral-300 rounded-lg hover:bg-neutral-700 disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <div className="space-y-3">
            {tiers.map((t) => (
              <div key={t.id} className="bg-neutral-900 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{t.icon}</span>
                      <h2 className="text-lg font-bold text-white">{t.name}</h2>
                      {t.isPaid && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          PAID
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Threshold: {fmt(t.minSpend)} annual spend
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{t.userCount}</p>
                    <p className="text-[11px] text-neutral-500">users</p>
                  </div>
                </div>

                {/* Perks grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Stat label="Cashback" value={pct(t.perks.cashbackPct)} />
                  <Stat label="Berries multiplier" value={`${t.perks.pointsMultiplier}×`} />
                  <Stat label="Trade-in bonus" value={pct(t.perks.tradeinBonusPct)} />
                  <Stat label="Store discount" value={pct(t.perks.storeDiscountPct)} />
                  <Stat label="P2P commission" value={rate(t.perks.p2pRate)} />
                  <Stat label="Auction commission" value={rate(t.perks.auctionRate)} />
                  <Stat label="Priority approval" value={t.perks.priorityApproval ? "Yes" : "No"}
                    accent={t.perks.priorityApproval ? "emerald" : undefined} />
                  <Stat label="Avg annual spend" value={fmt(t.avgAnnualSpend)} />
                </div>

                {/* Source breakdown */}
                <div className="flex items-center gap-3 text-xs text-neutral-500 pt-3 border-t border-neutral-800">
                  <span>Source:</span>
                  <span>spending {t.sourceBreakdown.spending}</span>
                  {t.isPaid && <span>subscription {t.sourceBreakdown.subscription}</span>}
                  <span>manual {t.sourceBreakdown.manual}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </AdminShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "emerald" }) {
  return (
    <div className="bg-neutral-950 rounded-lg p-2.5">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${accent === "emerald" ? "text-emerald-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

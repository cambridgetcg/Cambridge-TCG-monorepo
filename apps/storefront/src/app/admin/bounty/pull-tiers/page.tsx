"use client";

import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface TierRow {
  tier: string;
  display_name: string;
  target_ev_pence: number;
  weekly_global_cap: number | null;
  rarity_weights: Record<string, number>;
  enabled: boolean;
  updated_at: string;
  pulls_this_week: number;
  unresolved_token_holders: number;
  outstanding_tokens: number;
}

interface Exposure {
  reservedCount: number;
  reservedGbp: number;
}

export default function AdminBountyPullTiers() {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [capInputs, setCapInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bounty/pull-tiers");
      if (!res.ok) {
        setError(`Failed to load (HTTP ${res.status})`);
        return;
      }
      const d = await res.json();
      setTiers(d.tiers ?? []);
      setExposure(d.exposure ?? null);
      // seed cap input buffers
      const caps: Record<string, string> = {};
      for (const t of d.tiers ?? []) caps[t.tier] = t.weekly_global_cap == null ? "" : String(t.weekly_global_cap);
      setCapInputs(caps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function patchTier(tier: string, body: { enabled?: boolean; weekly_global_cap?: number | null }) {
    setPending(tier);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bounty/pull-tiers/${tier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Update failed (HTTP ${res.status})`);
        return;
      }
      await fetchData();
    } finally {
      setPending(null);
    }
  }

  async function toggleEnabled(t: TierRow) {
    if (t.enabled) {
      if (!confirm(`Disable ${t.display_name}? Users with tokens won't be able to resolve them until re-enabled.`)) return;
    }
    await patchTier(t.tier, { enabled: !t.enabled });
  }

  async function saveCap(tier: string) {
    const raw = (capInputs[tier] ?? "").trim();
    const val = raw === "" ? null : parseInt(raw, 10);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      setError("Cap must be empty or a non-negative integer.");
      return;
    }
    await patchTier(tier, { weekly_global_cap: val });
  }

  const anyDisabled = tiers.some((t) => !t.enabled);

  return (
    <AdminShell
      title="Bounty Pull Tiers"
      subtitle="Kill-switch and weekly cap per tier. Disabling a tier blocks all pulls until re-enabled — user tokens are preserved."
      authProbe="/api/admin/bounty/pull-tiers"
      actions={
        <button onClick={fetchData} disabled={loading} className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}
        {anyDisabled && (
          <div className="mb-6 bg-amber-900/30 border border-amber-700/50 text-amber-300 rounded-lg px-4 py-3 text-sm">
            One or more tiers are currently disabled. Player tokens for those tiers cannot be opened.
          </div>
        )}

        {/* Inventory exposure */}
        {exposure && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Stat label="Vault items reserved" value={exposure.reservedCount.toString()} />
            <Stat label="£ value tied up in vault" value={`£${exposure.reservedGbp.toFixed(2)}`} />
          </div>
        )}

        {/* Tier table */}
        <div className="space-y-3">
          {tiers.map((t) => {
            const capRaw = capInputs[t.tier] ?? "";
            const capCurrent = t.weekly_global_cap == null ? "" : String(t.weekly_global_cap);
            const capDirty = capRaw !== capCurrent;
            const hitCap = t.weekly_global_cap != null && t.pulls_this_week >= t.weekly_global_cap;

            return (
              <div
                key={t.tier}
                className={`bg-neutral-900 border rounded-xl p-4 flex flex-wrap items-center gap-4 ${
                  t.enabled ? "border-neutral-800" : "border-red-900/50 bg-red-950/20"
                }`}
              >
                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{t.display_name}</span>
                    <code className="text-xs bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{t.tier}</code>
                    {!t.enabled && (
                      <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Disabled
                      </span>
                    )}
                    {hitCap && t.enabled && (
                      <span className="text-xs bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Cap hit
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 font-mono truncate">
                    weights: {Object.entries(t.rarity_weights).map(([r, w]) => `${r} ${(w * 100).toFixed(0)}%`).join(" · ")}
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    EV target: £{(t.target_ev_pence / 100).toFixed(2)} at cost
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-neutral-400 whitespace-nowrap">
                  <div>
                    <div className="text-neutral-600">Pulls / 7d</div>
                    <div className={`font-bold text-white ${hitCap ? "text-amber-400" : ""}`}>
                      {t.pulls_this_week}
                      {t.weekly_global_cap != null && <span className="text-neutral-600"> / {t.weekly_global_cap}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-600">Outstanding tokens</div>
                    <div className="font-bold text-white">{t.outstanding_tokens}</div>
                  </div>
                </div>

                {/* Cap edit */}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="none"
                    value={capRaw}
                    onChange={(e) => setCapInputs((p) => ({ ...p, [t.tier]: e.target.value }))}
                    className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-amber-500"
                    title="Weekly global cap. Leave empty to remove the cap."
                  />
                  <button
                    onClick={() => saveCap(t.tier)}
                    disabled={!capDirty || pending === t.tier}
                    className="text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 rounded px-2 py-1"
                  >
                    Save
                  </button>
                </div>

                {/* Enable/disable */}
                <button
                  onClick={() => toggleEnabled(t)}
                  disabled={pending === t.tier}
                  className={`text-xs font-bold rounded px-4 py-1.5 transition-colors whitespace-nowrap ${
                    t.enabled
                      ? "bg-red-900/50 hover:bg-red-900/80 text-red-300"
                      : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                  }`}
                >
                  {pending === t.tier ? "..." : t.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            );
          })}
        </div>

        {tiers.length === 0 && !loading && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
            No tiers configured.
          </div>
        )}
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 text-white">{value}</p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface Grant {
  id: number;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  tier: string;
  count: number;
  source: string;
  source_reference_id: string | null;
  description: string | null;
  granted_at: string;
}

interface SourceSummary {
  source: string;
  grants: number;
  tokens: number;
}

const SOURCE_OPTIONS = [
  "",
  "pve_milestone",
  "pve_daily",
  "merge_mint",
  "refund_no_stock",
  "manual_admin",
  "promo",
];

const TIER_COLOUR: Record<string, string> = {
  common: "text-neutral-400",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  super_rare: "text-amber-400",
  legendary: "text-fuchsia-400",
};

export default function AdminBountyGrants() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [summary, setSummary] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/admin/bounty/grants", window.location.origin);
      if (emailFilter.trim()) url.searchParams.set("email", emailFilter.trim());
      if (sourceFilter) url.searchParams.set("source", sourceFilter);
      const res = await fetch(url.toString());
      if (res.ok) {
        const d = await res.json();
        setGrants(d.grants ?? []);
        setSummary(d.summary ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [emailFilter, sourceFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AdminShell
      title="Pull-Token Grants"
      subtitle="Audit trail of every pull-token grant: PVE milestones, daily bonuses, merge mints, refunds, manual."
      authProbe="/api/admin/bounty/grants"
      actions={
        <button
          onClick={refresh}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
      {/* Last-7-day summary */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-2">
          Last 7 days, by source
        </h2>
        {summary.length === 0 ? (
          <p className="text-sm text-neutral-500">No grants in the last 7 days.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div key={s.source} className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">{s.source}</div>
                <div className="text-lg font-bold">
                  {s.tokens} <span className="text-xs font-normal text-neutral-500">tokens · {s.grants} grants</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          placeholder="Filter by email substring"
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 flex-1 min-w-[200px]"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "All sources"}</option>
          ))}
        </select>
      </div>

      {/* Grants table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Tier</th>
              <th className="text-right px-3 py-2">Count</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                  No grants match these filters.
                </td>
              </tr>
            )}
            {grants.map((g) => (
              <tr key={g.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">
                  {new Date(g.granted_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="text-neutral-200">{g.user_name || "—"}</div>
                  <div className="text-xs text-neutral-500">{g.user_email}</div>
                </td>
                <td className={`px-3 py-2 font-bold uppercase ${TIER_COLOUR[g.tier] ?? "text-neutral-300"}`}>
                  {g.tier}
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.count}</td>
                <td className="px-3 py-2">
                  <span className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5">
                    {g.source}
                  </span>
                  {g.source_reference_id && (
                    <div className="text-[10px] text-neutral-600 font-mono mt-1 truncate max-w-[180px]">
                      {g.source_reference_id}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-400 text-xs">{g.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

interface Sample {
  jpy: number;
  singles: number;
  sealed: number;
}

interface ChannelRow {
  id: number;
  channel: string;
  label: string;
  description: string | null;
  marginMultiplier: number;
  flatFeeSingles: number;
  flatFeeSealed: number;
  vatMultiplier: number;
  retailMultiplier: number;
  roundTo: number;
  active: boolean;
  samples: Sample[];
}

export default function ChannelPricingPage() {
  const [configs, setConfigs] = useState<ChannelRow[]>([]);
  const [gbpJpyRate, setGbpJpyRate] = useState(190);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    marginMultiplier: "",
    retailMultiplier: "",
    roundTo: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/channel-pricing");
    const data = await res.json();
    setConfigs(data.configs);
    setGbpJpyRate(data.gbpJpyRate);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function startEdit(row: ChannelRow) {
    setEditing(row.channel);
    setForm({
      marginMultiplier: String(row.marginMultiplier),
      retailMultiplier: String(row.retailMultiplier),
      roundTo: String(row.roundTo),
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    await fetch("/api/admin/channel-pricing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: editing,
        marginMultiplier: Number(form.marginMultiplier),
        retailMultiplier: Number(form.retailMultiplier),
        roundTo: Number(form.roundTo),
      }),
    });
    setEditing(null);
    setSaving(false);
    fetchData();
  }

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Channel Pricing</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure pricing multipliers per sales channel. Current rate: 1 GBP = {gbpJpyRate.toFixed(1)} JPY
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium text-right">Margin</th>
              <th className="px-4 py-3 font-medium text-right">Retail &times;</th>
              <th className="px-4 py-3 font-medium text-right">Round</th>
              <th className="px-4 py-3 font-medium text-center">Active</th>
              {[500, 2000, 10000].map((jpy) => (
                <th key={jpy} className="px-4 py-3 font-medium text-right">
                  &yen;{jpy.toLocaleString()}
                </th>
              ))}
              <th className="px-4 py-3 font-medium w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {configs.map((row) => (
              <tr key={row.channel} className="hover:bg-[#12121a]">
                <td className="px-4 py-3 font-mono text-xs text-brand-400">{row.channel}</td>
                <td className="px-4 py-3">
                  <div>{row.label}</div>
                  {row.description && (
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.description}</div>
                  )}
                </td>
                {editing === row.channel ? (
                  <>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={form.marginMultiplier}
                        onChange={(e) => setForm({ ...form, marginMultiplier: e.target.value })}
                        className="w-20 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm text-right focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={form.retailMultiplier}
                        onChange={(e) => setForm({ ...form, retailMultiplier: e.target.value })}
                        className="w-20 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm text-right focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={form.roundTo}
                        onChange={(e) => setForm({ ...form, roundTo: e.target.value })}
                        className="w-20 rounded border border-brand-500 bg-[#0a0a0f] px-2 py-1 text-sm text-right focus:outline-none"
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right font-mono">{row.marginMultiplier.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.retailMultiplier.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.roundTo}</td>
                  </>
                )}
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block h-2 w-2 rounded-full ${row.active ? "bg-green-500" : "bg-gray-600"}`} />
                </td>
                {row.samples.map((s) => (
                  <td key={s.jpy} className="px-4 py-3 text-right font-mono text-xs">
                    &pound;{s.singles.toFixed(2)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  {editing === row.channel ? (
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="rounded bg-green-900/40 px-3 py-1 text-green-400 text-xs hover:bg-green-900/60 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded bg-gray-800 px-3 py-1 text-gray-400 text-xs hover:bg-gray-700 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(row)}
                      className="rounded bg-blue-900/40 px-3 py-1 text-blue-400 text-xs hover:bg-blue-900/60 transition"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview panel */}
      <div className="mt-8 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-6">
        <h2 className="text-lg font-semibold mb-4">Price Comparison Preview</h2>
        <p className="text-xs text-gray-500 mb-4">
          Sample singles prices at current rate ({gbpJpyRate.toFixed(1)} JPY/GBP)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-[#1e1e2e]">
                <th className="pb-2 font-medium">Source JPY</th>
                {configs.filter((c) => c.active).map((c) => (
                  <th key={c.channel} className="pb-2 font-medium text-right">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[500, 2000, 10000].map((jpy, i) => (
                <tr key={jpy} className="border-b border-[#1e1e2e]/50">
                  <td className="py-2 font-mono text-brand-400">&yen;{jpy.toLocaleString()}</td>
                  {configs.filter((c) => c.active).map((c) => (
                    <td key={c.channel} className="py-2 text-right font-mono">
                      &pound;{c.samples[i]?.singles.toFixed(2) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

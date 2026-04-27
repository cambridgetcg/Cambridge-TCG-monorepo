"use client";

import { useState, useEffect, useCallback } from "react";

// ---------- Types ----------

interface RefillCard {
  card_id: number;
  card_number: string;
  card_name: string;
  set_code: string;
  image_url: string | null;
  cardrush_url: string;
  cardrush_jpy: number;
  price_gbp: number;
  stock: number;
  pending_stock: number;
  target_qty: number;
  refill_qty: number;
}

interface SetSummary {
  set_code: string;
  card_count: number;
  total_units: number;
  total_jpy: number;
}

interface HistoryEntry {
  filename: string;
  runAt: string;
  dryRun: boolean;
  submitted: number;
  failed: number;
  totalJpy: number;
  itemCount: number;
  filters: { set: string | null; minPrice: number | null; maxPrice: number | null };
}

type Tier = "all" | "low" | "high";

const TIER_INFO: Record<Tier, { label: string; desc: string }> = {
  all:  { label: "All",  desc: "No price filter" },
  low:  { label: "Low",  desc: "£5–£20 (EMS)" },
  high: { label: "High", desc: "£20–£100 (DHL)" },
};

// ---------- Component ----------

export default function AdminRefillPage() {
  const [tier, setTier] = useState<Tier>("all");
  const [setFilter, setSetFilter] = useState("");
  const [cards, setCards] = useState<RefillCard[]>([]);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async (t: Tier, s: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (t !== "all") params.set("tier", t);
    if (s) params.set("set", s);
    const res = await fetch(`/api/admin/refill?${params}`);
    const data = await res.json();
    setCards(data.cards ?? []);
    setSets(data.sets ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(tier, setFilter); }, [tier, setFilter, fetchData]);

  // Fetch history lazily
  useEffect(() => {
    if (!showHistory) return;
    fetch("/api/admin/refill/history")
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [showHistory]);

  function buildCommand(dryRun: boolean): string {
    const parts = ["npx tsx tools/refill.ts"];
    parts.push(dryRun ? "--dry-run" : "--headed");
    if (setFilter) parts.push(`--set=${setFilter}`);
    if (tier !== "all") parts.push(`--tier=${tier}`);
    return parts.join(" ");
  }

  async function copyCommand(dryRun: boolean) {
    const cmd = buildCommand(dryRun);
    await navigator.clipboard.writeText(cmd);
    setCopied(dryRun ? "dry" : "live");
    setTimeout(() => setCopied(null), 2000);
  }

  const totalUnits = cards.reduce((s, c) => s + c.refill_qty, 0);
  const totalJpy = cards.reduce((s, c) => s + c.refill_qty * c.cardrush_jpy, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Refill Pipeline</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Tier toggle */}
          <div className="flex rounded-lg border border-[#1e1e2e] text-xs">
            {(["all", "low", "high"] as Tier[]).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`px-3 py-1.5 transition ${tier === t ? "bg-brand-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                {TIER_INFO[t].label}
              </button>
            ))}
          </div>
          {/* Set dropdown */}
          <select
            value={setFilter}
            onChange={(e) => setSetFilter(e.target.value)}
            className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">All Sets</option>
            {sets.map((s) => (
              <option key={s.set_code} value={s.set_code}>
                {s.set_code} ({s.card_count} cards, {s.total_units} units)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Cards to Refill</div>
          <div className="text-2xl font-bold">{cards.length}</div>
          <div className="text-xs text-gray-500">unique cards</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Total Units</div>
          <div className="text-2xl font-bold text-yellow-400">{totalUnits.toLocaleString()}</div>
          <div className="text-xs text-gray-500">to order</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Est. Cost</div>
          <div className="text-2xl font-bold text-green-400">&yen;{totalJpy.toLocaleString()}</div>
          <div className="text-xs text-gray-500">CardRush JPY</div>
        </div>
        <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="text-xs text-gray-400">Tier</div>
          <div className="text-sm font-medium text-brand-400 mt-1">{TIER_INFO[tier].desc}</div>
          <div className="text-xs text-gray-500 mt-1">target - stock - pending</div>
        </div>
      </div>

      {/* Set summary chips */}
      {!setFilter && sets.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {sets.map((s) => (
            <button
              key={s.set_code}
              onClick={() => setSetFilter(s.set_code)}
              className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-3 py-2 text-left hover:border-brand-500 transition"
            >
              <div className="text-xs font-bold text-brand-400">{s.set_code}</div>
              <div className="text-xs text-gray-400">
                {s.card_count} cards &middot; {s.total_units} units &middot; &yen;{s.total_jpy.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* CLI command generator */}
      <div className="mb-6 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-400">CLI:</span>
          <code className="flex-1 rounded bg-[#0a0a0f] px-3 py-2 text-xs text-gray-300 font-mono">
            {buildCommand(false)}
          </code>
          <button
            onClick={() => copyCommand(true)}
            className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition"
          >
            {copied === "dry" ? "Copied!" : "Copy Dry Run"}
          </button>
          <button
            onClick={() => copyCommand(false)}
            className="rounded bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-500 transition"
          >
            {copied === "live" ? "Copied!" : "Copy Live Run"}
          </button>
        </div>
      </div>

      {/* Card table */}
      {loading ? (
        <div className="text-gray-400 py-8 text-center">Loading refill data...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
          <table className="w-full text-sm">
            <thead className="bg-[#12121a]">
              <tr className="text-left text-gray-400">
                <th className="px-3 py-3 font-medium w-10"></th>
                <th className="px-3 py-3 font-medium">Card</th>
                <th className="hidden md:table-cell px-3 py-3 font-medium">Set</th>
                <th className="px-3 py-3 font-medium text-right">GBP</th>
                <th className="px-3 py-3 font-medium text-right">JPY</th>
                <th className="px-3 py-3 font-medium text-right">Stock</th>
                <th className="px-3 py-3 font-medium text-right">Pend</th>
                <th className="px-3 py-3 font-medium text-right">Tgt</th>
                <th className="px-3 py-3 font-medium text-right">Refill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {cards.map((c) => (
                <tr key={`${c.card_id}-${c.cardrush_url}`} className="hover:bg-[#12121a]">
                  <td className="px-3 py-1">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.card_number} className="h-10 w-auto rounded" loading="lazy" />
                    ) : (
                      <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={c.cardrush_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-brand-500 hover:underline"
                    >
                      {c.card_number}
                    </a>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{c.card_name || "\u2014"}</div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-400">{c.set_code}</td>
                  <td className="px-3 py-3 text-right text-gray-400">&pound;{c.price_gbp.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-gray-400">&yen;{c.cardrush_jpy.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={c.stock > 0 ? "text-green-400" : "text-gray-500"}>{c.stock}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={c.pending_stock > 0 ? "text-yellow-400" : "text-gray-500"}>{c.pending_stock}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-brand-400 font-bold">{c.target_qty}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-bold text-yellow-400">{c.refill_qty}</span>
                  </td>
                </tr>
              ))}
              {cards.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No shortfalls found. Stock levels are on target.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* History toggle */}
      <div className="mt-8">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          {showHistory ? "Hide" : "Show"} Refill History {showHistory ? "\u25B2" : "\u25BC"}
        </button>

        {showHistory && (
          <div className="mt-4 overflow-hidden rounded-lg border border-[#1e1e2e]">
            <table className="w-full text-sm">
              <thead className="bg-[#12121a]">
                <tr className="text-left text-gray-400">
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Mode</th>
                  <th className="px-3 py-3 font-medium">Filters</th>
                  <th className="px-3 py-3 font-medium text-right">Items</th>
                  <th className="px-3 py-3 font-medium text-right">OK</th>
                  <th className="px-3 py-3 font-medium text-right">Fail</th>
                  <th className="px-3 py-3 font-medium text-right">Total JPY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {history.map((h) => (
                  <tr key={h.filename} className="hover:bg-[#12121a]">
                    <td className="px-3 py-3 text-gray-300 text-xs">
                      {h.runAt ? new Date(h.runAt).toLocaleString() : "\u2014"}
                    </td>
                    <td className="px-3 py-3">
                      {h.dryRun ? (
                        <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">DRY</span>
                      ) : (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">LIVE</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {[
                        h.filters?.set && `set=${h.filters.set}`,
                        h.filters?.minPrice != null && `min=£${h.filters.minPrice}`,
                        h.filters?.maxPrice != null && `max=£${h.filters.maxPrice}`,
                      ].filter(Boolean).join(", ") || "none"}
                    </td>
                    <td className="px-3 py-3 text-right">{h.itemCount}</td>
                    <td className="px-3 py-3 text-right text-green-400">{h.submitted}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={h.failed > 0 ? "text-red-400" : "text-gray-500"}>{h.failed}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-300">&yen;{h.totalJpy.toLocaleString()}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No refill runs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

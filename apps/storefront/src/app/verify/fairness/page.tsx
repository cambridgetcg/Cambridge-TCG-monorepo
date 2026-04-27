"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TierRarity {
  rarity: string;
  expected_pct: number;
  observed: number;
  observed_pct: number;
}

interface TierReport {
  tier: string;
  display_name: string;
  enabled: boolean;
  total_pulls: number;
  rarities: TierRarity[];
  chi_square: number;
  enough_samples: boolean;
}

interface DrawKindRow {
  key: string;
  expected_count: number;
  observed_count: number;
  expected_pct: number;
  observed_pct: number;
}

interface DrawKindReport {
  kind: string;
  draw_count: number;
  slot_total: number;
  rows: DrawKindRow[];
  chi_square: number;
  enough_samples: boolean;
}

interface Response {
  window_days: number;
  min_samples_for_signal: number;
  per_tier: TierReport[];
  per_draw_kind?: DrawKindReport[];
}

const KIND_LABEL: Record<string, string> = {
  pack_open:   "Pack Openings",
  spin_wheel:  "Spin Wheel",
  mystery_box: "Mystery Boxes",
  raffle_draw: "Raffle Draws",
  custom:      "Other Draws",
};

const RARITY_ORDER = ["common", "uncommon", "rare", "super_rare", "legendary"];

export default function FairnessPage() {
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    fetch("/api/verify/fairness")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/verify" className="text-xs text-neutral-500 hover:text-neutral-300">← Verification home</Link>
        <h1 className="text-2xl font-bold mt-2 mb-1">Aggregate Fairness</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Rolled-rarity distribution over the last {data?.window_days ?? 30} days
          vs the published tier weights. Large deviations with small sample
          sizes are normal (shown in grey); we highlight a tier only when
          samples cross {data?.min_samples_for_signal ?? 30}.
        </p>

        {!data ? (
          <p className="text-neutral-500">Loading…</p>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">
                Bounty Pulls — per tier
              </h2>
              {data.per_tier.length === 0 ? (
                <p className="text-neutral-500 text-sm">No tiers configured.</p>
              ) : (
                <div className="space-y-6">
                  {data.per_tier
                    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
                    .map((t) => (
                      <TierCard key={t.tier} tier={t} />
                    ))}
                </div>
              )}
            </section>

            {data.per_draw_kind && data.per_draw_kind.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">
                  Other Weighted Draws
                </h2>
                <p className="text-xs text-neutral-500 mb-4">
                  Packs / boxes / spins have per-draw weights (different pools, different
                  wheels). Expected counts are summed across draws — so a key&apos;s
                  expected total = Σ weight × slots across all draws that contained it.
                </p>
                <div className="space-y-6">
                  {data.per_draw_kind.map((k) => (
                    <DrawKindCard key={k.kind} report={k} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-10 text-xs text-neutral-600 border-t border-neutral-800 pt-6">
          <p className="mb-1">
            <strong className="text-neutral-400">Methodology:</strong> actual
            counts come from the last 30 days of resolved <code>bounty_pulls</code>;
            expected from the current <code>bounty_pull_tiers.rarity_weights</code>.
          </p>
          <p>
            Weights can drift over the window (config changes); this dashboard
            reports current weights. For per-pull verification of historic
            rolls, use the per-pull verifier.
          </p>
        </div>
      </div>
    </main>
  );
}

function tierRank(tier: string): number {
  const order = ["common", "uncommon", "rare", "super_rare", "legendary"];
  return order.indexOf(tier);
}

function TierCard({ tier }: { tier: TierReport }) {
  const sortedRarities = [...tier.rarities].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
  );
  return (
    <section className={`bg-neutral-900 border rounded-xl p-5 ${
      tier.enough_samples ? "border-neutral-800" : "border-neutral-900 opacity-80"
    }`}>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-bold">
          {tier.display_name || tier.tier}
          {!tier.enabled && (
            <span className="ml-2 text-[10px] text-neutral-600 uppercase tracking-wider">disabled</span>
          )}
        </h2>
        <div className="text-xs text-neutral-500">
          {tier.total_pulls} pull{tier.total_pulls === 1 ? "" : "s"}
          {tier.enough_samples && (
            <span className="ml-2 text-neutral-600">χ² = {tier.chi_square.toFixed(2)}</span>
          )}
        </div>
      </div>

      {tier.total_pulls === 0 ? (
        <p className="text-xs text-neutral-500 italic">No pulls in the window.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 uppercase tracking-wider">
              <th className="text-left py-1">Rarity</th>
              <th className="text-right py-1 w-20">Expected</th>
              <th className="text-right py-1 w-20">Observed</th>
              <th className="text-right py-1 w-24">Count</th>
              <th className="text-left py-1 pl-3">Visual</th>
            </tr>
          </thead>
          <tbody>
            {sortedRarities.map((r) => (
              <RarityRow
                key={r.rarity}
                rarity={r}
                signalEnabled={tier.enough_samples}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RarityRow({ rarity, signalEnabled }: { rarity: TierRarity; signalEnabled: boolean }) {
  const deviationPct = rarity.observed_pct - rarity.expected_pct;
  const absDev = Math.abs(deviationPct);
  const warn = signalEnabled && absDev > 0.05;

  return (
    <tr className="border-t border-neutral-800">
      <td className="py-1.5 text-neutral-300 font-mono uppercase">{rarity.rarity}</td>
      <td className="py-1.5 text-right text-neutral-400 font-mono">
        {(rarity.expected_pct * 100).toFixed(1)}%
      </td>
      <td className={`py-1.5 text-right font-mono ${warn ? "text-amber-400" : "text-neutral-300"}`}>
        {(rarity.observed_pct * 100).toFixed(1)}%
      </td>
      <td className="py-1.5 text-right text-neutral-500 font-mono">{rarity.observed}</td>
      <td className="py-1.5 pl-3">
        <DistributionBar expected={rarity.expected_pct} observed={rarity.observed_pct} />
      </td>
    </tr>
  );
}

function DrawKindCard({ report }: { report: DrawKindReport }) {
  return (
    <section className={`bg-neutral-900 border rounded-xl p-5 ${
      report.enough_samples ? "border-neutral-800" : "border-neutral-900 opacity-80"
    }`}>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold">{KIND_LABEL[report.kind] ?? report.kind}</h3>
        <div className="text-xs text-neutral-500">
          {report.draw_count} draw{report.draw_count === 1 ? "" : "s"} · {report.slot_total} slot{report.slot_total === 1 ? "" : "s"}
          {report.enough_samples && (
            <span className="ml-2 text-neutral-600">χ² = {report.chi_square.toFixed(2)}</span>
          )}
        </div>
      </div>

      {report.rows.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">No draws in the window.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 uppercase tracking-wider">
              <th className="text-left py-1">Outcome key</th>
              <th className="text-right py-1 w-24">Expected</th>
              <th className="text-right py-1 w-24">Observed</th>
              <th className="text-right py-1 w-16">Δ</th>
              <th className="text-left py-1 pl-3">Visual</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => {
              const dev = r.observed_pct - r.expected_pct;
              const warn = report.enough_samples && Math.abs(dev) > 0.05;
              return (
                <tr key={r.key} className="border-t border-neutral-800">
                  <td className="py-1.5 text-neutral-300 font-mono truncate max-w-[180px]">{r.key}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-400">
                    {r.expected_count.toFixed(1)}
                  </td>
                  <td className={`py-1.5 text-right font-mono ${warn ? "text-amber-400" : "text-neutral-300"}`}>
                    {r.observed_count}
                  </td>
                  <td className="py-1.5 text-right font-mono text-neutral-500">
                    {(dev * 100).toFixed(1)}pp
                  </td>
                  <td className="py-1.5 pl-3">
                    <DistributionBar expected={r.expected_pct} observed={r.observed_pct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DistributionBar({ expected, observed }: { expected: number; observed: number }) {
  const max = Math.max(expected, observed, 0.01);
  const expPct = (expected / max) * 100;
  const obsPct = (observed / max) * 100;
  return (
    <div className="relative h-4 bg-neutral-950 rounded overflow-hidden">
      {/* Expected (neutral bar) */}
      <div
        className="absolute inset-y-0 left-0 bg-neutral-700"
        style={{ width: `${expPct}%` }}
      />
      {/* Observed (amber line) */}
      <div
        className="absolute inset-y-0 left-0 border-r-2 border-amber-400"
        style={{ width: `${obsPct}%` }}
      />
    </div>
  );
}

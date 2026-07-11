"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface DigestTip {
  id: number;
  root: string;
  chain_hash: string | null;
  leaf_count: number;
  created_at: string;
}

interface OpenAlert {
  kind_group: string;
  chi_square: string;
  sample_size: number;
  alert_date: string;
  raised_at: string;
}

interface AuditSeriesPoint {
  day: string;
  total: number;
  passed: number;
}

interface Failure {
  source: string;
  reason: string | null;
  run_at: string;
}

interface HealthResponse {
  digest: {
    tip: DigestTip | null;
    total: number;
    last_7d: number;
    last_24h: number;
    leaves_7d: number;
  };
  self_audit: {
    lookback_days: number;
    total: number;
    passed: number;
    failed: number;
    recent_failures: Failure[];
    daily_series: AuditSeriesPoint[];
  };
  drift_alerts: {
    open: OpenAlert[];
    raised_30d: number;
  };
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/api/verify/health").then((r) => r.json()).then(setData);
  }, []);

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/verify" className="text-xs text-ink-faint hover:text-ink">← Verification home</Link>
        <h1 className="text-3xl font-bold mt-2 mb-2">Transparency Health</h1>
        <p className="text-sm text-ink-muted mb-10">
          The system&apos;s own view of itself. Digest publish cadence, self-audit pass rate,
          open drift alerts, and chain tip — all aggregate, all public, no auth.
        </p>

        {!data ? (
          <p className="text-ink-faint">Loading…</p>
        ) : (
          <div className="space-y-10">
            <DigestSection data={data.digest} />
            <AuditSection data={data.self_audit} />
            <DriftSection data={data.drift_alerts} />
          </div>
        )}

        <div className="mt-12 text-xs text-ink-faint border-t border-border-subtle pt-6">
          Raw feeds:{" "}
          <Link href="/api/verify/digests" className="text-accent hover:text-accent-strong underline">
            /api/verify/digests
          </Link>
          {" · "}
          <Link href="/api/verify/chain" className="text-accent hover:text-accent-strong underline">
            /api/verify/chain
          </Link>
          {" · "}
          <Link href="/api/verify/health" className="text-accent hover:text-accent-strong underline">
            /api/verify/health
          </Link>
        </div>
      </div>
    </main>
  );
}

function DigestSection({ data }: { data: HealthResponse["digest"] }) {
  const ageMs = data.tip ? Date.now() - new Date(data.tip.created_at).getTime() : null;
  const staleMin = ageMs != null ? Math.floor(ageMs / 60_000) : null;
  const stale = staleMin != null && staleMin > 60; // >1h is suspicious

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Digest Chain</h2>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Total digests" value={data.total} />
        <Stat label="Last 7 days" value={data.last_7d} />
        <Stat label="Last 24 hours" value={data.last_24h} tone={data.last_24h === 0 ? "amber" : "default"} />
      </div>

      {data.tip ? (
        <div className={`rounded-lg border p-4 ${stale ? "border-accent/40 bg-accent-wash" : "border-border-subtle bg-surface"}`}>
          <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">Chain tip</p>
          <Row label="digest id"   value={`#${data.tip.id}`} />
          <Row label="published"   value={`${new Date(data.tip.created_at).toLocaleString()}${staleMin != null ? ` (${staleMin}m ago)` : ""}`} />
          <Row label="leaf count"  value={String(data.tip.leaf_count)} />
          <Row label="root"        value={data.tip.root} mono />
          <Row label="chain_hash"  value={data.tip.chain_hash ?? "(unchained — backfill pending)"} mono />
        </div>
      ) : (
        <p className="text-sm text-ink-faint">No digests published yet.</p>
      )}

      <p className="text-xs text-ink-faint mt-3">
        Save this chain_hash outside Cambridge TCG. Later, confirm that saved
        tip still appears at the same point and recompute the suffix from{" "}
        <Link href="/api/verify/chain" className="text-accent hover:text-accent-strong underline">/api/verify/chain</Link>
        . A missing or changed saved tip exposes a conflicting history relative
        to your copy; the live feed alone cannot rule out a coordinated rewrite.
      </p>
    </section>
  );
}

function AuditSection({ data }: { data: HealthResponse["self_audit"] }) {
  const passRate = data.total > 0 ? data.passed / data.total : 1;
  const passPct = (passRate * 100).toFixed(1);
  const perfect = data.failed === 0 && data.total > 0;

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Self-Audit</h2>
      <p className="text-xs text-ink-faint mb-3">
        Maintenance samples revealed draws and re-runs proof-consistency math
        server-side. This detects implementation or data drift, not biased
        server-side input selection. Pass rate over {data.lookback_days}d:
      </p>

      <div className={`rounded-lg border p-4 mb-4 ${
        perfect ? "border-ok/30 bg-ok/10"
          : data.failed > 0 ? "border-danger/40 bg-danger/10"
          : "border-border-subtle bg-surface"
      }`}>
        <div className="flex items-baseline gap-3">
          <span className={`text-3xl font-bold ${perfect ? "text-ok" : data.failed > 0 ? "text-danger" : "text-ink"}`}>
            {data.total > 0 ? passPct : "—"}%
          </span>
          <span className="text-sm text-ink-muted">
            {data.passed} / {data.total} passed
          </span>
          {data.failed > 0 && (
            <span className="ml-auto text-sm text-danger font-bold">{data.failed} FAILED</span>
          )}
        </div>
      </div>

      {data.daily_series.length > 0 && (
        <DailySparkline points={data.daily_series} />
      )}

      {data.recent_failures.length > 0 && (
        <div className="mt-4 bg-danger/10 border border-danger/30 rounded-lg p-4">
          <h3 className="text-sm font-bold text-danger mb-2">Recent failures</h3>
          <table className="w-full text-xs">
            <tbody>
              {data.recent_failures.map((f, i) => (
                <tr key={i} className="border-t border-border-subtle">
                  <td className="py-1.5 font-mono text-ink-muted">{f.source}</td>
                  <td className="py-1.5 text-danger">{f.reason ?? "unknown"}</td>
                  <td className="py-1.5 text-ink-faint whitespace-nowrap">
                    {new Date(f.run_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DriftSection({ data }: { data: HealthResponse["drift_alerts"] }) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Drift Alerts</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Stat label="Open" value={data.open.length} tone={data.open.length > 0 ? "amber" : "default"} />
        <Stat label="Raised in last 30d" value={data.raised_30d} />
      </div>

      {data.open.length === 0 ? (
        <div className="bg-ok/10 border border-ok/30 rounded-lg p-4 text-sm text-ok">
          ✓ No open drift alerts. Every active (tier, kind) group is within χ² threshold.
        </div>
      ) : (
        <div className="space-y-2">
          {data.open.map((a) => (
            <div key={`${a.alert_date}-${a.kind_group}`} className="bg-accent-wash border border-accent/30 rounded-lg p-4">
              <div className="flex items-baseline gap-3 flex-wrap">
                <code className="font-mono text-accent font-bold text-sm">{a.kind_group}</code>
                <span className="text-xs text-ink-faint">χ² = {a.chi_square}</span>
                <span className="text-xs text-ink-faint">{a.sample_size} samples</span>
                <span className="text-xs text-ink-faint ml-auto">
                  raised {new Date(a.raised_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DailySparkline({ points }: { points: AuditSeriesPoint[] }) {
  // Simple SVG sparkline of daily pass rate (height = 1.0 = 100%)
  const W = 400;
  const H = 40;
  const padding = 2;
  const stepX = (W - padding * 2) / Math.max(1, points.length - 1);
  const y = (rate: number) => H - padding - rate * (H - padding * 2);
  const path = points
    .map((p, i) => {
      const rate = p.total > 0 ? p.passed / p.total : 1;
      const x = padding + i * stepX;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y(rate).toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="bg-surface border border-border-subtle rounded-lg p-3">
      <p className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">
        Daily pass rate, last 7d
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10">
        <path d={path} fill="none" stroke="#34d399" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-lg px-4 py-3">
      <p className="text-[10px] text-ink-faint uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "amber" ? "text-accent" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm py-0.5 gap-4">
      <span className="text-ink-faint shrink-0">{label}</span>
      <span className={`text-ink-muted text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

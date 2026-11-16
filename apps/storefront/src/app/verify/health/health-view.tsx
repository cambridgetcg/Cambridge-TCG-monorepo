// The three sections of /verify/health, rendered from one /api/verify/health
// answer and the time it was read. Kept apart from page.tsx (which fetches)
// so tests can render each state with a fixed clock. No hooks: the client
// page imports it.

import Link from "next/link";
import { auditState, tipLooksStale, tipState } from "./audit-state";

interface DigestTip {
  id: number | string;
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

export interface HealthResponse {
  digest: {
    tip: DigestTip | null;
    total: number;
    last_7d: number;
    last_24h: number;
    leaves_7d: number;
    /** Whether a revealed draw waits for a digest; null or missing is unknown. */
    has_undigested_draws?: boolean | null;
  };
  self_audit: {
    lookback_days: number;
    total: number;
    passed: number;
    failed: number;
    /** Whether there is a revealed draw to sample; null or missing is unknown. */
    has_auditable_draws?: boolean | null;
    /** The latest failures (at most 10) within lookback_days. */
    recent_failures: Failure[];
    daily_series: AuditSeriesPoint[];
  };
  drift_alerts: {
    open: OpenAlert[];
    raised_30d: number;
  };
}

/** `now` is when the answer was read, in milliseconds since the epoch. */
export function HealthView({ data, now }: { data: HealthResponse; now: number }) {
  return (
    <div className="space-y-10">
      <DigestSection data={data.digest} now={now} />
      <AuditSection data={data.self_audit} />
      <DriftSection data={data.drift_alerts} />
    </div>
  );
}

function DigestSection({ data, now }: { data: HealthResponse["digest"]; now: number }) {
  const ageMs = data.tip ? now - new Date(data.tip.created_at).getTime() : null;
  const ageMin = ageMs != null ? Math.floor(ageMs / 60_000) : null;
  const state = tipState(ageMin, data);
  const stale = tipLooksStale(state);
  // No draw waiting means no digest is due, so a quiet day is not a warning.
  const waiting = data.has_undigested_draws !== false;

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Digest Chain</h2>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Total digests" value={data.total} />
        <Stat label="Last 7 days" value={data.last_7d} />
        <Stat label="Last 24 hours" value={data.last_24h} tone={data.last_24h === 0 && waiting ? "amber" : "default"} />
      </div>

      {data.tip ? (
        <div data-tip-state={state} className={`rounded-lg border p-4 ${stale ? "border-accent/40 bg-accent-wash" : "border-border-subtle bg-surface"}`}>
          <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">Chain tip</p>
          <Row label="digest id"   value={`#${data.tip.id}`} />
          <Row label="published"   value={`${new Date(data.tip.created_at).toLocaleString()}${ageMin != null && !Number.isNaN(ageMin) ? ` (${ageMin}m ago)` : ""}`} />
          <Row label="leaf count"  value={String(data.tip.leaf_count)} />
          <Row label="root"        value={data.tip.root} mono />
          <Row label="chain_hash"  value={data.tip.chain_hash ?? "(unchained — backfill pending)"} mono />
        </div>
      ) : (
        <p className="text-sm text-ink-faint">No digests published yet.</p>
      )}

      {data.has_undigested_draws === false && (
        <p className="text-sm text-ink-muted mt-3">
          No revealed draw is waiting for a digest, so no new digest is due.
        </p>
      )}
      {state === "overdue" && (
        <p className="text-sm text-ink-muted mt-3">
          A revealed draw is waiting for a digest, and the newest digest is more than an hour old.
        </p>
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
  const state = auditState(data);
  const days = data.lookback_days;
  const passPct = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : null;

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Self-Audit</h2>
      <p className="text-xs text-ink-faint mb-3">
        Maintenance samples revealed draws and re-runs proof-consistency math
        server-side. This detects implementation or data drift, not biased
        server-side input selection. Results for the last {days} days:
      </p>

      {state === "passing" || state === "failing" ? (
        <div data-audit-state={state} className={`rounded-lg border p-4 mb-4 ${state === "passing" ? "border-ok/30 bg-ok/10" : "border-danger/40 bg-danger/10"}`}>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-3xl font-bold ${state === "passing" ? "text-ok" : "text-danger"}`}>
              {passPct}%
            </span>
            <span className="text-sm text-ink-muted">
              {data.passed} / {data.total} passed
            </span>
            {data.failed > 0 && (
              <span className="ml-auto text-sm text-danger font-bold">{data.failed} FAILED</span>
            )}
          </div>
          {data.has_auditable_draws === false && (
            <p className="text-sm text-ink-muted mt-3">
              There is no revealed draw to sample now, so the self-audit is not
              writing new rows. These results are from earlier runs that are still
              inside the {days}-day window.
            </p>
          )}
        </div>
      ) : (
        <div data-audit-state={state} className={`rounded-lg border p-4 mb-4 ${state === "not-running" ? "border-accent/40 bg-accent-wash" : "border-border-subtle bg-surface"}`}>
          {state === "nothing-to-audit" ? (
            <>
              <p className="font-bold text-ink">Nothing to audit</p>
              <p className="text-sm text-ink-muted mt-1">
                No self-audit was recorded in the last {days} days, and there is no
                revealed draw to sample. Nothing passed and nothing failed.
              </p>
            </>
          ) : state === "not-running" ? (
            <>
              <p className="font-bold text-ink">No self-audit recorded</p>
              <p className="text-sm text-ink-muted mt-1">
                No self-audit was recorded in the last {days} days, although there is
                a revealed draw to sample. The self-audit may not be running.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-ink">No self-audit recorded</p>
              <p className="text-sm text-ink-muted mt-1">
                No self-audit was recorded in the last {days} days.
              </p>
            </>
          )}
        </div>
      )}

      {data.daily_series.length > 0 && (
        <DailySparkline points={data.daily_series} days={days} />
      )}

      {data.recent_failures.length > 0 && (
        <div className="mt-4 bg-danger/10 border border-danger/30 rounded-lg p-4">
          <h3 className="text-sm font-bold text-danger mb-2">
            Failures in the last {days} days{data.recent_failures.length === 10 ? " (latest 10)" : ""}
          </h3>
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
        // Not a pass: a group below the sample floor is skipped, not tested.
        // The numbers are lib/provable-draw/drift.ts's; health-view.test.tsx pins them.
        <div className="bg-surface border border-border-subtle rounded-lg p-4 text-sm text-ink-muted">
          No open drift alerts. The drift check runs daily at 04:00 UTC and tests a
          group (a bounty tier or a draw kind) only when it has at least 200 samples
          in the last 7 days.
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

function DailySparkline({ points, days }: { points: AuditSeriesPoint[]; days: number }) {
  // Simple SVG sparkline of daily pass rate (height = 1.0 = 100%). Drawn in
  // a neutral ink: the line's height carries the rate, not its colour.
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
        Daily pass rate, last {days}d
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 text-ink-muted" aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" }) {
  return (
    <div data-tone={tone} className="bg-surface border border-border-subtle rounded-lg px-4 py-3">
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

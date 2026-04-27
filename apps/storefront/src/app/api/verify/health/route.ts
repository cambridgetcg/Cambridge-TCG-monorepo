import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public transparency health endpoint. Summarises the state of the
// provably-fair observability stack so anyone can see at a glance:
//
//   1. When was the last digest published? (staleness → trouble)
//   2. What's the current chain tip? (externally cacheable)
//   3. How many self-audits have passed / failed lately?
//   4. Any open drift alerts on any group?
//
// Everything is read-only aggregate — exposes nothing identifying.

const AUDIT_LOOKBACK_DAYS = 7;

export async function GET() {
  // Digest cadence: latest + count over lookback
  const digestTip = await query(
    `SELECT id, root, chain_hash, leaf_count, created_at
       FROM fairness_digests
      ORDER BY id DESC LIMIT 1`,
  );
  const digestStats = await query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        COALESCE(SUM(leaf_count) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::int AS leaves_7d
       FROM fairness_digests`,
  );

  // Self-audit pass rate + recent failures
  const auditStats = await query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE all_ok)::int AS passed,
        COUNT(*) FILTER (WHERE NOT all_ok)::int AS failed
       FROM fairness_audits
      WHERE run_at >= NOW() - make_interval(days => $1)`,
    [AUDIT_LOOKBACK_DAYS],
  );
  const recentFailures = await query(
    `SELECT source, subject_id, reason, run_at
       FROM fairness_audits
      WHERE NOT all_ok
      ORDER BY run_at DESC
      LIMIT 10`,
  );

  // Open drift alerts
  const openAlerts = await query(
    `SELECT kind_group, chi_square, sample_size, alert_date, raised_at, summary
       FROM fairness_alerts
      WHERE acknowledged_at IS NULL
      ORDER BY raised_at DESC
      LIMIT 20`,
  );
  const allAlertCount = await query(
    `SELECT COUNT(*)::int AS n FROM fairness_alerts
      WHERE raised_at >= NOW() - INTERVAL '30 days'`,
  );

  // Daily self-audit pass-rate series (for the sparkline / timeline)
  const auditSeries = await query(
    `SELECT date_trunc('day', run_at) AS day,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE all_ok)::int AS passed
       FROM fairness_audits
      WHERE run_at >= NOW() - make_interval(days => $1)
      GROUP BY day
      ORDER BY day ASC`,
    [AUDIT_LOOKBACK_DAYS],
  );

  return NextResponse.json(
    {
      digest: {
        tip: digestTip.rows[0] ?? null,
        total: digestStats.rows[0]?.total ?? 0,
        last_7d: digestStats.rows[0]?.last_7d ?? 0,
        last_24h: digestStats.rows[0]?.last_24h ?? 0,
        leaves_7d: digestStats.rows[0]?.leaves_7d ?? 0,
      },
      self_audit: {
        lookback_days: AUDIT_LOOKBACK_DAYS,
        total: auditStats.rows[0]?.total ?? 0,
        passed: auditStats.rows[0]?.passed ?? 0,
        failed: auditStats.rows[0]?.failed ?? 0,
        recent_failures: recentFailures.rows,
        daily_series: auditSeries.rows,
      },
      drift_alerts: {
        open: openAlerts.rows,
        raised_30d: allAlertCount.rows[0]?.n ?? 0,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

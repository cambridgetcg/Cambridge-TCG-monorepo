import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public transparency health endpoint. Summarises the state of the
// draw-proof observability stack so anyone can see at a glance:
//
//   1. When was the last digest published? (staleness → trouble)
//   2. What's the current chain tip? (externally cacheable)
//   3. How many self-audits have passed / failed lately?
//   4. Any open drift alerts on any group?
//
// Everything returned is aggregate or operational metadata. Internal draw ids
// and alert summaries stay private because they can contain reward-row keys.
//
// Every self-audit figure, the failures list included, covers the last
// AUDIT_LOOKBACK_DAYS days. With no revealed draw to sample, the self-audit
// writes no row and the digest job publishes nothing, so an empty window and
// an old tip are expected; has_auditable_draws and has_undigested_draws let a
// reader tell that from a job that has stopped.

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
  // Whether anything waits for the digest job or the self-audit. Booleans,
  // not counts: low-volume activity counts stay unpublished, as on
  // /api/verify/fairness. The predicates mirror runFairnessDigest
  // (lib/provable-draw/digest.ts) and runFairnessSelfAudit
  // (lib/provable-draw/self-audit.ts), without the self-audit's one-minute
  // age floor.
  const drawPools = await query(
    `SELECT
        (EXISTS (SELECT 1 FROM bounty_pulls
                  WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL)
         OR EXISTS (SELECT 1 FROM verifiable_draws
                  WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL)) AS has_undigested_draws,
        (EXISTS (SELECT 1 FROM bounty_pulls
                  WHERE revealed_at IS NOT NULL AND rng_server_seed IS NOT NULL
                    AND rolled_rarity IS NOT NULL)
         OR EXISTS (SELECT 1 FROM verifiable_draws
                  WHERE revealed_at IS NOT NULL AND server_seed IS NOT NULL
                    AND outcome IS NOT NULL AND outcome ? 'weight_order')) AS has_auditable_draws`,
  );
  const pools = drawPools.rows[0] as { has_undigested_draws?: unknown; has_auditable_draws?: unknown } | undefined;
  // null means unknown, and a reader takes it as neither answer.
  const flag = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

  // Self-audit pass rate + recent failures, over the same window
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
    `SELECT source, reason, run_at
       FROM fairness_audits
      WHERE NOT all_ok
        AND run_at >= NOW() - make_interval(days => $1)
      ORDER BY run_at DESC
      LIMIT 10`,
    [AUDIT_LOOKBACK_DAYS],
  );

  // Open drift alerts
  const openAlerts = await query(
    `SELECT kind_group, chi_square, sample_size, alert_date, raised_at
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
        has_undigested_draws: flag(pools?.has_undigested_draws),
      },
      self_audit: {
        lookback_days: AUDIT_LOOKBACK_DAYS,
        total: auditStats.rows[0]?.total ?? 0,
        passed: auditStats.rows[0]?.passed ?? 0,
        failed: auditStats.rows[0]?.failed ?? 0,
        has_auditable_draws: flag(pools?.has_auditable_draws),
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

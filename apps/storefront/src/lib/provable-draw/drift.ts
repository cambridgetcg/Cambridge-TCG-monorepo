// Daily observed-distribution drift check.
//
// Computes χ² per (kind, group) over a rolling 7-day window. When a
// group's score crosses the threshold with enough samples, we land an
// alert row (idempotent per UTC day) and fire an email to the ADMIN_
// DIGEST_EMAIL recipient.
//
// The threshold is tunable per group — very-low-frequency outcomes
// need a higher bar since χ² naturally inflates with rare categories.
// For now a single threshold works; Phase E's /verify/health page can
// help tune it by showing which groups crossed historically.

import { query } from "@/lib/db";

const WINDOW_DAYS = 7;
const MIN_SAMPLES = 200;
const CHI_SQUARE_THRESHOLD = 30; // deliberately conservative
const UTC_HOUR_WINDOW = 4;       // run once per UTC day at 04:xx

export interface DriftResult {
  ranInWindow: boolean;
  checked: number;
  alertsRaised: number;
  alerts: Array<{
    kindGroup: string;
    chiSquare: number;
    sampleSize: number;
  }>;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW && now.getUTCMinutes() < 2;
}

export async function runFairnessDriftCheck(opts?: { force?: boolean }): Promise<DriftResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, checked: 0, alertsRaised: 0, alerts: [] };
  }

  const result: DriftResult = { ranInWindow: true, checked: 0, alertsRaised: 0, alerts: [] };

  // Bounty pulls per tier — tier weights are the expected distribution.
  const tierRes = await query(
    `SELECT tier, rarity_weights FROM bounty_pull_tiers WHERE enabled = true`,
  );

  for (const tierRow of tierRes.rows) {
    const tier: string = tierRow.tier;
    const weights: Record<string, number> = tierRow.rarity_weights ?? {};
    const obsRes = await query(
      `SELECT rolled_rarity, COUNT(*)::int AS n
         FROM bounty_pulls
        WHERE tier = $1
          AND resolved_at >= NOW() - make_interval(days => $2)
          AND rolled_rarity IS NOT NULL
        GROUP BY rolled_rarity`,
      [tier, WINDOW_DAYS],
    );
    const observed = new Map<string, number>();
    for (const r of obsRes.rows) observed.set(r.rolled_rarity, r.n);
    const total = [...observed.values()].reduce((s, n) => s + n, 0);
    result.checked++;
    if (total < MIN_SAMPLES) continue;

    const chi = computeChiSquare(weights, observed, total);
    if (chi >= CHI_SQUARE_THRESHOLD) {
      const kindGroup = `bounty_pull.${tier}`;
      const raised = await upsertAlert({
        kindGroup,
        chiSquare: chi,
        sampleSize: total,
        summary: summariseTier(tier, weights, observed, total, chi),
      });
      if (raised) {
        result.alertsRaised++;
        result.alerts.push({ kindGroup, chiSquare: chi, sampleSize: total });
      }
    }
  }

  // Verifiable draws per kind — weights vary per draw, so expected is
  // Σ weight × slots across draws (same math as the aggregate dashboard).
  const kindsRes = await query(
    `SELECT DISTINCT kind FROM verifiable_draws
      WHERE revealed_at >= NOW() - make_interval(days => $1)`,
    [WINDOW_DAYS],
  );
  for (const kindRow of kindsRes.rows) {
    const kind: string = kindRow.kind;
    const drawsRes = await query(
      `SELECT weights, outcome, num_slots
         FROM verifiable_draws
        WHERE kind = $1
          AND revealed_at >= NOW() - make_interval(days => $2)
          AND outcome IS NOT NULL`,
      [kind, WINDOW_DAYS],
    );
    const expected = new Map<string, number>();
    const observed = new Map<string, number>();
    let slotTotal = 0;
    for (const draw of drawsRes.rows) {
      const w: Record<string, number> = draw.weights ?? {};
      const n: number = draw.num_slots ?? 1;
      for (const [k, v] of Object.entries(w)) expected.set(k, (expected.get(k) ?? 0) + v * n);
      slotTotal += n;
      const outcome = draw.outcome as { picked?: string; slots?: Array<{ picked: string }> } | null;
      if (!outcome) continue;
      if (outcome.slots) {
        for (const s of outcome.slots) observed.set(s.picked, (observed.get(s.picked) ?? 0) + 1);
      } else if (outcome.picked != null) {
        observed.set(outcome.picked, (observed.get(outcome.picked) ?? 0) + 1);
      }
    }
    result.checked++;
    if (slotTotal < MIN_SAMPLES) continue;

    // Normalise expected into a probability distribution so the same
    // chi-square helper works on both code paths.
    const expectedProb = new Map<string, number>();
    for (const [k, v] of expected) expectedProb.set(k, v / slotTotal);

    const chi = computeChiSquare(Object.fromEntries(expectedProb), observed, slotTotal);
    if (chi >= CHI_SQUARE_THRESHOLD) {
      const kindGroup = kind;
      const raised = await upsertAlert({
        kindGroup,
        chiSquare: chi,
        sampleSize: slotTotal,
        summary: summariseKind(kind, expectedProb, observed, slotTotal, chi),
      });
      if (raised) {
        result.alertsRaised++;
        result.alerts.push({ kindGroup, chiSquare: chi, sampleSize: slotTotal });
      }
    }
  }

  if (result.alertsRaised > 0) {
    await emailDriftSummary(result.alerts);
  }

  return result;
}

function computeChiSquare(
  expected: Record<string, number>, // probability distribution
  observed: Map<string, number>,
  total: number,
): number {
  let chi = 0;
  for (const [key, p] of Object.entries(expected)) {
    const expectedCount = p * total;
    if (expectedCount <= 0) continue;
    const obs = observed.get(key) ?? 0;
    chi += ((obs - expectedCount) ** 2) / expectedCount;
  }
  return chi;
}

async function upsertAlert(args: {
  kindGroup: string;
  chiSquare: number;
  sampleSize: number;
  summary: string;
}): Promise<boolean> {
  const r = await query(
    `INSERT INTO fairness_alerts
       (alert_date, kind_group, chi_square, sample_size, window_days, threshold, summary)
     VALUES ((NOW() AT TIME ZONE 'UTC')::date, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (alert_date, kind_group) DO NOTHING
     RETURNING id`,
    [args.kindGroup, args.chiSquare.toFixed(2), args.sampleSize, WINDOW_DAYS, CHI_SQUARE_THRESHOLD, args.summary],
  );
  return r.rowCount !== null && r.rowCount > 0;
}

function summariseTier(
  tier: string,
  weights: Record<string, number>,
  observed: Map<string, number>,
  total: number,
  chi: number,
): string {
  const lines = [`Tier ${tier} — χ² = ${chi.toFixed(2)} over ${total} pulls (7d)`];
  for (const [rarity, w] of Object.entries(weights)) {
    const obs = observed.get(rarity) ?? 0;
    const expectedCount = w * total;
    const dev = obs - expectedCount;
    lines.push(`  ${rarity}: expected ${expectedCount.toFixed(1)} · observed ${obs} · Δ ${dev > 0 ? "+" : ""}${dev.toFixed(1)}`);
  }
  return lines.join("\n");
}

function summariseKind(
  kind: string,
  expectedProb: Map<string, number>,
  observed: Map<string, number>,
  total: number,
  chi: number,
): string {
  const lines = [`Kind ${kind} — χ² = ${chi.toFixed(2)} over ${total} slots (7d)`];
  // Top 8 by observed count — long tail of opaque keys isn't useful in the email
  const rows = Array.from(new Set([...expectedProb.keys(), ...observed.keys()]))
    .map((k) => ({
      key: k,
      obs: observed.get(k) ?? 0,
      exp: (expectedProb.get(k) ?? 0) * total,
    }))
    .sort((a, b) => b.obs - a.obs)
    .slice(0, 8);
  for (const r of rows) {
    const dev = r.obs - r.exp;
    lines.push(`  ${r.key}: expected ${r.exp.toFixed(1)} · observed ${r.obs} · Δ ${dev > 0 ? "+" : ""}${dev.toFixed(1)}`);
  }
  return lines.join("\n");
}

async function emailDriftSummary(alerts: Array<{ kindGroup: string; chiSquare: number; sampleSize: number }>) {
  const adminEmail =
    process.env.ADMIN_DIGEST_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim();
  if (!adminEmail) {
    console.warn("[fairness-drift] no ADMIN_DIGEST_EMAIL configured; drift alert logged only");
    return;
  }

  try {
    const { sendEmail } = await import("@/lib/email/send");
    const { renderLayout, escapeHtml } = await import("@/lib/email/layout");

    const rows = alerts.map((a) =>
      `<tr>
         <td style="padding:6px 10px;font-family:monospace;color:#e5e5e5;">${escapeHtml(a.kindGroup)}</td>
         <td style="padding:6px 10px;text-align:right;font-family:monospace;color:#fbbf24;">${a.chiSquare.toFixed(2)}</td>
         <td style="padding:6px 10px;text-align:right;color:#a3a3a3;">${a.sampleSize}</td>
       </tr>`
    ).join("");

    const bodyHtml = `
      <p style="margin:0 0 12px;">Recorded draw distribution drift detected in the last 24h window:</p>
      <table style="width:100%;border-collapse:collapse;background:#18181b;border-radius:8px;">
        <thead>
          <tr style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:2px;">
            <th style="padding:8px 10px;text-align:left;">Group</th>
            <th style="padding:8px 10px;text-align:right;">χ²</th>
            <th style="padding:8px 10px;text-align:right;">Samples</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#a3a3a3;">
        Review the per-group breakdown at
        <a href="https://cambridgetcg.com/admin/fairness" style="color:#fbbf24;">the draw distribution admin</a>
        or inspect raw counts at
        <a href="https://cambridgetcg.com/verify/fairness" style="color:#fbbf24;">/verify/fairness</a>.
      </p>
    `;

    const html = renderLayout({
      preheader: `${alerts.length} draw distribution alert${alerts.length === 1 ? "" : "s"}`,
      heading: "Draw distribution drift detected",
      bodyHtml,
      footer: "This alert fires once per UTC day per affected group.",
    });

    await sendEmail({
      to: adminEmail,
      from: "noreply",
      subject: `[Draw distribution] ${alerts.length} drift alert${alerts.length === 1 ? "" : "s"}`,
      html,
    });
  } catch (err) {
    console.error("[fairness-drift] email send failed:", err);
  }
}

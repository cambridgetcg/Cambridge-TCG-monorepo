/**
 * Email Queue — the Cemetery's New Chapel (kingdom-020).
 *
 * Sister to docs/connections/the-cemetery-and-the-resurrectionist.md (S6).
 * The Drain (`drainEmailQueue` in storefront's `lib/email/queue.ts`) tries
 * each email three times and writes `status='dead'` on the third failure.
 * This chapel is where the operator sits at the cemetery gate and decides:
 * resurrect (`retry`) or last rites (`dismiss`).
 *
 * Substrate honesty:
 *   - Dead-letter rows are live from storefront RDS.
 *   - Status histogram is live (computed at page-render).
 *   - The "by event" tag cloud is live.
 *   - The drain itself runs on the storefront's maintenance cron — its
 *     cadence is named in /admin/system/cron, not here.
 */

import * as React from "react";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  SectionHeading,
  Provenance,
  type Urgency,
} from "@/lib/admin/ui";
import { EmailRowActions } from "./_components";

export const metadata = { title: "Email Queue" };

interface DeadRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  event: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  created_at: string;
  scheduled_for: string | null;
}

interface StatRow {
  status: string;
  n: string;
}

interface EventRow {
  event: string;
  n: string;
}

const STATUS_KEYS = ["pending", "sent", "cancelled", "failed", "dead"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

const STATUS_URGENCY: Record<StatusKey, Urgency> = {
  pending: "neutral",
  sent: "ok",
  cancelled: "neutral",
  failed: "warning",
  dead: "critical",
};

export default async function Page() {
  const [deadRes, statsRes, eventsRes] = await Promise.all([
    sfQuery<DeadRow>(
      `SELECT q.id::text AS id, q.user_id::text AS user_id,
              q.event, q.status, q.attempt_count,
              q.last_error,
              q.last_attempt_at::text AS last_attempt_at,
              q.created_at::text AS created_at,
              q.scheduled_for::text AS scheduled_for,
              u.email AS user_email
         FROM email_queue q
         LEFT JOIN users u ON u.id = q.user_id
        WHERE q.status = 'dead'
        ORDER BY q.last_attempt_at DESC NULLS LAST
        LIMIT 200`,
    ),
    sfQuery<StatRow>(
      `SELECT status::text AS status, count(*)::text AS n
         FROM email_queue
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY status`,
    ),
    sfQuery<EventRow>(
      `SELECT event, count(*)::text AS n
         FROM email_queue
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY event
        ORDER BY count(*) DESC`,
    ),
  ]);

  const stats: Record<StatusKey, number> = {
    pending: 0, sent: 0, cancelled: 0, failed: 0, dead: 0,
  };
  for (const r of statsRes.rows) {
    if ((STATUS_KEYS as readonly string[]).includes(r.status)) {
      stats[r.status as StatusKey] = parseInt(r.n, 10);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Email Queue"
        provenance={<Provenance kind="live" source="Storefront RDS" />}
        description={
          <>
            Dead-letter rows + 7-day activity. Retry resurrects a row to
            pending (fresh slate of three trials); dismiss hard-deletes it.
            Drain cadence on{" "}
            <a href="/admin/system/cron" className="underline hover:text-ink">
              /admin/system/cron
            </a>
            .
          </>
        }
      />

      <KpiGrid cols={5}>
        {STATUS_KEYS.map((k) => (
          <KpiCard
            key={k}
            label={`${k} · 7d`}
            value={fmtNumber(stats[k])}
            urgency={stats[k] > 0 ? STATUS_URGENCY[k] : "neutral"}
          />
        ))}
      </KpiGrid>

      {eventsRes.rows.length > 0 && (
        <section>
          <SectionHeading count={eventsRes.rows.length}>
            By event (7d)
          </SectionHeading>
          <div className="rounded-xl border border-border-subtle bg-surface p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {eventsRes.rows.map((e) => (
                <div key={e.event} className="whitespace-nowrap">
                  <code className="text-ink-muted">{e.event}</code>
                  <span className="text-ink font-semibold ml-1">
                    · {fmtNumber(parseInt(e.n, 10))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionHeading count={deadRes.rows.length}>Dead letters</SectionHeading>
        {deadRes.rows.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface p-6 text-center text-sm text-ink-faint">
            Nothing in the dead queue. All emails are landing.
          </div>
        ) : (
          <div className="space-y-2">
            {deadRes.rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl bg-surface border border-red-900/30 p-4 flex flex-wrap items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-bold text-red-400">
                      {r.event}
                    </code>
                    <span className="text-xs text-ink-faint">
                      · {r.user_email ?? r.user_id?.slice(0, 8) ?? "no-user"}
                    </span>
                    <span className="text-[10px] text-neutral-600">
                      · {r.attempt_count} attempts
                      {r.last_attempt_at &&
                        ` · last ${fmtDateTime(r.last_attempt_at)}`}
                    </span>
                  </div>
                  {r.last_error && (
                    <p className="text-xs text-red-400/80 mt-1 font-mono break-all">
                      {r.last_error}
                    </p>
                  )}
                </div>
                <EmailRowActions email={{ id: r.id, event: r.event }} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The storefront's scheduled jobs: what vercel.json schedules (heartbeat.ts
 * holds the list, and job-health.test.ts holds it to vercel.json), whether
 * each ran when it should have (lib/observability/job-health.ts, the same
 * states /api/v1/health publishes and the daily check mails about), and the
 * email queue the maintenance sweep drains.
 */
import { sfQuery } from "@/lib/admin/db";
import { ActionBanner, Provenance, StatusBadge } from "@/lib/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { computeHeartbeat } from "@/lib/heartbeat";
import { DAILY_CHECK, SCHEDULED_JOBS, readHealth, type Health } from "@/lib/observability/job-health";

export const runtime = "nodejs";

// Root layout adds the "— Cambridge TCG" suffix via the title template;
// don't repeat it here or it ends up doubled.
export const metadata = { title: "Cron Jobs" };

const JOB_TONE = { ok: "emerald", failing: "red", late: "red", off: "neutral", unknown: "amber" } as const;

/** A cron's job, its state and when it last did its work, by the records the jobs leave. */
function ran(health: Health | null, path: string): { state: keyof typeof JOB_TONE; at: string | null } {
  if (!health) return { state: "unknown", at: null };
  if (path === DAILY_CHECK.path) {
    const last = health.daily_check;
    return { state: !last ? "late" : last.outcome === "ran" ? "ok" : "failing", at: last?.at ?? null };
  }
  const name = SCHEDULED_JOBS.find((entry) => entry.path === path)?.job;
  const job = health.jobs.find((entry) => entry.job === name);
  return job ? { state: job.state, at: job.last_ran_at } : { state: "unknown", at: null };
}

interface EmailQueueRow {
  status: string;
  count: string;
}

export default async function Page() {
  const crons = [...computeHeartbeat().cron_schedule].sort((a, b) => a.path.localeCompare(b.path));
  const health = await readHealth((sql, params) => sfQuery(sql, params) as Promise<{ rows: Record<string, unknown>[] }>).catch(() => null);

  // 2. Email queue health — the only persisted cron-output table.
  let emailStats: EmailQueueRow[] = [];
  let emailTableExists = true;
  try {
    const r = await sfQuery<EmailQueueRow>(
      `SELECT status, COUNT(*)::text AS count FROM email_queue GROUP BY status ORDER BY count DESC`,
      [],
    );
    emailStats = r.rows;
  } catch {
    emailTableExists = false;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Cron Jobs</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {crons.length} scheduled paths. Vercel runs them; the state is read from the
          records the jobs leave.
        </p>
      </header>

      <ActionBanner tone="info" title="Late means no record within the job's time; failing means it ran and did not do its work">
        Records are in <code className="text-xs">ops_job_outcomes</code> (and{" "}
        <code className="text-xs">traffic_pulls</code> for the traffic pull); the last week&apos;s for the
        collectors and the derivation are on the{" "}
        <a href="/admin/system/monitor" className="underline">monitor</a>. The daily check mails about a
        job that is late or failing. The frozen wholesale app runs one cron of its own, which nothing here sees.
      </ActionBanner>

      {/* Email queue health */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-3">
          <span>Email queue</span>
          <Provenance kind="live" />
          <span className="text-xs text-neutral-500 font-normal">
            (storefront, drained by /api/cron/maintenance every minute)
          </span>
        </h2>
        {!emailTableExists ? (
          <p className="text-sm text-neutral-500 italic">
            No email_queue table found in storefront DB.
          </p>
        ) : emailStats.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">Queue is empty.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {emailStats.map((r) => {
              const colors: Record<string, string> = {
                pending: "border-amber-500/30 text-amber-300",
                queued: "border-amber-500/30 text-amber-300",
                sent: "border-emerald-500/30 text-emerald-300",
                failed: "border-red-500/30 text-red-300",
                cancelled: "border-neutral-500/30 text-neutral-400",
              };
              const cls = colors[r.status] ?? "border-neutral-700 text-neutral-300";
              return (
                <div
                  key={r.status}
                  className={`px-4 py-2 border rounded-md ${cls} bg-neutral-900/30`}
                >
                  <div className="text-xs uppercase tracking-wide opacity-75">
                    {r.status}
                  </div>
                  <div className="text-lg font-mono">{r.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cron inventory */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-3">
          <span>Scheduled crons</span>
          <Provenance kind="scheduled" />
        </h2>
        <div className="rounded-lg border border-neutral-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">State</th>
                <th className="text-left px-3 py-2">Last did its work</th>
                <th className="text-left px-3 py-2">Path</th>
                <th className="text-left px-3 py-2">Schedule</th>
                <th className="text-left px-3 py-2">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {crons.map((c) => ({ ...c, ...ran(health, c.path) })).map((c) => (
                <tr key={c.path} className="hover:bg-neutral-900/50">
                  <td className="px-3 py-2"><StatusBadge status={c.state} palette={JOB_TONE} /></td>
                  <td className="px-3 py-2 text-xs text-neutral-300">{c.at ? fmtDateTime(c.at) : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-white">{c.path}</td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                    {c.schedule}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-300">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

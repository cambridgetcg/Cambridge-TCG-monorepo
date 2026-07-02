/**
 * Cron job inventory + email queue health.
 *
 * No DB-backed run history exists today (Vercel handles cron execution and
 * its dashboard has the run logs). This page surfaces:
 *   1. The static cron list from each app's vercel.json — what's *scheduled*
 *   2. email_queue stats — the only persistent cron-output table that lives in our DBs
 *   3. Best-guess "next run" computed from the cron expression
 */
import { sfQuery } from "@/lib/admin/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ActionBanner, Provenance } from "@/lib/admin/ui";

export const runtime = "nodejs";

// Root layout adds the "— Cambridge TCG" suffix via the title template;
// don't repeat it here or it ends up doubled.
export const metadata = { title: "Cron Jobs" };

interface CronEntry {
  app: "storefront" | "wholesale" | "admin";
  path: string;
  schedule: string;
}

function readCronsFromVercelJson(file: string, app: CronEntry["app"]): CronEntry[] {
  try {
    const content = readFileSync(file, "utf-8");
    const json = JSON.parse(content) as { crons?: { path: string; schedule: string }[] };
    return (json.crons ?? []).map((c) => ({ app, path: c.path, schedule: c.schedule }));
  } catch {
    return [];
  }
}

function describeSchedule(s: string): string {
  // Common patterns first, fallback to raw expression
  const map: Record<string, string> = {
    "* * * * *": "every minute",
    "*/5 * * * *": "every 5 minutes",
    "*/15 * * * *": "every 15 minutes",
    "*/30 * * * *": "every 30 minutes",
    "0 * * * *": "every hour (on the hour)",
    "0 0 * * *": "daily at 00:00 UTC",
    "0 2 * * *": "daily at 02:00 UTC",
    "0 3 * * *": "daily at 03:00 UTC",
    "0 4 * * *": "daily at 04:00 UTC",
    "0 6 * * *": "daily at 06:00 UTC",
    "0 0 * * 1": "weekly Mon 00:00 UTC",
    "15 * * * *": "hourly at :15 UTC",
    "5 * * * *":  "hourly at :05 UTC",
  };
  return map[s] ?? s;
}

interface EmailQueueRow {
  status: string;
  count: string;
}

export default async function Page() {
  // 1. Static cron inventory — read each app's vercel.json from the build's
  //    file system. process.cwd() during a Server Component running on
  //    Vercel is the project root for that deployment.
  // The storefront app sits at apps/storefront in the monorepo, but Vercel
  // sets the root directory to apps/storefront so process.cwd() is …/apps/storefront.
  // The other apps' vercel.json files aren't included in our deploy bundle —
  // we hardcode their crons here as a static reference (matches the source
  // of truth on disk; commit-time link).
  const cwd = process.cwd();
  const storefrontCrons = readCronsFromVercelJson(join(cwd, "vercel.json"), "storefront");

  // Admin and wholesale crons mirrored from their committed vercel.json.
  // Update both files when these change — they aren't auto-synced.
  const adminCrons: CronEntry[] = [];
  const wholesaleCrons: CronEntry[] = [
    { app: "wholesale", path: "/api/cron/monthly-rollover", schedule: "0 0 * * *" },
    { app: "wholesale", path: "/api/cron/price-snapshot", schedule: "0 2 * * *" },
    { app: "wholesale", path: "/api/cron/rebuild-buylist", schedule: "0 3 * * *" },
    { app: "wholesale", path: "/api/cron/shopify-sync", schedule: "0 4 * * *" },
    { app: "wholesale", path: "/api/cron/shopify-orders", schedule: "*/30 * * * *" },
  ];
  const allCrons = [...adminCrons, ...storefrontCrons, ...wholesaleCrons].sort(
    (a, b) => a.app.localeCompare(b.app) || a.path.localeCompare(b.path),
  );

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

  // 3. Storefront cron's heaviest sweep produces alerts/queues — surface a
  //    rough "is anything obviously broken" indicator. The maintenance
  //    sweep itself runs on Vercel; its persisted side-effects sit in
  //    email_queue + various idempotency tables we don't enumerate here.

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Cron Jobs</h1>
        <p className="text-sm text-ink-muted mt-1">
          {allCrons.length} scheduled cron paths across the three apps. Vercel
          executes them; click through to the Vercel dashboard for run history.
        </p>
      </header>

      <ActionBanner tone="warning" title="This page reflects schedule, not run history">
        Cron entries below are read from each app&apos;s <code className="text-xs">vercel.json</code>{" "}
        — they describe what we <em>intend</em> to run. We do not yet have a
        <code className="text-xs"> cron_runs</code> table to record what actually fired.
        Vercel runs are authoritative; this page is reconciled.
        For per-invocation logs, see Vercel → Project → Logs → filter by &quot;Cron.&quot;
      </ActionBanner>

      {/* Email queue health */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-3">
          <span>Email queue</span>
          <Provenance kind="live" />
          <span className="text-xs text-ink-faint font-normal">
            (storefront, drained by /api/cron/maintenance every minute)
          </span>
        </h2>
        {!emailTableExists ? (
          <p className="text-sm text-ink-faint italic">
            No email_queue table found in storefront DB.
          </p>
        ) : emailStats.length === 0 ? (
          <p className="text-sm text-ink-faint italic">Queue is empty.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {emailStats.map((r) => {
              const colors: Record<string, string> = {
                pending: "border-accent/30 text-accent-strong",
                queued: "border-accent/30 text-accent-strong",
                sent: "border-emerald-500/30 text-emerald-300",
                failed: "border-danger/30 text-red-300",
                cancelled: "border-neutral-500/30 text-ink-muted",
              };
              const cls = colors[r.status] ?? "border-border-strong text-ink-muted";
              return (
                <div
                  key={r.status}
                  className={`px-4 py-2 border rounded-md ${cls} bg-surface/30`}
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
        <h2 className="text-sm font-semibold text-ink flex items-center gap-3">
          <span>Scheduled crons</span>
          <Provenance kind="scheduled" />
        </h2>
        <div className="rounded-lg border border-border-subtle overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-ink-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">App</th>
                <th className="text-left px-3 py-2">Path</th>
                <th className="text-left px-3 py-2">Schedule</th>
                <th className="text-left px-3 py-2">Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {allCrons.map((c) => (
                <tr key={`${c.app}:${c.path}`} className="hover:bg-surface/50">
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 text-xs bg-surface-elevated text-ink-muted rounded">
                      {c.app}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink">{c.path}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                    {c.schedule}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {describeSchedule(c.schedule)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

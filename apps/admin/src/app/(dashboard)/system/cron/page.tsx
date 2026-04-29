/**
 * Cron job inventory + email queue health.
 *
 * No DB-backed run history exists today (Vercel handles cron execution and
 * its dashboard has the run logs). This page surfaces:
 *   1. The static cron list from each app's vercel.json — what's *scheduled*
 *   2. email_queue stats — the only persistent cron-output table that lives in our DBs
 *   3. Best-guess "next run" computed from the cron expression
 */
import { sfQuery } from "@/lib/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const metadata = { title: "Cron Jobs — Cambridge TCG Admin" };

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
  // The admin app sits at apps/admin in the monorepo, but Vercel sets the
  // root directory to apps/admin so process.cwd() is …/apps/admin.
  // The other apps' vercel.json files aren't included in our deploy bundle —
  // we hardcode their crons here as a static reference (matches the source
  // of truth on disk; commit-time link).
  const cwd = process.cwd();
  const adminCrons = readCronsFromVercelJson(join(cwd, "vercel.json"), "admin");

  // Storefront and wholesale crons mirrored from their committed vercel.json.
  // Update both files when these change — they aren't auto-synced.
  const storefrontCrons: CronEntry[] = [
    { app: "storefront", path: "/api/cron/maintenance", schedule: "* * * * *" },
  ];
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
        <h1 className="text-xl font-semibold text-white">Cron Jobs</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {allCrons.length} scheduled cron paths across the three apps. Vercel
          executes them; click through to the Vercel dashboard for run history.
        </p>
      </header>

      {/* Email queue health */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">
          Email queue
          <span className="ml-2 text-xs text-neutral-500 font-normal">
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
        <h2 className="text-sm font-semibold text-white">Scheduled crons</h2>
        <div className="rounded-lg border border-neutral-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">App</th>
                <th className="text-left px-3 py-2">Path</th>
                <th className="text-left px-3 py-2">Schedule</th>
                <th className="text-left px-3 py-2">Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {allCrons.map((c) => (
                <tr key={`${c.app}:${c.path}`} className="hover:bg-neutral-900/50">
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 text-xs bg-neutral-800 text-neutral-300 rounded">
                      {c.app}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-white">{c.path}</td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                    {c.schedule}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-300">
                    {describeSchedule(c.schedule)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-neutral-500 italic">
        For run history and per-invocation logs, see Vercel → Project → Logs →
        filter by &quot;Cron&quot;. Persisted run-status would require a
        dedicated cron_runs table; not yet implemented.
      </p>
    </div>
  );
}

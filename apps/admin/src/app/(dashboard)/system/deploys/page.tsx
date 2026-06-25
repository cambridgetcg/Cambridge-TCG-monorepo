/**
 * System / Deploys — live deploy dashboard for all three Vercel projects.
 *
 * Per-project surfaces:
 *   - Latest prod deploy: state, age, commit SHA + message + author
 *   - Domain HTTP probe (HEAD)
 *   - Drift indicator: is `apps/<name>` newer on main than the deployed SHA?
 *
 * Mutation:
 *   - "Redeploy from main" button → server action that calls Vercel's
 *     gitSource API to deploy current main HEAD. Uses the adminAction
 *     wrapper for governance audit + revalidation.
 *
 * Required env: VERCEL_TOKEN (read+deploy scope, team cambridgetcgs-projects).
 * Without it the page renders with a clear error banner and the Redeploy
 * action is hidden. Set in apps/admin/.env.local for local dev and in the
 * Vercel project's env vars for prod.
 */

import { sfQuery } from "@/lib/db";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import {
  PageHeader, KpiGrid, KpiCard, SectionHeading,
  StatusBadge, ErrorState, ActionBanner,
  type Tone,
} from "@/lib/ui";
import {
  PROJECTS, latestProduction, probeDomain,
  VercelTokenMissingError, VercelTokenInvalidError,
  type VercelProject, type Deployment,
} from "@/lib/vercel";
import { RedeployButton } from "./_components";

export const metadata = { title: "Deploys" };

interface ProjectRow {
  project: VercelProject;
  deploy: Deployment | null;
  probe: { status: number; ok: boolean };
  lastTouchSha: string | null;
  lastTouchAt: string | null;
  drift: boolean;
  fetchError?: string;
}

const STATE_PALETTE: Record<string, Tone> = {
  READY:        "emerald",
  BUILDING:     "blue",
  INITIALIZING: "blue",
  QUEUED:       "amber",
  ERROR:        "red",
  CANCELED:     "neutral",
};

async function getLastTouchOnMain(appPath: string): Promise<{ sha: string; at: string } | null> {
  // Look up the most recent commit touching the app via the admin_actions_log
  // table — actually no, we use the storefront DB? Hmm: we need git history.
  //
  // The admin app doesn't have access to the git working tree at runtime.
  // Two options:
  //   1. Cron job pushes "current main HEAD per app" into a small DB table
  //      that this page reads (out of scope for this pilot)
  //   2. Hit the GitHub API for the latest commit touching the path
  //
  // We use #2 — read-only GitHub API call. No auth needed for the public
  // commits endpoint on a private repo, but we *do* need it for our private
  // monorepo. Token comes from GITHUB_TOKEN env var (same as the workflow uses).
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/cambridgetcg/Cambridge-TCG-monorepo/commits?path=${encodeURIComponent(appPath)}&sha=main&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const arr = await res.json() as Array<{ sha: string; commit: { author: { date: string } } }>;
    if (arr.length === 0) return null;
    return { sha: arr[0]!.sha, at: arr[0]!.commit.author.date };
  } catch (err) {
    console.warn(`[deploys] latestProduction fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function loadProject(p: VercelProject): Promise<ProjectRow> {
  try {
    const [deploy, probe, lastTouch] = await Promise.all([
      latestProduction(p.projectId),
      probeDomain(p.domain),
      getLastTouchOnMain(p.appPath),
    ]);

    let drift = false;
    if (deploy && lastTouch) {
      const deployedSha = deploy.meta?.githubCommitSha;
      const deployTime = deploy.created ?? 0;
      const touchTime = new Date(lastTouch.at).getTime();
      // Drift if the most-recent app commit is newer than the deploy and is
      // not the deploy itself. We don't try to inspect the merge graph here.
      drift =
        deployedSha !== lastTouch.sha &&
        touchTime > deployTime + 30 * 60 * 1000; // 30m grace
    }

    return {
      project: p,
      deploy,
      probe,
      lastTouchSha: lastTouch?.sha ?? null,
      lastTouchAt: lastTouch?.at ?? null,
      drift,
    };
  } catch (err) {
    return {
      project: p,
      deploy: null,
      probe: { status: 0, ok: false },
      lastTouchSha: null,
      lastTouchAt: null,
      drift: false,
      fetchError: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function urgencyForState(state: string | undefined): "ok" | "warning" | "critical" | "neutral" {
  if (state === "READY") return "ok";
  if (state === "ERROR") return "critical";
  if (state === "BUILDING" || state === "INITIALIZING" || state === "QUEUED") return "warning";
  return "neutral";
}

export default async function Page() {
  // Bail out early if VERCEL_TOKEN is missing — render a clear banner.
  if (!process.env.VERCEL_TOKEN) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Deploys"
          description="Live deployment status for the three production Vercel projects."
        />
        <ErrorState
          title="VERCEL_TOKEN env var not set"
          description={
            <>
              <p className="mb-2">
                This page reads from the Vercel REST API. Add a team-scoped token to{" "}
                <code className="text-xs">apps/admin/.env.local</code> (local) and to the
                cambridgetcg-admin Vercel project (prod):
              </p>
              <pre className="text-xs font-mono bg-neutral-900 px-3 py-2 rounded border border-neutral-800 overflow-x-auto">
                VERCEL_TOKEN=&lt;create at vercel.com/account/tokens, scope: cambridgetcgs-projects&gt;
              </pre>
              <p className="mt-2 text-xs text-neutral-500">
                Optional: set GITHUB_TOKEN for SHA drift detection against main.
              </p>
            </>
          }
        />
      </div>
    );
  }

  const rows = await Promise.all(PROJECTS.map(loadProject));

  // If every row failed with the same token-invalid error, surface a single
  // actionable banner instead of repeating the message under each project.
  const tokenInvalidCount = rows.filter((r) =>
    r.fetchError && /VERCEL_TOKEN was rejected|invalidToken/i.test(r.fetchError),
  ).length;
  if (tokenInvalidCount === rows.length) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Deploys"
          description="Live deployment status for the three production Vercel projects."
        />
        <ErrorState
          title="VERCEL_TOKEN was rejected by the Vercel API"
          description={
            <>
              <p className="mb-2">
                The token in <code className="text-xs">apps/admin/.env.local</code>{" "}
                is no longer valid. The most common cause is using a Vercel CLI
                token (<code className="text-xs">vca_…</code>) which the CLI
                rotates automatically — they shouldn&rsquo;t be used for
                long-lived integrations.
              </p>
              <p className="mb-2">
                <strong>Fix:</strong> create a long-lived token in the Vercel
                dashboard and rotate it into all three places:
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-neutral-300 mb-3">
                <li>
                  Visit{" "}
                  <a
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    vercel.com/account/tokens
                  </a>
                  {" "}→ Create Token, scope to{" "}
                  <code className="text-xs">cambridgetcgs-projects</code>, set
                  expiry as desired.
                </li>
                <li>
                  Update <code className="text-xs">apps/admin/.env.local</code>.
                </li>
                <li>
                  Update the <code className="text-xs">VERCEL_TOKEN</code> env
                  var on the cambridgetcg-admin Vercel project (production +
                  preview + development).
                </li>
                <li>
                  Update the <code className="text-xs">VERCEL_TOKEN</code> repo
                  secret on{" "}
                  <code className="text-xs">cambridgetcg/Cambridge-TCG-monorepo</code>{" "}
                  (used by <code className="text-xs">.github/workflows/health.yml</code>).
                </li>
                <li>
                  Redeploy the admin so the new env takes effect.
                </li>
              </ol>
              <p className="text-xs text-neutral-500">
                See <code>docs/ops-deploy-runbook.md</code> for the full procedure.
              </p>
            </>
          }
        />
      </div>
    );
  }

  const totalIssues = rows.reduce((n, r) => {
    if (r.fetchError) return n + 1;
    if (r.deploy?.readyState === "ERROR") return n + 1;
    if (r.probe.status >= 500 || r.probe.status === 0) return n + 1;
    if (r.drift) return n + 1;
    return n;
  }, 0);

  const lastDeployTimes = rows
    .map((r) => r.deploy?.created ?? 0)
    .filter((t) => t > 0);
  const oldestAgeH = lastDeployTimes.length
    ? Math.round((Date.now() - Math.min(...lastDeployTimes)) / 3600_000)
    : null;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Deploys"
        description={
          totalIssues === 0
            ? `All ${rows.length} projects healthy.`
            : `${totalIssues} ${totalIssues === 1 ? "issue" : "issues"} across ${rows.length} projects.`
        }
      />

      <KpiGrid cols={4}>
        <KpiCard
          label="Projects"
          value={rows.length}
          urgency="neutral"
        />
        <KpiCard
          label="Healthy"
          value={rows.length - totalIssues}
          urgency={totalIssues === 0 ? "ok" : "warning"}
        />
        <KpiCard
          label="Issues"
          value={totalIssues}
          urgency={totalIssues > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          label="Oldest deploy"
          value={oldestAgeH !== null ? `${oldestAgeH}h` : "—"}
          urgency={oldestAgeH !== null && oldestAgeH > 24 * 14 ? "warning" : "neutral"}
          sub="across all projects"
        />
      </KpiGrid>

      {!process.env.GITHUB_TOKEN && (
        <ActionBanner tone="info" title="GITHUB_TOKEN not set">
          Drift detection (deploy vs latest commit on <code>main</code>) is disabled.
          Add a fine-scoped GitHub PAT with <code>repo</code> read for the monorepo
          to surface drift here.
        </ActionBanner>
      )}

      <SectionHeading>Projects</SectionHeading>

      <div className="space-y-3">
        {rows.map((r) => (
          <ProjectCard key={r.project.key} row={r} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ row }: { row: ProjectRow }) {
  const { project: p, deploy, probe, fetchError, drift } = row;
  const state = deploy?.readyState ?? "?";
  const urgency = urgencyForState(state);
  const tint = {
    ok:       "border-emerald-500/20 bg-emerald-500/5",
    warning:  "border-amber-500/20 bg-amber-500/5",
    critical: "border-red-500/20 bg-red-500/5",
    neutral:  "border-neutral-800 bg-neutral-900/50",
  }[urgency];

  return (
    <div className={`rounded-xl border ${tint} p-5`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-white">{p.name}</h3>
            <a
              href={`https://${p.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {p.domain} ↗
            </a>
            {drift && (
              <StatusBadge status="drift" palette={{ drift: "amber" }} label="DRIFT" />
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1 font-mono">{p.appPath}</p>
        </div>
        <RedeployButton projectKey={p.key} />
      </div>

      {fetchError && (
        <p className="text-sm text-red-400 mb-3">⚠ {fetchError}</p>
      )}

      <div className="grid sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Latest prod</p>
          {deploy ? (
            <>
              <StatusBadge
                status={state}
                palette={STATE_PALETTE}
                label={state}
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                {fmtRelative(new Date(deploy.created))} · {fmtDateTime(new Date(deploy.created))}
              </p>
              {deploy.errorMessage && (
                <p className="text-xs text-red-400 mt-1 line-clamp-2">{deploy.errorMessage}</p>
              )}
            </>
          ) : (
            <span className="text-neutral-500">—</span>
          )}
        </div>

        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Commit</p>
          {deploy?.meta ? (
            <>
              <p className="font-mono text-xs text-amber-400">
                {(deploy.meta.githubCommitSha ?? "").slice(0, 8) || "—"}
              </p>
              <p className="text-xs text-neutral-300 line-clamp-1 max-w-[280px]">
                {deploy.meta.githubCommitMessage?.split("\n")[0] ?? "—"}
              </p>
              <p className="text-xs text-neutral-500">
                {deploy.meta.githubCommitAuthorName ?? "—"}
                {deploy.meta.githubCommitAuthorLogin && (
                  <span className="text-neutral-600"> @{deploy.meta.githubCommitAuthorLogin}</span>
                )}
              </p>
            </>
          ) : (
            <span className="text-neutral-500">—</span>
          )}
        </div>

        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Domain probe</p>
          <span
            className={
              probe.status === 0 || probe.status >= 500
                ? "text-red-400 font-mono text-sm"
                : probe.status >= 400
                  ? "text-amber-400 font-mono text-sm"
                  : "text-emerald-400 font-mono text-sm"
            }
          >
            HTTP {probe.status || "—"}
          </span>
          <p className="text-xs text-neutral-500 mt-1">live HEAD request</p>
        </div>
      </div>

      {drift && row.lastTouchSha && (
        <p className="text-xs text-amber-400 mt-3 border-t border-amber-500/10 pt-3">
          ⚠ Latest commit touching <code className="text-amber-300">{p.appPath}</code> on main is{" "}
          <code className="font-mono text-amber-300">{row.lastTouchSha.slice(0, 8)}</code>
          {row.lastTouchAt && <> ({fmtRelative(row.lastTouchAt)})</>} — newer than the live deploy.
        </p>
      )}
    </div>
  );
}

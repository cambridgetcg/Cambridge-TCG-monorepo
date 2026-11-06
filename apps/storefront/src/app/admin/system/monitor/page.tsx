/**
 * System / Monitor — how the price jobs, the data API, the agent doors and
 * the site's traffic are doing, from counts the storefront keeps
 * (docs/operations/monitoring.md).
 *
 * Six panels, each naming its source and what it covers, each showing
 * "unknown" with the reason when its source cannot be read: a table not yet
 * provisioned, or a read that failed, is never shown as zero.
 *   1. Collectors   member_price_batches, price_collector_hosts, _leases, ops_job_outcomes
 *   2. Derivation   market_derivation_runs and its rows, ops_job_outcomes
 *   3. API          posture flags, data_api_usage_months, traffic on its routes
 *   4. Agents       mcp_daily, agent_keys, agent_rate_buckets
 *   5. Traffic      traffic_hourly and traffic_pulls (what reached Vercel)
 *   6. Errors       error_daily
 *
 * Server-rendered behind the admin gate (the admin layout, and again here
 * before any read). Counts only: no price, source value, key or agent id,
 * user agent or path is read. Nothing on the page reports back what an admin
 * looks at.
 */

import * as React from "react";
import { requireAdminPage } from "@/lib/auth/realms";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import {
  ActionBanner, DataTable, KpiCard, KpiGrid, PageHeader, Provenance, StatusBadge,
  type Column, type Tone,
} from "@/lib/admin/ui";
import { DATA_COLLECT_FLAGS } from "@/lib/datafeed/collection-flags";
import { MCP_DAILY_FLAG } from "@/lib/observability/mcp-daily";
import {
  loadMonitor,
  type BatchGroup, type ClassGroup, type CollectorLease, type DerivationDay, type DerivedCount, type ErrorCount,
  type JobOutcomeRow, type JobOutcomeTally, type McpTally, type NotFoundSpot, type RateBucketDay, type RetentionState,
  type RouteHits, type TrafficDay, type UsageMonth,
} from "@/lib/observability/monitor";
import type { CollectorHostHealth } from "@/app/api/v1/sources/collector-health";
import { Flag, Outcome, Pairs, Panel, Unknown, When, n, pct } from "./_components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Monitor" };

const HOST_TONE: Record<string, Tone> = { ok: "emerald", refused: "amber", stale: "amber", failing: "red", suspended: "red", never_run: "neutral", unknown: "amber" };

export default async function Page() {
  await requireAdminPage();
  const data = await loadMonitor(sfQuery);
  const { collectors, derivation, api, agents, traffic, errors, retention } = data;

  return (
    <div className="max-w-6xl space-y-10">
      <PageHeader
        title="Monitor"
        provenance={<Provenance kind="live" />}
        description={<>Read {fmtDateTime(data.readAt)}. Counts the storefront keeps; each panel names its source and what it cannot see. See <code className="text-xs">docs/operations/monitoring.md</code>.</>}
      />

      <nav aria-label="Panels" className="flex flex-wrap gap-2 text-xs">
        {[["collectors", "Collectors"], ["derivation", "Derivation"], ["api", "API"], ["agents", "Agents"], ["traffic", "Traffic"], ["errors", "Errors"], ["retention", "Retention"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="px-2.5 py-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-900">{label}</a>
        ))}
      </nav>

      {/* 1 ── Collectors */}
      <Panel
        id="collectors"
        title="1. Collectors"
        source={<>member_price_batches (0137), price_collector_hosts (0146), price_collector_leases (0143), ops_job_outcomes (0148); the collect flags in this deployment.</>}
        covers={<>Batches written in the last 7 days and each source&apos;s newest; host state and leases as they stand; job outcomes for 7 days, recorded from 0148 on. A run that fails before its batch leaves none, and a disabled run records no outcome. Observations are not counted, and quarantine entries are counted, never shown.</>}
      >
        <div className="flex flex-wrap gap-4">
          {collectors.sources.map((source) => <Flag key={source.source} name={DATA_COLLECT_FLAGS[source.source]} on={source.on} />)}
        </div>
        <DataTable<CollectorHostHealth & { source: string; hostsReason?: string }>
          rows={collectors.sources.flatMap((source) => source.hosts.hosts.map((host) => ({ ...host, source: source.source, hostsReason: source.hosts.hosts_reason })))}
          rowKey={(row) => `${row.source}:${row.host}`}
          empty="No collector hosts are configured."
          columns={[
            { key: "source", header: "Source", render: (row) => row.source },
            { key: "host", header: "Host", render: (row) => <span className="font-mono text-xs">{row.host}</span> },
            { key: "state", header: "State", render: (row) => <span title={row.hostsReason}><StatusBadge status={row.state} palette={HOST_TONE} /></span> },
            { key: "refusals", header: "Refused in a row", align: "right", render: (row) => n(row.consecutive_refusals) },
            { key: "served", header: "Last served", render: (row) => <When at={row.last_success_at} /> },
            { key: "refused", header: "Last refused", render: (row) => row.last_refusal_at ? <><When at={row.last_refusal_at} /> <code className="text-xs text-neutral-500">{row.last_refusal_reason}</code></> : <When at={null} /> },
            { key: "notBefore", header: "Not before", render: (row) => row.not_before ? fmtDateTime(row.not_before) : "—" },
            { key: "suspended", header: "Suspended", render: (row) => row.suspended_at ? <><When at={row.suspended_at} /> <code className="text-xs text-red-400">{row.suspended_reason}</code></> : "—" },
          ] satisfies Column<CollectorHostHealth & { source: string; hostsReason?: string }>[]}
        />
        {collectors.batches.state === "unknown" ? <Unknown reason={collectors.batches.reason} /> : (
          <>
            <KpiGrid cols={3}>
              {collectors.sources.map(({ source }) => {
                const latest = collectors.batches.state === "known" ? collectors.batches.data.latest.find((row) => row.source === source) : undefined;
                return (
                  <KpiCard key={source} label={`${source} newest batch`} value={latest ? n(latest.sourceRows) : "none"} empty={!latest}
                    sub={latest ? `source rows · ${latest.insertedAt ? fmtDateTime(latest.insertedAt) : "time unknown"} · ${n(latest.quarantined)} quarantined` : "no batch written"} />
                );
              })}
            </KpiGrid>
            <DataTable<BatchGroup>
              rows={collectors.batches.data.window}
              rowKey={(row) => `${row.source}:${row.host ?? ""}`}
              empty="No batch in the last 7 days."
              columns={[
                { key: "source", header: "Source", render: (row) => row.source },
                { key: "host", header: "Host", render: (row) => row.host ? <span className="font-mono text-xs">{row.host}</span> : <span className="text-neutral-600">all</span> },
                { key: "batches", header: "Batches (7 d)", align: "right", render: (row) => n(row.batches) },
                { key: "rows", header: "Source rows", align: "right", render: (row) => n(row.sourceRows) },
                { key: "missing", header: "Missing prices", align: "right", render: (row) => n(row.missingPrices) },
                { key: "quarantined", header: "Quarantined", align: "right", render: (row) => n(row.quarantined) },
                { key: "last", header: "Last", render: (row) => <When at={row.lastInsertedAt} /> },
              ]}
            />
          </>
        )}
        {collectors.leases.state === "unknown" ? <Unknown reason={collectors.leases.reason} /> : (
          <DataTable<CollectorLease>
            rows={collectors.leases.data}
            rowKey={(row) => row.leaseKey}
            empty="No lease row: no run holds a key."
            minWidth={480}
            columns={[
              { key: "key", header: "Lease", render: (row) => <span className="font-mono text-xs">{row.leaseKey}</span> },
              { key: "state", header: "State", render: (row) => <StatusBadge status={!row.held ? "expired" : row.spacing ? "spacing" : "running"} palette={{ running: "blue", spacing: "neutral", expired: "neutral" }} /> },
              { key: "acquired", header: "Taken", render: (row) => <When at={row.acquiredAt} /> },
              { key: "expires", header: "Expires", render: (row) => row.expiresAt ? fmtDateTime(row.expiresAt) : "—" },
            ]}
          />
        )}
        <JobOutcomes jobs={collectors.jobs} filter={(job) => job.startsWith("collect/")} />
      </Panel>

      {/* 2 ── Derivation */}
      <Panel
        id="derivation"
        title="2. Derivation"
        source={<>market_derivation_runs, market_reference_prices, market_indices, market_premiums (0141); ops_job_outcomes (0148) for refusals, excluded sources and skips; <code>DATA_DERIVE_MARKET</code>.</>}
        covers={<>The last 14 UTC dates. A date with no run row and no recorded outcome is unknown: before 0148 a refused day left no trace. Rows are counted; no reference amount, index level or premium ratio is read, and FX shows ECB&apos;s quote date, not the rate.</>}
      >
        {derivation.state === "unknown" ? <Unknown reason={derivation.reason} /> : (
          <>
            <div className="flex flex-wrap gap-4">
              <Flag name="DATA_DERIVE_MARKET" on={derivation.data.on} />
              {derivation.data.outcomesReason && <span className="text-xs text-amber-400">Outcomes unknown: {derivation.data.outcomesReason}</span>}
            </div>
            <DataTable<DerivationDay>
              rows={derivation.data.days}
              rowKey={(row) => row.asOf}
              minWidth={900}
              columns={[
                { key: "date", header: "Date", render: (row) => <span className="font-mono text-xs">{row.asOf}</span> },
                { key: "state", header: "Outcome", render: (row) => <Outcome outcome={row.state} /> },
                { key: "written", header: "Rows (ref / idx / prem)", align: "right", render: (row) => row.run ? `${n(row.run.written.references)} / ${n(row.run.written.indices)} / ${n(row.run.written.premiums)}` : "—" },
                { key: "sources", header: "Sources", render: (row) => row.run?.sources.join(", ") || "—" },
                { key: "fx", header: "FX date", render: (row) => <Pairs value={row.run?.fxDates} /> },
                { key: "excluded", header: "Excluded", render: (row) => <Pairs value={row.outcomes[0]?.counts.excludedSources as Record<string, unknown> | undefined} /> },
                { key: "skipped", header: "Skips", render: (row) => <Pairs value={row.outcomes[0]?.counts.skipped as Record<string, unknown> | undefined} /> },
                { key: "attempts", header: "Recorded runs", align: "right", render: (row) => row.outcomes.length ? n(row.outcomes.length) : "—" },
              ]}
            />
            {derivation.data.latestRun ? (
              <DataTable<DerivedCount>
                rows={derivation.data.counts}
                rowKey={(row) => `${row.kind}:${row.game}:${row.market}:${row.detail}`}
                empty="The latest run wrote no rows."
                minWidth={480}
                columns={[
                  { key: "kind", header: `Latest run (${derivation.data.latestRun.asOf})`, render: (row) => row.kind },
                  { key: "game", header: "Game", render: (row) => row.game },
                  { key: "market", header: "Market", render: (row) => row.market },
                  { key: "detail", header: "Scope / confidence", render: (row) => row.detail },
                  { key: "rows", header: "Rows", align: "right", render: (row) => n(row.rows) },
                ]}
              />
            ) : <p className="text-sm text-neutral-500">No derivation run exists.</p>}
          </>
        )}
        <JobOutcomes jobs={collectors.jobs} filter={(job) => job === "derive/market"} />
      </Panel>

      {/* 3 ── API */}
      <Panel
        id="api"
        title="3. Data API"
        source={<>The posture flags in this deployment (<code>DATA_API_READS</code>, <code>DATA_API_PLANS_PUBLISHED</code>, <code>DATA_API_CHECKOUT_INTAKE</code>); data_api_usage_months (0142); traffic_hourly (0148) for its routes.</>}
        covers={<>Monthly requests summed over accounts, and how many accounts made any; no account is named. Route hits are what reached Vercel, for the hours a traffic pull counted (panel 5).</>}
      >
        <div className="flex flex-wrap gap-4">
          <Flag name="DATA_API_READS" on={api.posture.readsPublished} />
          <Flag name="DATA_API_PLANS_PUBLISHED" on={api.posture.plansPublished} />
          <span className="text-xs text-neutral-400">checkout intake <code className="text-neutral-300">{api.posture.checkoutIntake}</code> · sale <code className="text-neutral-300">{api.posture.saleStatus}</code></span>
        </div>
        {api.usage.state === "unknown" ? <Unknown reason={api.usage.reason} /> : (
          <DataTable<UsageMonth>
            rows={api.usage.data}
            rowKey={(row) => row.month}
            empty="No metered request in 13 months."
            minWidth={360}
            columns={[
              { key: "month", header: "Month", render: (row) => row.month.slice(0, 7) },
              { key: "requests", header: "Requests", align: "right", render: (row) => n(row.requests) },
              { key: "accounts", header: "Accounts", align: "right", render: (row) => n(row.accounts) },
            ]}
          />
        )}
        {api.routes.state === "unknown" ? <Unknown reason={api.routes.reason} /> : (
          <DataTable<RouteHits>
            rows={api.routes.data}
            rowKey={(row) => `${row.day}:${row.pathGroup}:${row.statusClass}`}
            empty="No counted request to these routes in 35 days (see panel 5 for which hours were counted)."
            minWidth={480}
            columns={[
              { key: "day", header: "Day", render: (row) => <span className="font-mono text-xs">{row.day}</span> },
              { key: "group", header: "Route", render: (row) => <code className="text-xs">{row.pathGroup}</code> },
              { key: "status", header: "Status", render: (row) => row.statusClass },
              { key: "requests", header: "Requests", align: "right", render: (row) => n(row.requests) },
            ]}
          />
        )}
      </Panel>

      {/* 4 ── Agents */}
      <Panel
        id="agents"
        title="4. Agents"
        source={<>mcp_daily (0148), written while <code>{MCP_DAILY_FLAG}</code> is on; agent_keys and agent_rate_buckets (0090).</>}
        covers={<>MCP requests for 30 days by method, tool, authentication and outcome, with no key beside a tool; key counts and when active keys were last used, in bands; the rate buckets&apos; 7 days. Other agent doors appear in traffic (panel 5) by route group.</>}
      >
        {agents.mcp.state === "unknown" ? <Unknown reason={agents.mcp.reason} /> : (
          <>
            <div className="flex flex-wrap gap-4"><Flag name={MCP_DAILY_FLAG} on={agents.mcp.data.on} /></div>
            <DataTable<McpTally>
              rows={agents.mcp.data.tally}
              rowKey={(row) => `${row.method}:${row.tool}:${row.authenticated}:${row.outcome}`}
              empty={agents.mcp.data.on ? "No MCP request counted in 30 days." : `Not counting: ${MCP_DAILY_FLAG} is off, so no request is counted (unknown, not zero).`}
              columns={[
                { key: "method", header: "Method", render: (row) => <code className="text-xs">{row.method}</code> },
                { key: "tool", header: "Tool", render: (row) => <code className="text-xs">{row.tool}</code> },
                { key: "auth", header: "Authenticated", render: (row) => (row.authenticated ? "yes" : "no") },
                { key: "outcome", header: "Outcome", render: (row) => row.outcome },
                { key: "requests", header: "Requests (30 d)", align: "right", render: (row) => n(row.requests) },
              ]}
            />
          </>
        )}
        {agents.keys.state === "unknown" ? <Unknown reason={agents.keys.reason} /> : (
          <KpiGrid cols={6}>
            <KpiCard label="Agent keys" value={n(agents.keys.data.keys)} sub={`${n(agents.keys.data.active)} active`} />
            <KpiCard label="Used < 1 h" value={n(agents.keys.data.lastHour)} empty={!agents.keys.data.lastHour} />
            <KpiCard label="Used 1 h – 1 d" value={n(agents.keys.data.lastDay)} empty={!agents.keys.data.lastDay} />
            <KpiCard label="Used 1 – 7 d" value={n(agents.keys.data.lastWeek)} empty={!agents.keys.data.lastWeek} />
            <KpiCard label="Used 7 – 30 d" value={n(agents.keys.data.lastMonth)} empty={!agents.keys.data.lastMonth} />
            <KpiCard label="Older / never" value={`${n(agents.keys.data.older)} / ${n(agents.keys.data.never)}`} />
          </KpiGrid>
        )}
        {agents.buckets.state === "unknown" ? <Unknown reason={agents.buckets.reason} /> : (
          <DataTable<RateBucketDay>
            rows={agents.buckets.data}
            rowKey={(row) => row.day}
            empty="No allowed authenticated MCP call in the buckets' 7 days."
            minWidth={420}
            columns={[
              { key: "day", header: "Day", render: (row) => <span className="font-mono text-xs">{row.day}</span> },
              { key: "requests", header: "Bucketed requests", align: "right", render: (row) => n(row.requests) },
              { key: "keys", header: "Keys", align: "right", render: (row) => n(row.keys) },
              { key: "busiest", header: "Busiest key-minute", align: "right", render: (row) => n(row.busiestMinute) },
            ]}
          />
        )}
      </Panel>

      {/* 5 ── Traffic */}
      <Panel
        id="traffic"
        title="5. Traffic"
        source={<>traffic_hourly and traffic_pulls (0148), filled hourly from Vercel&apos;s request logs.</>}
        covers={<>The last 7 UTC days of counts, and 35 days of which hours were counted. Classes are what each request declared, never verified and never &quot;human&quot;; paths are route groups.</>}
      >
        <ActionBanner tone="info" title="Vercel-seen only">
          These are requests that reached Vercel. Pages Cloudflare answered from its own cache never appear, so page views are undercounted and the share
          of visitors who carry no cookie is unknown. The <code className="text-xs">*.vercel.app</code> hosts reach Vercel without Cloudflare (&quot;direct&quot; below).
          No IP address is available, so no user agent&apos;s claim is checked.
        </ActionBanner>
        {traffic.coverage.state === "unknown" ? <Unknown reason={traffic.coverage.reason} /> : (
          <KpiGrid cols={5}>
            <KpiCard label="Hours counted (35 d)" value={n(traffic.coverage.data.ok)} sub={`of ${n(traffic.coverage.data.hours)}`} urgency={traffic.coverage.data.ok ? "ok" : "neutral"} />
            <KpiCard label="Partly counted" value={n(traffic.coverage.data.partial)} urgency={traffic.coverage.data.partial ? "warning" : "neutral"} />
            <KpiCard label="Pull failed" value={n(traffic.coverage.data.failed)} urgency={traffic.coverage.data.failed ? "critical" : "neutral"} />
            <KpiCard label="Unknown (no pull)" value={n(traffic.coverage.data.unknown)} urgency={traffic.coverage.data.unknown ? "warning" : "neutral"} />
            <KpiCard label="Last pull" value={traffic.coverage.data.lastPullAt ? fmtDateTime(traffic.coverage.data.lastPullAt) : "never"} empty={!traffic.coverage.data.lastPullAt} />
          </KpiGrid>
        )}
        {traffic.counts.state === "unknown" ? <Unknown reason={traffic.counts.reason} /> : (
          <>
            <DataTable<TrafficDay>
              rows={traffic.counts.data.days}
              rowKey={(row) => row.day}
              empty="No counted request in the last 7 days."
              minWidth={760}
              columns={[
                { key: "day", header: "Day", render: (row) => <span className="font-mono text-xs">{row.day}</span> },
                { key: "requests", header: "Requests", align: "right", render: (row) => n(row.requests) },
                { key: "rsc", header: "RSC share", align: "right", render: (row) => pct(row.rsc, row.requests) },
                { key: "direct", header: "Direct to Vercel", align: "right", render: (row) => pct(row.direct, row.requests) },
                { key: "statuses", header: "Status mix", render: (row) => <Pairs value={row.statuses} /> },
              ]}
            />
            <ClassByDay rows={traffic.counts.data.classDays} />
            <DataTable<ClassGroup>
              rows={traffic.counts.data.classGroups}
              rowKey={(row) => `${row.actorClass}:${row.pathGroup}`}
              empty="No counted request in the last 7 days."
              minWidth={560}
              columns={[
                { key: "class", header: "Class", render: (row) => row.actorClass },
                { key: "group", header: "Route group", render: (row) => <code className="text-xs">{row.pathGroup}</code> },
                { key: "requests", header: "Requests (7 d)", align: "right", render: (row) => n(row.requests) },
                { key: "rsc", header: "RSC", align: "right", render: (row) => pct(row.rsc, row.requests) },
              ]}
            />
            <DataTable<NotFoundSpot>
              rows={traffic.counts.data.notFound}
              rowKey={(row) => row.pathGroup}
              empty="No 404 counted in the last 7 days."
              minWidth={480}
              columns={[
                { key: "group", header: "404 hot spots", render: (row) => <code className="text-xs">{row.pathGroup}</code> },
                { key: "notFound", header: "404s (7 d)", align: "right", render: (row) => n(row.notFound) },
                { key: "share", header: "Of the group", align: "right", render: (row) => pct(row.notFound, row.requests) },
              ]}
            />
          </>
        )}
      </Panel>

      {/* 6 ── Errors */}
      <Panel
        id="errors"
        title="6. Errors"
        source={<>error_daily (0148), filled by the hourly pull from Vercel&apos;s runtime logs.</>}
        covers={<>30 days by tag (a fixed list) and status, never the log line&apos;s text, for the hours the pull counted (panel 5). Runtime logs hold only invocations that printed something.</>}
      >
        {errors.state === "unknown" ? <Unknown reason={errors.reason} /> : (
          <DataTable<ErrorCount>
            rows={errors.data}
            rowKey={(row) => `${row.day}:${row.tag}:${row.status}`}
            empty="No error counted in 30 days (see panel 5 for which hours were counted)."
            minWidth={420}
            columns={[
              { key: "day", header: "Day", render: (row) => <span className="font-mono text-xs">{row.day}</span> },
              { key: "tag", header: "Tag", render: (row) => <code className="text-xs">{row.tag}</code> },
              { key: "status", header: "Status", render: (row) => (row.status ? String(row.status) : "none given") },
              { key: "count", header: "Lines", align: "right", render: (row) => n(row.count) },
            ]}
          />
        )}
      </Panel>

      {/* Retention */}
      <Panel
        id="retention"
        title="Retention"
        source={<>The five 0148 tables; periods from <code>src/lib/observability/retention.ts</code>.</>}
        covers={<>Hourly rows are kept 35 days and daily rows 13 months; the writers delete older rows as they write. A row past its period means the sweep has not run.</>}
      >
        {retention.state === "unknown" ? <Unknown reason={retention.reason} /> : (
          <DataTable<RetentionState>
            rows={retention.data}
            rowKey={(row) => row.table}
            minWidth={480}
            columns={[
              { key: "table", header: "Table", render: (row) => <code className="text-xs">{row.table}</code> },
              { key: "keeps", header: "Keeps", render: (row) => row.keeps },
              { key: "rows", header: "Rows", align: "right", render: (row) => n(row.rows) },
              { key: "oldest", header: "Oldest", render: (row) => row.oldest ?? "—" },
              { key: "expired", header: "Past period", align: "right", render: (row) => <span className={row.expired ? "text-red-400" : undefined}>{n(row.expired)}</span> },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

function JobOutcomes({ jobs, filter }: { jobs: Awaited<ReturnType<typeof loadMonitor>>["collectors"]["jobs"]; filter: (job: string) => boolean }) {
  if (jobs.state === "unknown") return <Unknown reason={`Job outcomes: ${jobs.reason}`} />;
  const latest = jobs.data.latest.filter((row) => filter(row.job));
  const tally = jobs.data.tally.filter((row) => filter(row.job));
  return (
    <>
      <DataTable<JobOutcomeRow>
        rows={latest}
        rowKey={(row) => row.job}
        empty="No outcome recorded yet (a disabled job records none)."
        minWidth={760}
        columns={[
          { key: "job", header: "Job, latest run", render: (row) => <code className="text-xs">{row.job}</code> },
          { key: "when", header: "Started", render: (row) => <When at={row.startedAt} /> },
          { key: "status", header: "HTTP", align: "right", render: (row) => String(row.httpStatus) },
          { key: "outcome", header: "Outcome", render: (row) => <Outcome outcome={row.outcome} /> },
          { key: "counts", header: "Counts", render: (row) => <Pairs value={row.counts} /> },
        ]}
      />
      <DataTable<JobOutcomeTally>
        rows={tally}
        rowKey={(row) => `${row.job}:${row.outcome}`}
        empty="No run in the last 7 days."
        minWidth={480}
        columns={[
          { key: "job", header: "Job (7 d)", render: (row) => <code className="text-xs">{row.job}</code> },
          { key: "outcome", header: "Outcome", render: (row) => <Outcome outcome={row.outcome} /> },
          { key: "runs", header: "Runs", align: "right", render: (row) => n(row.runs) },
          { key: "last", header: "Last", render: (row) => <When at={row.lastAt} /> },
        ]}
      />
    </>
  );
}

/** Actor class by day: one row per class, one column per day. */
function ClassByDay({ rows }: { rows: { day: string; actorClass: string; requests: number }[] }) {
  const days = [...new Set(rows.map((row) => row.day))].sort().reverse();
  const classes = [...new Set(rows.map((row) => row.actorClass))];
  const at = new Map(rows.map((row) => [`${row.actorClass}:${row.day}`, row.requests]));
  const table = classes.map((actorClass) => ({ actorClass, total: days.reduce((sum, day) => sum + (at.get(`${actorClass}:${day}`) ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);
  return (
    <DataTable<{ actorClass: string; total: number }>
      rows={table}
      rowKey={(row) => row.actorClass}
      empty="No counted request in the last 7 days."
      minWidth={760}
      columns={[
        { key: "class", header: "Declared class", render: (row) => row.actorClass },
        ...days.map((day) => ({ key: day, header: day.slice(5), align: "right" as const, render: (row: { actorClass: string }) => n(at.get(`${row.actorClass}:${day}`) ?? 0) })),
        { key: "total", header: "7 d", align: "right", render: (row) => n(row.total) },
      ]}
    />
  );
}

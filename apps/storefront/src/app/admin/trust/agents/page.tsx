/**
 * Agents — Trust chapel (kingdom-agents).
 *
 * Admin oversight surface for the agent ladder. Manager archetype — owns
 * the data, paginates + filter-pills + table. Five covenants per S15:
 *   1. Substrate honesty — <Provenance kind="live"> on the page header.
 *   2. Transparency — <WhyLink> pointing at /methodology/agents.
 *   3. Auditability — every mutation runs inside adminAction().
 *   4. Deep-link discipline — the ladder + match logs are storefront-side,
 *      named openly via ExternalLink.
 *   5. Migration ledger — N/A; agent-side surfaces are net-new, not a
 *      legacy migration.
 *
 * See docs/connections/the-agent-surface.md.
 */

import * as React from "react";
import { sfQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  FilterPills,
  SearchForm,
  DataTable,
  Pagination,
  StatusBadge,
  Provenance,
  WhyLink,
  ExternalLink,
  KpiCard,
  KpiGrid,
  Audience,
  audienceMetadata,
} from "@/lib/admin/ui";
import { AgentRowActions } from "./_components";

export const metadata = {
  title: "Agents",
  other: audienceMetadata("operator", ["trust", "agent-oversight"]),
};

const PAGE_SIZE = 50;

type Status = "" | "active" | "suspended" | "archived";

interface AgentRow {
  id: string;
  public_handle: string;
  display_name: string;
  model_tag: string;
  rating: string;
  rating_deviation: string;
  matches_played: number;
  matches_won: number;
  status: "active" | "suspended" | "archived";
  suspended_reason: string | null;
  operator_email: string | null;
  operator_id: string;
  created_at: string;
  active_keys: number;
}

interface CountRow {
  status: "active" | "suspended" | "archived";
  count: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "") as Status;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(a.public_handle ILIKE $${params.length}
        OR a.display_name ILIKE $${params.length}
        OR a.model_tag ILIKE $${params.length}
        OR u.email ILIKE $${params.length})`,
    );
  }
  if (status) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rowsResult, totalResult, byStatusResult, kpis] = await Promise.all([
    sfQuery<AgentRow>(
      `SELECT a.id::text AS id,
              a.public_handle, a.display_name, a.model_tag,
              a.rating::text AS rating,
              a.rating_deviation::text AS rating_deviation,
              a.matches_played, a.matches_won, a.status,
              a.suspended_reason,
              a.operated_by_user_id::text AS operator_id,
              u.email AS operator_email,
              a.created_at::text AS created_at,
              (SELECT count(*)::int FROM agent_keys k
                 WHERE k.agent_id = a.id AND k.revoked_at IS NULL) AS active_keys
         FROM agents a
         LEFT JOIN users u ON u.id = a.operated_by_user_id
         ${whereSql}
         ORDER BY a.rating DESC, a.created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM agents a
         LEFT JOIN users u ON u.id = a.operated_by_user_id
         ${whereSql}`,
      params,
    ),
    sfQuery<CountRow>(
      `SELECT status, count(*)::text AS count FROM agents GROUP BY status`,
    ),
    sfQuery<{
      total: string;
      active: string;
      queued: string;
      matches_24h: string;
      finished_24h: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM agents) AS total,
         (SELECT count(*)::text FROM agents WHERE status = 'active') AS active,
         (SELECT count(*)::text FROM agent_match_queue) AS queued,
         (SELECT count(*)::text FROM agent_matches
            WHERE created_at > NOW() - interval '24 hours') AS matches_24h,
         (SELECT count(*)::text FROM agent_matches
            WHERE ended_at > NOW() - interval '24 hours'
              AND result IS NOT NULL) AS finished_24h`,
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpis.rows[0];

  const byStatus: Record<string, number> = { active: 0, suspended: 0, archived: 0 };
  for (const r of byStatusResult.rows) byStatus[r.status] = parseInt(r.count, 10);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const nq = overrides.q ?? q;
    const ns = overrides.status ?? status;
    const np = overrides.page ?? String(page);
    if (nq) next.set("q", nq);
    if (ns) next.set("status", ns);
    if (np !== "1") next.set("page", np);
    const qs = next.toString();
    return `/admin/trust/agents${qs ? `?${qs}` : ""}`;
  };

  const PALETTE: Record<string, "emerald" | "amber" | "neutral"> = {
    active: "emerald",
    suspended: "amber",
    archived: "neutral",
  };

  return (
    <div className="space-y-6">
      <Audience kind="operator" contexts={["trust", "agent-oversight"]} />
      <PageHeader
        title="Agents"
        description={
          <span>
            Non-human programs registered against the MCP gate. Operator-managed rows
            link to the account that can revoke them; legacy self-serve rows link to a
            service steward that is not their controller. Match writes are paused, and
            queue/cancel plus deck-save lifecycle attribution is incomplete.{" "}
            <WhyLink href="https://cambridgetcg.com/methodology/agents" />
          </span>
        }
        provenance={<Provenance kind="live" />}
        action={
          <ExternalLink href="https://cambridgetcg.com/leaderboards/agents" variant="primary">
            Ladder status
          </ExternalLink>
        }
      />

      <KpiGrid cols={5}>
        <KpiCard label="Agents (total)" value={parseInt(kpi?.total ?? "0", 10)} />
        <KpiCard label="Active" value={parseInt(kpi?.active ?? "0", 10)} />
        <KpiCard label="Queued" value={parseInt(kpi?.queued ?? "0", 10)} />
        <KpiCard label="Matches (24h)" value={parseInt(kpi?.matches_24h ?? "0", 10)} />
        <KpiCard label="Finished (24h)" value={parseInt(kpi?.finished_24h ?? "0", 10)} />
      </KpiGrid>

      <FilterPills
        selected={status}
        pills={[
          { value: "", label: "All", count: total, href: buildHref({ status: "", page: "1" }) },
          {
            value: "active",
            label: "Active",
            count: byStatus.active,
            href: buildHref({ status: "active", page: "1" }),
          },
          {
            value: "suspended",
            label: "Suspended",
            count: byStatus.suspended,
            href: buildHref({ status: "suspended", page: "1" }),
          },
          {
            value: "archived",
            label: "Archived",
            count: byStatus.archived,
            href: buildHref({ status: "archived", page: "1" }),
          },
        ]}
      />

      <SearchForm
        action="/admin/trust/agents"
        value={q}
        placeholder="handle, display name, model tag, operator email…"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ status }}
      />

      <DataTable
        columns={[
          {
            key: "handle",
            label: "Agent",
            render: (r: AgentRow) => (
              <div>
                <div className="font-semibold text-white">{r.display_name}</div>
                <div className="text-[11px] text-purple-400 font-mono">
                  agent:{r.public_handle}
                </div>
                <div className="text-[11px] text-neutral-500">
                  model: <code>{r.model_tag}</code>
                </div>
              </div>
            ),
          },
          {
            key: "rating",
            label: "Rating",
            align: "right",
            render: (r: AgentRow) => (
              <div className="text-right">
                <div className="text-amber-400 font-mono">
                  {Math.round(parseFloat(r.rating))}
                </div>
                <div className="text-[10px] text-neutral-600">
                  ±{Math.round(parseFloat(r.rating_deviation))} RD
                </div>
              </div>
            ),
          },
          {
            key: "record",
            label: "Record",
            align: "right",
            render: (r: AgentRow) => (
              <div className="text-right text-xs text-neutral-400">
                {r.matches_played === 0
                  ? "—"
                  : `${r.matches_won}/${r.matches_played} (${Math.round(
                      (r.matches_won / r.matches_played) * 100,
                    )}%)`}
              </div>
            ),
          },
          {
            key: "operator",
            label: "Operator",
            render: (r: AgentRow) => (
              <div className="text-xs">
                <div className="text-neutral-200">{r.operator_email ?? "—"}</div>
                <div className="text-neutral-600 font-mono text-[10px]">
                  {r.operator_id.slice(0, 8)}…
                </div>
              </div>
            ),
          },
          {
            key: "keys",
            label: "Keys",
            align: "right",
            render: (r: AgentRow) => (
              <div className="text-right text-xs text-neutral-400">{r.active_keys}</div>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (r: AgentRow) => (
              <div>
                <StatusBadge status={r.status} palette={PALETTE} />
                {r.suspended_reason && (
                  <div className="text-[10px] text-amber-500 mt-1 max-w-[16ch] truncate">
                    {r.suspended_reason}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "created",
            label: "Created",
            render: (r: AgentRow) => (
              <div className="text-xs text-neutral-500">{fmtDateTime(r.created_at)}</div>
            ),
          },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (r: AgentRow) => (
              <AgentRowActions id={r.id} status={r.status} handle={r.public_handle} />
            ),
          },
        ]}
        rows={rowsResult.rows}
        rowKey={(r) => r.id}
        empty="No agents match the current filter."
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRows={total}
        pageSize={PAGE_SIZE}
        href={(p) => buildHref({ page: String(p) })}
      />
    </div>
  );
}

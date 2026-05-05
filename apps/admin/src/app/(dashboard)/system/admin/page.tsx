/**
 * System / Admin users — Manager page.
 *
 * Lists storefront users where role='admin' or where they have admin
 * actions on file. Mutations: grantAdmin, revokeAdmin (with self-
 * lockout protection — you cannot revoke your own admin role).
 *
 * Schema: users.role (drizzle/0088_admin_roles.sql) + admin_actions_log
 * for the activity trail.
 *
 * Closes the governance triangle: /system/audit (read), /system/admin
 * (mutate roles), and the adminAction wrapper itself (write).
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader, SearchForm, DataTable, FilterPills,
  KpiGrid, KpiCard, SectionHeading, Provenance, type Column,
} from "@/lib/ui";
import { auth } from "@/lib/auth";
import { AdminRowActions, GrantAdminForm } from "./_components";

export const metadata = { title: "Admin Users" };

interface AdminRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  created_at: string;
  last_action_at: string | null;
  action_count: number;
}

interface CandidateRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tab = sp.tab === "candidates" ? "candidates" : "current";

  // Identify the viewing admin so the row UI can disable revoke-self.
  const session = await auth();
  const viewerId = session?.user?.id ?? "";

  if (tab === "candidates") {
    // ── Search-mode for grants: list non-admin users matching q. Hide
    // the result-set entirely when q is empty (otherwise we'd render
    // the entire users table).
    const trimmed = q.trim();
    const candidates = trimmed.length >= 2
      ? await sfQuery<CandidateRow>(
          `SELECT id::text, email, name, role
             FROM users
            WHERE role != 'admin'
              AND (email ILIKE $1 OR name ILIKE $1 OR id::text ILIKE $1)
            ORDER BY email
            LIMIT 25`,
          [`%${trimmed}%`],
        )
      : { rows: [] };

    return (
      <CandidatesView q={trimmed} candidates={candidates.rows} />
    );
  }

  // ── Current admins ────────────────────────────────────────────────
  const where = q
    ? `WHERE u.role = 'admin' AND (u.email ILIKE $1 OR u.name ILIKE $1)`
    : `WHERE u.role = 'admin'`;
  const params = q ? [`%${q}%`] : [];

  // Activity join uses actor_label = email (live schema; 0088 migration
  // not deployed). Matches /system/audit's data source.
  const [adminsResult, kpiResult] = await Promise.all([
    sfQuery<AdminRow>(
      `SELECT u.id::text, u.email, u.name, u.role, u.created_at,
              MAX(l.created_at) AS last_action_at,
              COUNT(l.id)::int  AS action_count
         FROM users u
         LEFT JOIN admin_actions_log l ON l.actor_label = u.email
         ${where}
        GROUP BY u.id, u.email, u.name, u.role, u.created_at
        ORDER BY MAX(l.created_at) DESC NULLS LAST, u.email`,
      params,
    ),
    sfQuery<{ admins: string; admins_active_30d: string; recent_grants: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM users WHERE role = 'admin')                 AS admins,
         (SELECT COUNT(DISTINCT actor_label)::text FROM admin_actions_log
            WHERE created_at >= NOW() - INTERVAL '30 days' AND actor_label IS NOT NULL) AS admins_active_30d,
         (SELECT COUNT(*)::text FROM admin_actions_log
            WHERE action IN ('admin.grant', 'admin.revoke')
              AND created_at >= NOW() - INTERVAL '30 days')                       AS recent_grants`,
      [],
    ),
  ]);

  const kpi = kpiResult.rows[0] ?? { admins: "0", admins_active_30d: "0", recent_grants: "0" };

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const newQ = overrides.q !== undefined ? overrides.q : q;
    if (newQ) next.set("q", newQ);
    const newTab = overrides.tab !== undefined ? overrides.tab : tab;
    if (newTab && newTab !== "current") next.set("tab", newTab);
    const qs = next.toString();
    return `/system/admin${qs ? `?${qs}` : ""}`;
  };

  const tabPills = [
    { value: "current",    label: "Current admins", count: kpi.admins, href: buildHref({ tab: "current", q: "" }) },
    { value: "candidates", label: "Grant new",      count: "—",        href: buildHref({ tab: "candidates", q: "" }) },
  ];

  const columns: Column<AdminRow>[] = [
    {
      key: "user",
      header: "User",
      render: (r) => (
        <>
          <p className="text-white text-sm">{r.name ?? r.email ?? r.id.slice(0, 8)}</p>
          <p className="text-xs text-neutral-500">{r.email ?? "(no email)"}</p>
        </>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40">
          {r.role}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions logged",
      align: "right",
      render: (r) => (
        <Link
          href={`/system/audit?q=${encodeURIComponent(r.email ?? "")}`}
          className="font-mono text-amber-400 hover:text-amber-300 underline"
        >
          {r.action_count}
        </Link>
      ),
    },
    {
      key: "last_action",
      header: "Last action",
      align: "right",
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (r) => r.last_action_at ? fmtDateTime(r.last_action_at) : <span className="text-neutral-600">—</span>,
      hideOnMobile: true,
    },
    {
      key: "since",
      header: "Admin since",
      align: "right",
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (r) => fmtDateTime(r.created_at),
      hideOnMobile: true,
    },
    {
      key: "row_action",
      header: "",
      align: "right",
      render: (r) => (
        <AdminRowActions
          target={{
            user_id: r.id,
            email: r.email,
            is_self: r.id === viewerId,
          }}
        />
      ),
    },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Admin Users"
        description="Storefront users with role='admin'. Grants and revocations write to admin_actions_log — every change is auditable from /system/audit. You cannot revoke your own role (lockout protection)."
        action={
          <Link
            href="/system/audit"
            className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
          >
            Audit log →
          </Link>
        }
      />

      <SectionHeading trailing={<Provenance kind="live" />}>At a glance</SectionHeading>

      <KpiGrid cols={3}>
        <KpiCard label="Current Admins" value={kpi.admins} urgency="ok" />
        <KpiCard label="Active 30d" value={kpi.admins_active_30d} urgency="ok" />
        <KpiCard label="Role Changes 30d" value={kpi.recent_grants} urgency="neutral" />
      </KpiGrid>

      <FilterPills selected={tab} pills={tabPills} />

      <SectionHeading count={adminsResult.rows.length}>Current admins</SectionHeading>

      <SearchForm
        action="/system/admin"
        value={q}
        placeholder="Filter by email or name"
        clearHref={buildHref({ q: "" })}
        preserve={{ tab }}
      />

      <DataTable
        columns={columns}
        rows={adminsResult.rows}
        rowKey={(r) => r.id}
        emptyMessage={q
          ? "No admins match the search."
          : "No admins on file. Use the Grant new tab to bootstrap one."
        }
        minWidth={760}
      />
    </div>
  );
}

// ── Candidates sub-view ────────────────────────────────────────────────

function CandidatesView({
  q,
  candidates,
}: {
  q: string;
  candidates: CandidateRow[];
}) {
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Admin Users"
        description="Search storefront users to grant the admin role. Reason is required — every grant is logged."
        action={
          <Link
            href="/system/admin"
            className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
          >
            ← Current admins
          </Link>
        }
      />

      <FilterPills
        selected="candidates"
        pills={[
          { value: "current",    label: "Current admins", count: "—", href: "/system/admin" },
          { value: "candidates", label: "Grant new",      count: "—", href: "/system/admin?tab=candidates" },
        ]}
      />

      <SectionHeading count={candidates.length}>Search non-admin users</SectionHeading>

      <SearchForm
        action="/system/admin"
        value={q}
        placeholder="Search by email, name, or user id (min 2 chars)"
        clearHref="/system/admin?tab=candidates"
        preserve={{ tab: "candidates" }}
      />

      {q.length < 2 ? (
        <div className="text-sm text-neutral-500 italic px-1">
          Type at least 2 characters to search.
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-sm text-neutral-500 italic px-1">
          No matching non-admin users.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800 border border-neutral-800 rounded-md">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{c.name ?? c.email ?? c.id.slice(0, 8)}</p>
                <p className="text-xs text-neutral-500 truncate">{c.email ?? "(no email)"}</p>
              </div>
              <GrantAdminForm
                target={{ user_id: c.id, email: c.email }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

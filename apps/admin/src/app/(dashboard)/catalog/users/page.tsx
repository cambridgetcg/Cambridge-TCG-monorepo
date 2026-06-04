/**
 * Storefront users — paginated search.
 *
 * Closes Love's "user search is impossible (UUID-only)" gap. Reads from
 * the storefront `users` table; supports search by email/name/username
 * and filter by membership tier. Each row links to /catalog/users/[id]
 * for the full cross-module drill-down.
 */
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtGBP, fmtDate } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  Provenance, WhyLink,
  type Column,
} from "@/lib/ui";

export const metadata = { title: "Users" };

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  email_verified: string | null;
  membership_tier: string | null;
  store_credit_balance: string;
  points_balance: number;
  trust_score: number;
  trade_count: number;
  country: string | null;
  total_spend: string;
  created_at: string;
  is_verified: boolean;
  role: string;
  bank_verified: boolean;
}

const PAGE_SIZE = 50;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; role?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tier = sp.tier ?? "";
  const role = sp.role ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q) {
    where.push(`(email ILIKE $${i} OR name ILIKE $${i} OR username ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  if (tier) {
    // Treat the literal "(none)" pill as "membership_tier IS NULL".
    if (tier === "(none)") {
      where.push("membership_tier IS NULL");
    } else {
      where.push(`membership_tier = $${i}`);
      params.push(tier);
      i += 1;
    }
  }
  if (role) {
    where.push(`role = $${i}`);
    params.push(role);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rowsResult, totalResult, byTierResult] = await Promise.all([
    sfQuery<UserRow>(
      `SELECT id, name, email, username, email_verified, membership_tier,
              store_credit_balance::text, points_balance, trust_score, trade_count,
              country, total_spend::text, created_at, is_verified, role, bank_verified
         FROM users
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    sfQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users ${whereSql}`,
      params,
    ),
    sfQuery<{ membership_tier: string | null; count: string }>(
      `SELECT membership_tier, COUNT(*)::text AS count FROM users
        GROUP BY membership_tier ORDER BY count DESC`,
      [],
    ),
  ]);
  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAllUsers = byTierResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const newQ = overrides.q !== undefined ? overrides.q : q;
    if (newQ) next.set("q", newQ);
    const newTier = overrides.tier !== undefined ? overrides.tier : tier;
    if (newTier) next.set("tier", newTier);
    const newRole = overrides.role !== undefined ? overrides.role : role;
    if (newRole) next.set("role", newRole);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/catalog/users${qs ? `?${qs}` : ""}`;
  };

  const tierPills = [
    { value: "", label: "All", count: totalAllUsers, href: buildHref({ tier: "", page: "1" }) },
    ...byTierResult.rows.map((r) => {
      const value = r.membership_tier ?? "(none)";
      return {
        value,
        label: value,
        count: parseInt(r.count, 10),
        href: buildHref({ tier: value, page: "1" }),
      };
    }),
  ];

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        // Make the User cell the link target — semantic anchor inside the
        // cell (rather than wrapping the whole <tr>, which is invalid HTML).
        <Link href={`/catalog/users/${u.id}`} className="block group">
          <p className="text-white font-medium group-hover:text-amber-300">
            {u.name ?? u.username ?? "—"}
          </p>
          <p className="text-xs text-neutral-500">{u.email}</p>
          {u.username && <p className="text-xs text-neutral-600">@{u.username}</p>}
        </Link>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      render: (u) => u.membership_tier ?? <span className="text-neutral-600">—</span>,
    },
    {
      key: "credit",
      header: "Credit",
      align: "right",
      cellClass: "font-mono",
      render: (u) =>
        parseFloat(u.store_credit_balance) > 0
          ? fmtGBP(u.store_credit_balance)
          : <span className="text-neutral-600">—</span>,
    },
    {
      key: "points",
      header: "Points",
      align: "right",
      cellClass: "font-mono",
      render: (u) =>
        u.points_balance > 0
          ? u.points_balance.toLocaleString()
          : <span className="text-neutral-600">—</span>,
    },
    {
      key: "trust",
      header: (
        <>
          Trust{" "}
          <WhyLink href="https://cambridgetcg.com/methodology/trust-score" />
        </>
      ),
      align: "right",
      cellClass: "font-mono",
      render: (u) => u.trust_score,
    },
    {
      key: "trades",
      header: "Trades",
      align: "right",
      cellClass: "font-mono",
      hideOnMobile: true,
      render: (u) => u.trade_count,
    },
    {
      key: "country",
      header: "Country",
      hideOnMobile: true,
      render: (u) => u.country ?? <span className="text-neutral-600">—</span>,
    },
    {
      key: "joined",
      header: "Joined",
      hideOnMobile: true,
      cellClass: "text-xs text-neutral-400 whitespace-nowrap",
      render: (u) => fmtDate(u.created_at),
    },
    {
      key: "flags",
      header: "Flags",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.role === "admin" && (
            <span className="inline-block px-1.5 py-0.5 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded">
              admin
            </span>
          )}
          {u.is_verified && (
            <span className="inline-block px-1.5 py-0.5 text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded">
              verified
            </span>
          )}
          {u.bank_verified && (
            <span className="inline-block px-1.5 py-0.5 text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded">
              bank
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        provenance={<Provenance kind="live" />}
        description="Storefront users — registered customers with auth sessions, tier, credit, points, and trust. Click a row to drill into the full cross-module picture."
      />

      <FilterPills selected={tier} pills={tierPills} />

      <SearchForm
        action="/catalog/users"
        value={q}
        placeholder="Search by email, name, or username"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ tier, role }}
      />

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(u) => u.id}
        emptyMessage="No users match the current filter."
        minWidth={960}
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

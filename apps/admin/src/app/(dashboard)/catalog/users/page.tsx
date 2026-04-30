/**
 * Storefront users — paginated search.
 *
 * Closes Love's "user search is impossible (UUID-only)" gap. Reads from
 * the storefront `users` table; supports search by email/name/username
 * and filter by membership tier.
 */
import { sfQuery } from "@/lib/db";
import Link from "next/link";

// Root layout's title template appends "— Cambridge TCG Admin"; don't double it.
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
    where.push(`membership_tier = $${i}`);
    params.push(tier);
    i += 1;
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

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (q && overrides.q !== "") next.set("q", overrides.q ?? q);
    const newTier = overrides.tier !== undefined ? overrides.tier : tier;
    if (newTier) next.set("tier", newTier);
    const newRole = overrides.role !== undefined ? overrides.role : role;
    if (newRole) next.set("role", newRole);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/catalog/users${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Users</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Storefront users — registered customers with auth sessions, tier, credit, points, and trust.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href={buildHref({ tier: "", page: "1" })}
          className={`px-3 py-1 rounded-full border ${
            !tier
              ? "border-blue-500 bg-blue-500/10 text-blue-300"
              : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
          }`}
        >
          All ({byTierResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0)})
        </Link>
        {byTierResult.rows.map((r) => (
          <Link
            key={r.membership_tier ?? "none"}
            href={buildHref({ tier: r.membership_tier ?? "", page: "1" })}
            className={`px-3 py-1 rounded-full border ${
              tier === (r.membership_tier ?? "")
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            {r.membership_tier ?? "(none)"} ({r.count})
          </Link>
        ))}
      </nav>

      <form className="flex gap-2" action="/catalog/users">
        {tier && <input type="hidden" name="tier" value={tier} />}
        {role && <input type="hidden" name="role" value={role} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email, name, or username"
          className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-md text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
        >
          Search
        </button>
        {q && (
          <Link
            href={buildHref({ q: "", page: "1" })}
            className="px-4 py-2 border border-neutral-800 text-neutral-400 hover:text-white text-sm rounded-md transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-lg border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Tier</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="text-right px-3 py-2">Points</th>
              <th className="text-right px-3 py-2">Trust</th>
              <th className="text-right px-3 py-2">Trades</th>
              <th className="text-left px-3 py-2">Country</th>
              <th className="text-left px-3 py-2">Joined</th>
              <th className="text-left px-3 py-2">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rowsResult.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                  No users match the current filter.
                </td>
              </tr>
            ) : (
              rowsResult.rows.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-900/50">
                  <td className="px-3 py-2">
                    <div className="text-white">{u.name ?? u.username ?? "—"}</div>
                    <div className="text-xs text-neutral-500">{u.email}</div>
                    {u.username && (
                      <div className="text-xs text-neutral-600">@{u.username}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-300">
                    {u.membership_tier ?? <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-300">
                    {parseFloat(u.store_credit_balance) > 0
                      ? `£${parseFloat(u.store_credit_balance).toFixed(2)}`
                      : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-300">
                    {u.points_balance > 0 ? u.points_balance.toLocaleString() : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-300">
                    {u.trust_score}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-300">
                    {u.trade_count}
                  </td>
                  <td className="px-3 py-2 text-neutral-400 text-xs">
                    {u.country ?? <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 space-x-1">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            Showing {offset + 1}–{Math.min(offset + rowsResult.rows.length, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded"
              >
                ← Prev
              </Link>
            )}
            <span className="px-3 py-1 text-neutral-400">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1 border border-neutral-800 hover:border-neutral-700 text-white rounded"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

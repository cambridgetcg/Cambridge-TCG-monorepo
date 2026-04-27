import { db } from "@/lib/db";
import { stockAdjustments, cards } from "@/lib/db/schema";
import { desc, eq, sql, ilike, or, SQL } from "drizzle-orm";

const PER_PAGE = 50;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const query = params.q?.trim() || "";

  const conditions: SQL[] = [];
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      or(
        ilike(cards.cardNumber, pattern),
        ilike(cards.name, pattern),
        ilike(cards.sku, pattern),
      )!,
    );
  }

  const whereClause = conditions.length
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : undefined;

  const [countResult] = await db
    .select({ total: sql<number>`count(*)` })
    .from(stockAdjustments)
    .leftJoin(cards, eq(stockAdjustments.cardId, cards.id))
    .where(whereClause);

  const total = Number(countResult.total);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const rows = await db
    .select({
      id: stockAdjustments.id,
      delta: stockAdjustments.delta,
      reason: stockAdjustments.reason,
      note: stockAdjustments.note,
      createdAt: stockAdjustments.createdAt,
      cardNumber: cards.cardNumber,
      cardName: cards.nameEn,
      cardNameJp: cards.name,
      setCode: cards.setCode,
      sku: cards.sku,
    })
    .from(stockAdjustments)
    .leftJoin(cards, eq(stockAdjustments.cardId, cards.id))
    .where(whereClause)
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(PER_PAGE)
    .offset((safePage - 1) * PER_PAGE);

  const reasonLabels: Record<string, string> = {
    count: "Stock count",
    damage: "Damaged",
    loss: "Lost",
    found: "Found",
    correction: "Correction",
    other: "Other",
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Stock Adjustments</h1>
        <span className="text-sm text-gray-400">
          {total} adjustment{total !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        All manual stock changes are recorded here and persist through sync operations.
      </p>

      {/* Search */}
      <form className="mb-4 flex gap-2" action="/admin/stock-adjustments">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by card number, name, or SKU..."
          className="rounded bg-[#12121a] border border-[#1e1e2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none w-72"
        />
        <button
          type="submit"
          className="rounded bg-brand-600 px-3 py-2 text-sm font-medium hover:bg-brand-700 transition"
        >
          Search
        </button>
        {query && (
          <a
            href="/admin/stock-adjustments"
            className="rounded bg-[#1e1e2e] px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Card</th>
              <th className="px-4 py-3 font-medium">Set</th>
              <th className="px-4 py-3 font-medium text-center">Delta</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-[#12121a] transition">
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "\u2014"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-brand-500">{row.cardNumber}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[200px]">
                    {row.cardName || row.cardNameJp || "\u2014"}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{row.setCode || "\u2014"}</td>
                <td className="px-4 py-3 text-center font-bold">
                  <span className={row.delta > 0 ? "text-green-400" : row.delta < 0 ? "text-red-400" : "text-gray-400"}>
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {reasonLabels[row.reason ?? ""] ?? row.reason}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[200px]">
                  {row.note || "\u2014"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No adjustments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {safePage > 1 && (
            <a
              href={`/admin/stock-adjustments?page=${safePage - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="rounded bg-[#1e1e2e] px-3 py-1 text-sm hover:bg-[#2e2e3e] transition"
            >
              Prev
            </a>
          )}
          <span className="text-sm text-gray-400">
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages && (
            <a
              href={`/admin/stock-adjustments?page=${safePage + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="rounded bg-[#1e1e2e] px-3 py-1 text-sm hover:bg-[#2e2e3e] transition"
            >
              Next
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Stock management page — read-only prototype.
 *
 * Three sections:
 *   (a) Current levels — paginated table of all cards with stock info
 *   (b) Low-stock list — cards at or below their reorder target
 *   (c) Recent movements — last 50 movements across all cards
 *
 * Data sources:
 *   - Levels: direct SQL via wsQuery (StockReader.getLevels takes card IDs;
 *     we need all-cards paginated — see docs/architecture/stock-prototype-gaps.md #1)
 *   - Reorder queue: packages/stock StockReader.listReorderQueue (raw SQL, works standalone)
 *   - Movements: direct SQL via wsQuery (StockReader.getMovements requires a cardId;
 *     see docs/architecture/stock-prototype-gaps.md #2)
 *
 * Prototype constraints:
 *   - Read-only. No write operations.
 *   - Uses Tailwind directly. No shadcn/ui.
 *   - Falls back gracefully when reserved_stock / stock_reconciled_at columns
 *     don't yet exist in the wholesale DB (stock package migration not yet applied).
 */

import { Suspense } from "react";
import { wsQuery, wholesaleDb } from "@/lib/db";
import { createStockService } from "@cambridge-tcg/stock";
import {
  stockMovements,
  stockTargets,
} from "@cambridge-tcg/stock/schema";
import { SearchBox, Pagination } from "./StockTable";

export const metadata = { title: "Stock Management" };

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const LOW_STOCK_LIMIT = 30;
const MOVEMENTS_LIMIT = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LevelRow {
  id: number;
  name: string;
  sku: string;
  on_hand: number;
  reserved: number;
  available: number;
  pending: number;
}

interface LevelsResult {
  rows: LevelRow[];
  total: number;
  hasReservedColumn: boolean;
}

interface ReorderRow {
  cardId: number;
  sku: string;
  name: string;
  currentStock: number;
  pendingStock: number;
  targetQty: number;
  toOrder: number;
}

interface MovementRow {
  id: number;
  card_id: number;
  card_name: string | null;
  kind: string;
  delta: number;
  reference_id: string | null;
  channel: string;
  created_at: string;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchLevels(
  search: string,
  page: number
): Promise<LevelsResult> {
  const offset = page * PAGE_SIZE;

  // Probe whether reserved_stock column exists (stock migration may not be applied yet)
  let hasReservedColumn = true;
  try {
    await wsQuery(
      "SELECT reserved_stock FROM cards LIMIT 1"
    );
  } catch {
    hasReservedColumn = false;
  }

  const reservedExpr = hasReservedColumn
    ? "COALESCE(c.reserved_stock, 0)"
    : "0";

  const searchClause = search
    ? `AND (c.name ILIKE '%' || $1 || '%' OR c.sku ILIKE '%' || $1 || '%')`
    : "";

  // Total count
  const countParams: unknown[] = search ? [search] : [];
  const { rows: countRows } = await wsQuery<{ total: string }>(
    `SELECT COUNT(*) as total FROM cards c WHERE c.stock > 0 ${searchClause}`,
    countParams
  );
  const total = parseInt(countRows[0]?.total ?? "0", 10);

  // Data rows — sorted by on_hand ASC (lowest stock first)
  const dataParams: unknown[] = search ? [search, PAGE_SIZE, offset] : [PAGE_SIZE, offset];
  const searchParamOffset = search ? 1 : 0;
  const limitParam = `$${searchParamOffset + 1}`;
  const offsetParam = `$${searchParamOffset + 2}`;

  const { rows } = await wsQuery<LevelRow>(
    `SELECT
       c.id,
       COALESCE(c.name, c.sku) as name,
       c.sku,
       c.stock               as on_hand,
       ${reservedExpr}       as reserved,
       GREATEST(c.stock - ${reservedExpr}, 0) as available,
       COALESCE(c.pending_stock, 0) as pending
     FROM cards c
     WHERE c.stock > 0
       ${searchClause}
     ORDER BY c.stock ASC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    dataParams
  );

  return { rows, total, hasReservedColumn };
}

async function fetchReorderQueue(): Promise<ReorderRow[]> {
  // Use packages/stock's listReorderQueue — it handles the price-band join
  const { db } = wholesaleDb();

  // We need to pass cardsTable, purchasesTable, purchaseItemsTable references.
  // The stock package accepts any Drizzle table refs with matching column shapes.
  // For listReorderQueue, it only uses raw SQL against the wholesale DB, so
  // we pass minimal stubs — the method uses db.execute(sql`...`) directly.
  //
  // Note: This is a gap in the stock package design (Gap #3 in the gap doc).
  // listReorderQueue uses raw SQL so it doesn't actually need the table refs.
  // But the factory signature requires them. We pass null-shaped stubs.
  //
  // If this approach causes issues in a future mission, the fix is to expose
  // listReorderQueue as a standalone function that only needs a DbClient.
  try {
    // Fallback to direct SQL — more reliable in the prototype context
    const { rows } = await wsQuery<{
      card_id: number;
      sku: string;
      name: string;
      current_stock: number;
      pending_stock: number;
      target_qty: number;
      to_order: number;
    }>(
      `SELECT
         c.id as card_id,
         c.sku,
         COALESCE(c.name, c.sku) as name,
         c.stock as current_stock,
         COALESCE(c.pending_stock, 0) as pending_stock,
         st.target_qty,
         GREATEST(st.target_qty - c.stock - COALESCE(c.pending_stock, 0), 0) as to_order
       FROM cards c
       JOIN stock_targets st
         ON c.price >= st.price_min AND c.price < st.price_max
       WHERE st.target_qty - c.stock - COALESCE(c.pending_stock, 0) >= 1
       ORDER BY (st.target_qty - c.stock - COALESCE(c.pending_stock, 0)) DESC
       LIMIT $1`,
      [LOW_STOCK_LIMIT]
    );

    return rows.map((r) => ({
      cardId: r.card_id,
      sku: r.sku,
      name: r.name,
      currentStock: Number(r.current_stock),
      pendingStock: Number(r.pending_stock),
      targetQty: Number(r.target_qty),
      toOrder: Number(r.to_order),
    }));
  } catch (err) {
    // stock_targets table may not exist yet
    console.error("[stock-page] reorder queue error:", err);
    return [];
  }
}

async function fetchRecentMovements(): Promise<MovementRow[]> {
  // Direct SQL — StockReader.getMovements requires a cardId (Gap #2)
  try {
    const { rows } = await wsQuery<MovementRow>(
      `SELECT
         sm.id,
         sm.card_id,
         COALESCE(c.name, c.sku, sm.card_id::text) as card_name,
         sm.kind,
         sm.delta,
         sm.reference_id,
         sm.channel,
         sm.created_at
       FROM stock_movements sm
       LEFT JOIN cards c ON c.id = sm.card_id
       ORDER BY sm.created_at DESC
       LIMIT $1`,
      [MOVEMENTS_LIMIT]
    );
    return rows;
  } catch (err) {
    // stock_movements table may not exist yet
    console.error("[stock-page] movements error:", err);
    return [];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {count !== undefined && (
        <span className="text-xs text-neutral-500">{count.toLocaleString()}</span>
      )}
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">{children}</table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-medium text-neutral-400 uppercase tracking-wide bg-neutral-900/80 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-neutral-200 border-t border-neutral-800 ${className}`}
    >
      {children}
    </td>
  );
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="px-4 py-8 text-center text-neutral-500 text-sm border-t border-neutral-800"
      >
        {message}
      </td>
    </tr>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const cls = isPositive
    ? "text-emerald-400"
    : delta < 0
    ? "text-red-400"
    : "text-neutral-500";
  return (
    <span className={`font-mono ${cls}`}>
      {isPositive ? "+" : ""}
      {delta}
    </span>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const colours: Record<string, string> = {
    sale: "bg-red-500/10 text-red-400",
    fulfillment: "bg-orange-500/10 text-orange-400",
    purchase_received: "bg-emerald-500/10 text-emerald-400",
    return: "bg-blue-500/10 text-blue-400",
    correction: "bg-purple-500/10 text-purple-400",
    reconciliation: "bg-yellow-500/10 text-yellow-400",
    damage: "bg-neutral-500/10 text-neutral-400",
    loss: "bg-neutral-500/10 text-neutral-400",
    found: "bg-teal-500/10 text-teal-400",
  };
  const cls = colours[kind] ?? "bg-neutral-500/10 text-neutral-400";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${cls}`}>
      {kind}
    </span>
  );
}

function MigrationWarning() {
  return (
    <div className="mb-4 px-4 py-3 rounded-lg border border-amber-700/50 bg-amber-950/30 text-amber-400 text-sm">
      <strong>Migration pending:</strong> The <code>reserved_stock</code> column
      hasn't been added to the wholesale DB yet. Reserved and available counts
      show as 0 until the stock package migration runs.
      <br />
      <span className="text-neutral-500 text-xs mt-1 block">
        See <code>docs/architecture/stock-prototype-gaps.md#gap-5</code> for the migration SQL.
      </span>
    </div>
  );
}

// ─── Section: Current Levels ──────────────────────────────────────────────────

async function LevelsSection({
  search,
  page,
}: {
  search: string;
  page: number;
}) {
  const { rows, total, hasReservedColumn } = await fetchLevels(search, page);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section data-testid="stock-levels" className="mb-10">
      <SectionHeader title="Current Levels" count={total} />

      {!hasReservedColumn && <MigrationWarning />}

      <div className="mb-3 max-w-sm">
        <SearchBox value={search} placeholder="Search by name or SKU…" />
      </div>

      <TableWrapper>
        <thead>
          <tr>
            <Th>Card</Th>
            <Th>SKU</Th>
            <Th>On Hand</Th>
            <Th>Reserved</Th>
            <Th>Available</Th>
            <Th>Pending</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow
              cols={6}
              message={
                search
                  ? `No cards match "${search}"`
                  : "No cards with positive stock"
              }
            />
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-neutral-800/30 transition-colors">
                <Td>
                  <span className="text-white font-medium line-clamp-1">{row.name}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-neutral-400">{row.sku}</span>
                </Td>
                <Td className="font-mono text-right">{row.on_hand}</Td>
                <Td className="font-mono text-right text-neutral-400">
                  {row.reserved}
                </Td>
                <Td className="font-mono text-right">
                  <span
                    className={
                      row.available === 0 ? "text-red-400" : "text-emerald-400"
                    }
                  >
                    {row.available}
                  </span>
                </Td>
                <Td className="font-mono text-right text-blue-400">
                  {row.pending > 0 ? `+${row.pending}` : "—"}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrapper>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRows={total}
        pageSize={PAGE_SIZE}
      />
    </section>
  );
}

// ─── Section: Low-Stock / Reorder Queue ──────────────────────────────────────

async function ReorderSection() {
  const rows = await fetchReorderQueue();

  return (
    <section data-testid="stock-reorder" className="mb-10">
      <SectionHeader
        title="Reorder Queue"
        count={rows.length}
      />
      <p className="text-sm text-neutral-500 mb-3">
        Cards where current stock + pending is below the price-band target.
        Sorted by deficit (largest first).
      </p>

      <TableWrapper>
        <thead>
          <tr>
            <Th>Card</Th>
            <Th>SKU</Th>
            <Th>On Hand</Th>
            <Th>Pending</Th>
            <Th>Target</Th>
            <Th>To Order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow
              cols={6}
              message="All stock at or above target — no reorders needed"
            />
          ) : (
            rows.map((row) => (
              <tr key={row.cardId} className="hover:bg-neutral-800/30 transition-colors">
                <Td>
                  <span className="text-white font-medium line-clamp-1">{row.name}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-neutral-400">{row.sku}</span>
                </Td>
                <Td className="font-mono text-right">{row.currentStock}</Td>
                <Td className="font-mono text-right text-blue-400">
                  {row.pendingStock > 0 ? `+${row.pendingStock}` : "—"}
                </Td>
                <Td className="font-mono text-right text-neutral-400">
                  {row.targetQty}
                </Td>
                <Td className="font-mono text-right">
                  <span className="text-red-400 font-semibold">{row.toOrder}</span>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrapper>
    </section>
  );
}

// ─── Section: Recent Movements ────────────────────────────────────────────────

async function MovementsSection() {
  const rows = await fetchRecentMovements();

  return (
    <section data-testid="stock-movements" className="mb-10">
      <SectionHeader
        title="Recent Movements"
        count={rows.length}
      />
      <p className="text-sm text-neutral-500 mb-3">
        Last {MOVEMENTS_LIMIT} stock movements across all cards, newest first.
      </p>

      <TableWrapper>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Card</Th>
            <Th>Kind</Th>
            <Th>Delta</Th>
            <Th>Channel</Th>
            <Th>Reference</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow
              cols={6}
              message="No movements recorded yet"
            />
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-neutral-800/30 transition-colors">
                <Td>
                  <span className="text-neutral-400 text-xs font-mono whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </Td>
                <Td>
                  <span className="text-white line-clamp-1 max-w-[200px] block">
                    {row.card_name ?? `#${row.card_id}`}
                  </span>
                </Td>
                <Td>
                  <KindBadge kind={row.kind} />
                </Td>
                <Td>
                  <DeltaBadge delta={row.delta} />
                </Td>
                <Td>
                  <span className="text-neutral-400 text-xs">{row.channel}</span>
                </Td>
                <Td>
                  <span className="text-neutral-500 text-xs font-mono truncate max-w-[180px] block">
                    {row.reference_id ?? "—"}
                  </span>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrapper>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function StockPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const page = Math.max(0, parseInt(params.page ?? "0", 10));

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Stock Management</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Wholesale inventory — levels, reorder queue, and movement history.
          Read-only view backed by the wholesale database.
        </p>
      </div>

      {/* Current Levels — paginated, searchable */}
      <Suspense
        fallback={
          <section className="mb-10">
            <div className="h-5 w-40 bg-neutral-800 rounded animate-pulse mb-3" />
            <div className="rounded-lg border border-neutral-800 h-64 animate-pulse" />
          </section>
        }
      >
        <LevelsSection search={search} page={page} />
      </Suspense>

      {/* Reorder Queue */}
      <Suspense
        fallback={
          <section className="mb-10">
            <div className="h-5 w-36 bg-neutral-800 rounded animate-pulse mb-3" />
            <div className="rounded-lg border border-neutral-800 h-48 animate-pulse" />
          </section>
        }
      >
        <ReorderSection />
      </Suspense>

      {/* Recent Movements */}
      <Suspense
        fallback={
          <section className="mb-10">
            <div className="h-5 w-44 bg-neutral-800 rounded animate-pulse mb-3" />
            <div className="rounded-lg border border-neutral-800 h-64 animate-pulse" />
          </section>
        }
      >
        <MovementsSection />
      </Suspense>
    </div>
  );
}

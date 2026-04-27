import { Suspense } from "react";
import { db } from "@/lib/db";
import { cards, games, sets as setsTable } from "@/lib/db/schema";
import { ilike, or, eq, asc, desc, count, sql, SQL, gt, gte, lte, and, getTableColumns } from "drizzle-orm";
import StockTable from "./StockTable";

const PER_PAGE = 50;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export default async function StockLevelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    game?: string;
    set?: string;
    sort?: string;
    order?: string;
    page?: string;
    stocked?: string;
    ebay?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const gameFilter = params.game?.trim() || "";
  const setFilter = params.set?.trim() || "";
  const sortField = params.sort || "cardNumber";
  const sortOrder = params.order === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const stockedOnly = params.stocked === "1";
  const ebayOnly = params.ebay === "1";

  const allGames = await db.select().from(games).orderBy(asc(games.sortOrder));

  // Build where conditions
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
  if (gameFilter) {
    const game = allGames.find((g) => g.code === gameFilter);
    if (game) conditions.push(eq(cards.gameId, game.id));
  }
  if (setFilter) {
    conditions.push(eq(cards.setCode, setFilter));
  }
  if (stockedOnly) {
    conditions.push(or(gt(cards.stock, 0), gt(cards.pendingStock, 0))!);
  }
  if (ebayOnly) {
    conditions.push(and(gt(cards.stock, 0), gte(cards.price, 3), lte(cards.price, 30))!);
  }
  // Only singles
  conditions.push(eq(cards.category, "singles"));

  const whereClause = conditions.length > 0
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : undefined;

  // Sort
  let orderByClause;
  if (sortField === "stock") {
    orderByClause = sortOrder === "desc" ? desc(cards.stock) : asc(cards.stock);
  } else if (sortField === "name") {
    orderByClause = sortOrder === "desc" ? desc(cards.name) : asc(cards.name);
  } else if (sortField === "set") {
    orderByClause = sortOrder === "desc"
      ? [desc(cards.setCode), desc(cards.cardNumber)]
      : [asc(cards.setCode), asc(cards.cardNumber)];
  } else {
    orderByClause = sortOrder === "desc" ? desc(cards.cardNumber) : asc(cards.cardNumber);
  }

  // Set dropdown
  const setConditions: SQL[] = [];
  if (gameFilter) {
    const game = allGames.find((g) => g.code === gameFilter);
    if (game) setConditions.push(eq(setsTable.gameId, game.id));
  }

  const [countResult, allCards, setRows] = await Promise.all([
    db.select({ total: count() }).from(cards).where(whereClause),
    db
      .select(getTableColumns(cards))
      .from(cards)
      .leftJoin(setsTable, eq(cards.setId, setsTable.id))
      .where(whereClause)
      .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db
      .select({ code: setsTable.code, name: setsTable.name })
      .from(setsTable)
      .where(setConditions.length ? setConditions[0] : undefined)
      .orderBy(asc(setsTable.code)),
  ]);

  const total = countResult[0].total;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const sets = setRows.map((r) => ({ code: r.code, name: r.name }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Stock Levels</h1>
        <span className="text-sm text-gray-400">
          {total} card{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Game tabs */}
      <Suspense>
        <GameTabs
          games={allGames.map((g) => ({ code: g.code, name: g.name, active: g.active ?? true }))}
          currentGame={gameFilter}
        />
      </Suspense>

      {/* Filters */}
      <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <StockFilters
            sets={sets}
            currentQuery={query}
            currentSet={setFilter}
            currentSort={sortField}
            currentOrder={sortOrder}
            stockedOnly={stockedOnly}
            ebayOnly={ebayOnly}
          />
        </Suspense>
      </div>

      {/* Table */}
      <Suspense>
        <StockTable
          cards={allCards}
          currentSort={sortField}
          currentOrder={sortOrder}
        />
      </Suspense>

      {/* Pagination */}
      <Suspense>
        <StockPagination currentPage={safePage} totalPages={totalPages} />
      </Suspense>
    </div>
  );
}

/* ---------- Inline client components ---------- */

function GameTabs({
  games,
  currentGame,
}: {
  games: { code: string; name: string; active: boolean }[];
  currentGame: string;
}) {
  return <GameTabsClient games={games} currentGame={currentGame} />;
}

/* We need small client wrappers for URL-driven navigation */
import GameTabsClient from "./GameTabsClient";
import StockFilters from "./StockFilters";
import StockPagination from "./StockPagination";

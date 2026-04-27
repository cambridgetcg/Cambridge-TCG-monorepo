import { Suspense } from "react";
import { db } from "@/lib/db";
import { cards, games, sets as setsTable, wantedCards } from "@/lib/db/schema";
import { ilike, or, eq, asc, desc, count, max, gte, lte, sql, SQL, getTableColumns } from "drizzle-orm";
import { auth } from "@/lib/auth";
import Nav from "@/components/Nav";
import GameTabs from "@/components/catalog/GameTabs";
import CategoryToggle from "@/components/catalog/CategoryToggle";
import SearchBar from "@/components/catalog/SearchBar";
import CardTable from "@/components/catalog/CardTable";
import Pagination from "@/components/catalog/Pagination";
import { CatalogFilterProvider } from "@/components/catalog/CatalogFilterContext";

const PER_PAGE = 50;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    game?: string;
    set?: string;
    category?: string;
    sort?: string;
    order?: string;
    page?: string;
    priceMin?: string;
    priceMax?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const gameFilter = params.game?.trim() || "";
  const setFilter = params.set?.trim() || "";
  const categoryFilter = params.category?.trim() || "singles";
  const sortField = params.sort || "cardNumber";
  const sortOrder = params.order === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const priceMin = params.priceMin?.trim() || "";
  const priceMax = params.priceMax?.trim() || "";

  const session = await auth();
  const clientId = session?.user?.id ? parseInt(session.user.id) : null;

  const [allGames, wantedRows] = await Promise.all([
    db.select().from(games).orderBy(asc(games.sortOrder)),
    clientId
      ? db.select({ cardId: wantedCards.cardId }).from(wantedCards).where(eq(wantedCards.clientId, clientId))
      : Promise.resolve([]),
  ]);
  const wantedIds = wantedRows.map((r) => r.cardId);

  // Build where conditions
  const conditions: SQL[] = [];
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      or(
        ilike(cards.name, pattern),
        ilike(cards.cardNumber, pattern),
        ilike(cards.sku, pattern)
      )!
    );
  }

  // Game filter
  if (gameFilter) {
    const game = allGames.find(g => g.code === gameFilter);
    if (game) conditions.push(eq(cards.gameId, game.id));
  }

  // Set filter
  if (setFilter) {
    conditions.push(eq(cards.setCode, setFilter));
  }

  // Category filter
  conditions.push(eq(cards.category, categoryFilter as "singles" | "sealed"));

  // Price filter
  if (priceMin) {
    const min = parseFloat(priceMin);
    if (!isNaN(min)) conditions.push(gte(cards.price, min));
  }
  if (priceMax) {
    const max_ = parseFloat(priceMax);
    if (!isNaN(max_)) conditions.push(lte(cards.price, max_));
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((a, b) => {
        return sql`${a} AND ${b}`;
      })
    : undefined;

  // Sort column
  let orderByClause;
  if (sortField === "price") {
    orderByClause = sortOrder === "desc" ? desc(cards.price) : asc(cards.price);
  } else if (sortField === "name") {
    orderByClause = sortOrder === "desc" ? desc(cards.name) : asc(cards.name);
  } else if (sortField === "set") {
    // Sort by setCode then cardNumber within set
    orderByClause = sortOrder === "desc"
      ? [desc(cards.setCode), desc(cards.cardNumber)]
      : [asc(cards.setCode), asc(cards.cardNumber)];
  } else if (sortField === "newest") {
    // Sort by set release order using sets.sortOrder (via LEFT JOIN), newest first
    orderByClause = [desc(setsTable.sortOrder), asc(cards.cardNumber)];
  } else {
    orderByClause = sortOrder === "desc" ? desc(cards.cardNumber) : asc(cards.cardNumber);
  }

  // Build set dropdown conditions
  const setConditions: SQL[] = [];
  if (gameFilter) {
    const game = allGames.find(g => g.code === gameFilter);
    if (game) setConditions.push(eq(setsTable.gameId, game.id));
  }

  // Phase 2: parallel — count, cards, sets, lastSynced
  const [countResult, allCards, setRows, lastSyncedResult] = await Promise.all([
    db.select({ total: count() }).from(cards).where(whereClause),
    db.select(getTableColumns(cards))
      .from(cards)
      .leftJoin(setsTable, eq(cards.setId, setsTable.id))
      .where(whereClause)
      .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ code: setsTable.code, name: setsTable.name })
      .from(setsTable)
      .where(setConditions.length ? setConditions[0] : undefined)
      .orderBy(asc(setsTable.code)),
    db.select({ lastSynced: max(cards.lastSyncedAt) }).from(cards),
  ]);

  const total = countResult[0].total;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const sets = setRows.map((r) => ({ code: r.code, name: r.name }));
  const lastSynced = lastSyncedResult[0].lastSynced;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <CatalogFilterProvider>
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Card Catalog</h1>
            </div>
          </div>

          {/* Game tabs */}
          <Suspense>
            <GameTabs
              games={allGames.map(g => ({ code: g.code, name: g.name, active: g.active ?? true }))}
              currentGame={gameFilter}
            />
          </Suspense>

          {/* Category toggle + search/set filters */}
          <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-4">
            <Suspense>
              <CategoryToggle currentCategory={categoryFilter} />
            </Suspense>
            <Suspense>
              <SearchBar sets={sets} currentQuery={query} currentSet={setFilter} currentSort={sortField} currentOrder={sortOrder} currentPriceMin={priceMin} currentPriceMax={priceMax} currentCategory={categoryFilter} />
            </Suspense>
          </div>

          <Suspense>
            <CardTable
              cards={allCards}
              currentSort={sortField}
              currentOrder={sortOrder}
              lastSynced={lastSynced instanceof Date ? lastSynced.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null}
              currentCategory={categoryFilter}
              wantedIds={wantedIds}
            />
          </Suspense>

          <Suspense>
            <Pagination currentPage={safePage} totalPages={totalPages} />
          </Suspense>

          <p className="mt-4 text-xs text-gray-500">
            {total} card{total !== 1 ? "s" : ""} total &middot; All prices include VAT
          </p>
        </CatalogFilterProvider>
      </main>
    </>
  );
}

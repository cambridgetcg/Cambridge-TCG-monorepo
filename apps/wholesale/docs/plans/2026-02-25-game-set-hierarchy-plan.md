# Game/Set Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add game → set → card hierarchy with catalog filtering by game, category (singles/sealed), and enriched set selector.

**Architecture:** New `games` and `sets` tables with FK relationships to `cards`. Catalog page gets game tabs, category toggle, and upgraded set filter. Sync route auto-creates game/set records. Admin gets a games/sets management page.

**Tech Stack:** Drizzle ORM (SQLite), Next.js 15 App Router (RSC + client components), Tailwind CSS dark theme, `drizzle-kit push` for schema changes.

**No test framework exists** — verify each task with `pnpm build` (type-checks) and `pnpm dev` (visual).

---

### Task 1: Schema — `games` and `sets` tables

**Files:**
- Modify: `src/lib/db/schema.ts`

**Step 1: Add `games` table to schema**

After the `clients` table definition, add:

```ts
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0),
  active: integer("active", { mode: "boolean" }).default(true),
});
```

**Step 2: Add `sets` table to schema**

After the `games` table:

```ts
export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull().references(() => games.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  releaseDate: text("release_date"),
  sortOrder: integer("sort_order").default(0),
  active: integer("active", { mode: "boolean" }).default(true),
});
```

**Step 3: Add new columns to `cards` table**

Add these columns to the existing `cards` table definition:

```ts
gameId: integer("game_id").references(() => games.id),
setId: integer("set_id").references(() => sets.id),
category: text("category", { enum: ["singles", "sealed"] }).notNull().default("singles"),
productType: text("product_type"),
imageUrl: text("image_url"),
```

Note: `gameId` and `setId` are nullable in the schema (no `.notNull()`) because existing cards need to survive the push before seed repopulates them. The seed and sync route will always provide them.

**Step 4: Add type exports**

```ts
export type Game = typeof games.$inferSelect;
export type GameSet = typeof sets.$inferSelect;
```

**Step 5: Verify**

Run: `pnpm build`
Expected: Type-checks pass. (Build may warn about missing tables but that's fine until push.)

**Step 6: Push schema to DB**

Run: `pnpm db:push`
Expected: New tables created, cards table altered with new columns.

**Step 7: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add games and sets tables, extend cards with gameId/setId/category"
```

---

### Task 2: Seed data — games, sets, and card mappings

**Files:**
- Modify: `src/lib/db/seed.ts`

**Step 1: Add `games` and `sets` imports**

Update the import from `./schema` to include `games, sets`.

**Step 2: Add raw SQL CREATE TABLE statements for new tables**

Add after the `price_history` CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  release_date TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
```

Also add the new columns to the `cards` CREATE TABLE:

```sql
game_id INTEGER REFERENCES games(id),
set_id INTEGER REFERENCES sets(id),
category TEXT NOT NULL DEFAULT 'singles',
product_type TEXT,
image_url TEXT
```

**Step 3: Seed games**

After seeding the test client, seed 4 games:

```ts
const gameData = [
  { code: "onepiece", name: "One Piece", slug: "one-piece", sortOrder: 0, active: true },
  { code: "pokemon", name: "Pokémon", slug: "pokemon", sortOrder: 1, active: false },
  { code: "yugioh", name: "Yu-Gi-Oh!", slug: "yu-gi-oh", sortOrder: 2, active: false },
  { code: "dragonball", name: "Dragon Ball", slug: "dragon-ball", sortOrder: 3, active: false },
];

for (const g of gameData) {
  await db.insert(games).values(g).onConflictDoNothing();
}
```

**Step 4: Seed One Piece sets**

Query the "onepiece" game ID, then seed all sets:

```ts
const onepieceGame = await db.select({ id: games.id }).from(games).where(eq(games.code, "onepiece")).get();
const onepieceId = onepieceGame!.id;

const setData = [
  { code: "OP01", name: "Romance Dawn", releaseDate: "2022-07-22", sortOrder: 0 },
  { code: "OP02", name: "Paramount War", releaseDate: "2022-11-04", sortOrder: 1 },
  { code: "OP03", name: "Pillars of Strength", releaseDate: "2023-01-27", sortOrder: 2 },
  { code: "OP04", name: "Kingdoms of Intrigue", releaseDate: "2023-05-27", sortOrder: 3 },
  { code: "OP05", name: "Awakening of the New Era", releaseDate: "2023-08-25", sortOrder: 4 },
  { code: "OP06", name: "Wings of the Captain", releaseDate: "2023-11-25", sortOrder: 5 },
  { code: "OP07", name: "500 Years in the Future", releaseDate: "2024-02-24", sortOrder: 6 },
  { code: "OP08", name: "Two Legends", releaseDate: "2024-05-25", sortOrder: 7 },
  { code: "OP09", name: "The Four Emperors", releaseDate: "2024-08-24", sortOrder: 8 },
  { code: "OP10", name: "Royal Blood", releaseDate: "2024-11-23", sortOrder: 9 },
  { code: "ST01", name: "Starter Deck: Straw Hat Crew", sortOrder: 100 },
  { code: "ST02", name: "Starter Deck: Worst Generation", sortOrder: 101 },
  { code: "ST03", name: "Starter Deck: The Seven Warlords", sortOrder: 102 },
  { code: "ST04", name: "Starter Deck: Animal Kingdom Pirates", sortOrder: 103 },
  { code: "ST05", name: "Starter Deck: Film Edition", sortOrder: 104 },
  { code: "ST06", name: "Starter Deck: Navy", sortOrder: 105 },
  { code: "ST07", name: "Starter Deck: Big Mom Pirates", sortOrder: 106 },
  { code: "ST08", name: "Starter Deck: Monkey D. Luffy", sortOrder: 107 },
  { code: "ST09", name: "Starter Deck: Yamato", sortOrder: 108 },
  { code: "ST10", name: "Starter Deck: Ultimate Deck", sortOrder: 109 },
  { code: "ST11", name: "Starter Deck: Uta", sortOrder: 110 },
  { code: "ST12", name: "Starter Deck: Zoro & Sanji", sortOrder: 111 },
  { code: "ST13", name: "Starter Deck: The Three Captains", sortOrder: 112 },
  { code: "ST14", name: "Starter Deck: 3D2Y", sortOrder: 113 },
  { code: "ST15", name: "Starter Deck: RED Edward Newgate", sortOrder: 114 },
  { code: "ST16", name: "Starter Deck: GREEN Uta", sortOrder: 115 },
  { code: "EB01", name: "Memorial Collection", releaseDate: "2024-01-27", sortOrder: 50 },
  { code: "PRB01", name: "Premium Booster", releaseDate: "2023-10-28", sortOrder: 51 },
];

for (const s of setData) {
  await db.insert(sets).values({ ...s, gameId: onepieceId }).onConflictDoNothing();
}
```

**Step 5: Update sample card inserts to include gameId and setId**

After inserting sets, build a lookup map for set IDs. Then update card inserts to include `gameId: onepieceId` and the resolved `setId`:

```ts
const allSets = await db.select({ id: sets.id, code: sets.code }).from(sets).where(eq(sets.gameId, onepieceId));
const setIdMap = Object.fromEntries(allSets.map(s => [s.code, s.id]));

// In each card insert, add:
// gameId: onepieceId,
// setId: setIdMap[c.setCode],
// category: "singles" as const,
```

**Step 6: Verify**

Run: `pnpm db:push && pnpm db:seed`
Expected: Database recreated with games, sets, and cards all linked.

**Step 7: Commit**

```bash
git add src/lib/db/seed.ts
git commit -m "feat: seed games, One Piece sets, and map cards to game/set"
```

---

### Task 3: Sync route — auto-create games/sets and map cards

**Files:**
- Modify: `src/app/api/sync/route.ts`
- Modify: `src/lib/s3.ts`

**Step 1: Update S3 module to export game code extraction**

In `src/lib/s3.ts`, add a helper function:

```ts
export function parseSkuGame(sku: string): string {
  // OP-OP01-001-JP → "onepiece"
  if (sku.startsWith("OP-")) return "onepiece";
  // Future: PKM-, YGO-, DBS- patterns
  return "unknown";
}
```

**Step 2: Update sync route to resolve game/set IDs**

In the sync route, after importing `games` and `sets` from schema:

1. Before the card loop, fetch/create the game record for "onepiece" (upsert).
2. For each card's `setCode`, fetch/create the set record (upsert).
3. Include `gameId`, `setId`, `category: "singles"` in the card insert/update.

Key logic:
```ts
// Get or create game
let game = await db.select().from(games).where(eq(games.code, "onepiece")).get();
if (!game) {
  await db.insert(games).values({
    code: "onepiece", name: "One Piece", slug: "one-piece", active: true, sortOrder: 0,
  });
  game = await db.select().from(games).where(eq(games.code, "onepiece")).get();
}

// Cache set lookups
const setCache = new Map<string, number>();

// Inside card loop, after parsing setCode:
if (!setCache.has(row.setCode)) {
  let set = await db.select().from(sets).where(eq(sets.code, row.setCode)).get();
  if (!set) {
    await db.insert(sets).values({
      gameId: game!.id, code: row.setCode, name: row.setName, sortOrder: 0,
    });
    set = await db.select().from(sets).where(eq(sets.code, row.setCode)).get();
  }
  setCache.set(row.setCode, set!.id);
}

// Add to card insert values:
// gameId: game!.id,
// setId: setCache.get(row.setCode)!,
// category: "singles",
```

Also add `gameId`, `setId`, `category` to the `onConflictDoUpdate` set.

**Step 3: Verify**

Run: `pnpm build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/app/api/sync/route.ts src/lib/s3.ts
git commit -m "feat: sync route auto-creates games/sets and maps cards"
```

---

### Task 4: Catalog data layer — fetch games, sets, and filter cards

**Files:**
- Modify: `src/app/catalog/page.tsx`

**Step 1: Update searchParams type**

Add `game`, `category` to the searchParams type:

```ts
searchParams: Promise<{
  q?: string;
  game?: string;
  set?: string;
  category?: string;
  sort?: string;
  order?: string;
  page?: string;
}>;
```

Parse them:
```ts
const gameFilter = params.game?.trim() || "";
const categoryFilter = params.category?.trim() || "singles";
```

**Step 2: Fetch games and sets for filter UI**

Replace the "distinct set codes" query with:

```ts
import { games, sets } from "@/lib/db/schema";

// Fetch all games (for tabs)
const allGames = await db
  .select()
  .from(games)
  .orderBy(asc(games.sortOrder));

// Fetch sets (filtered by game if selected)
const setConditions: SQL[] = [];
if (gameFilter) {
  const game = allGames.find(g => g.code === gameFilter);
  if (game) setConditions.push(eq(sets.gameId, game.id));
}
const allSets = await db
  .select()
  .from(sets)
  .where(setConditions.length ? setConditions[0] : undefined)
  .orderBy(desc(sets.sortOrder));
```

**Step 3: Update card query with game, set, and category filters**

Add to conditions:
```ts
if (gameFilter) {
  const game = allGames.find(g => g.code === gameFilter);
  if (game) conditions.push(eq(cards.gameId, game.id));
}
if (setFilter) {
  const set = allSets.find(s => s.code === setFilter);
  if (set) conditions.push(eq(cards.setId, set.id));
}
conditions.push(eq(cards.category, categoryFilter as "singles" | "sealed"));
```

**Step 4: Add sort options**

Extend the sort column logic:

```ts
let orderBy;
if (sortField === "price") {
  orderBy = sortOrder === "desc" ? desc(cards.priceExVat) : asc(cards.priceExVat);
} else if (sortField === "newest") {
  // Sort by set release date (newest first), need to join sets
  orderBy = desc(sets.sortOrder);
} else {
  orderBy = sortOrder === "desc" ? desc(cards.cardNumber) : asc(cards.cardNumber);
}
```

For the "newest" sort, join cards with sets to get release date ordering. Use a left join or subquery approach.

**Step 5: Pass new data to child components**

Pass `allGames`, `allSets`, `gameFilter`, `categoryFilter` to the SearchBar/filter components.

**Step 6: Verify**

Run: `pnpm build`
Expected: No type errors (child component updates come in next tasks).

**Step 7: Commit**

```bash
git add src/app/catalog/page.tsx
git commit -m "feat: catalog data layer with game/set/category filtering"
```

---

### Task 5: Catalog UI — game tabs component

**Files:**
- Create: `src/components/catalog/GameTabs.tsx`

**Step 1: Create GameTabs client component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface GameTabsProps {
  games: { code: string; name: string; active: boolean }[];
  currentGame: string;
}

export default function GameTabs({ games, currentGame }: GameTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectGame(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("game", code);
    else params.delete("game");
    params.delete("set");  // reset set when game changes
    params.delete("page");
    router.push(`/catalog?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => selectGame("")}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
          !currentGame
            ? "bg-brand-600 text-white"
            : "bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-brand-500"
        }`}
      >
        All Games
      </button>
      {games.map((game) => (
        <button
          key={game.code}
          onClick={() => game.active && selectGame(game.code)}
          disabled={!game.active}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            currentGame === game.code
              ? "bg-brand-600 text-white"
              : game.active
                ? "bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-brand-500"
                : "bg-[#12121a] border border-[#1e1e2e] text-gray-600 cursor-not-allowed opacity-50"
          }`}
        >
          {game.name}
          {!game.active && (
            <span className="ml-1.5 text-[10px] text-gray-600">Coming Soon</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Verify**

Run: `pnpm build`
Expected: Component compiles (not yet used in page — that happens in Task 8).

**Step 3: Commit**

```bash
git add src/components/catalog/GameTabs.tsx
git commit -m "feat: GameTabs filter component for catalog"
```

---

### Task 6: Catalog UI — category toggle component

**Files:**
- Create: `src/components/catalog/CategoryToggle.tsx`

**Step 1: Create CategoryToggle client component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface CategoryToggleProps {
  currentCategory: string;
}

export default function CategoryToggle({ currentCategory }: CategoryToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectCategory(cat: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat === "singles") params.delete("category");
    else params.set("category", cat);
    params.delete("page");
    router.push(`/catalog?${params.toString()}`);
  }

  const categories = [
    { value: "singles", label: "Singles" },
    { value: "sealed", label: "Sealed Products" },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-[#12121a] border border-[#1e1e2e] p-1">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => selectCategory(cat.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            currentCategory === cat.value
              ? "bg-brand-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Verify**

Run: `pnpm build`
Expected: Component compiles.

**Step 3: Commit**

```bash
git add src/components/catalog/CategoryToggle.tsx
git commit -m "feat: CategoryToggle component for singles/sealed filter"
```

---

### Task 7: Catalog UI — upgrade SearchBar with set names

**Files:**
- Modify: `src/components/catalog/SearchBar.tsx`

**Step 1: Update props to accept set objects instead of strings**

Change the `sets` prop from `string[]` to `{ code: string; name: string }[]`. Update the set `<select>`:

```tsx
interface SearchBarProps {
  sets: { code: string; name: string }[];
  currentQuery: string;
  currentSet: string;
}

// In the select:
{sets.map((s) => (
  <option key={s.code} value={s.code}>
    {s.code} — {s.name}
  </option>
))}
```

**Step 2: Also add name search**

Update the search input placeholder to "Search by name, card number, or SKU..." and update the catalog page query to also search `cards.name`:

```ts
// In catalog page.tsx, update the search condition:
conditions.push(
  or(
    like(cards.cardNumber, pattern),
    like(cards.sku, pattern),
    like(cards.name, pattern)
  )!
);
```

**Step 3: Verify**

Run: `pnpm build`
Expected: Type-checks pass.

**Step 4: Commit**

```bash
git add src/components/catalog/SearchBar.tsx
git commit -m "feat: SearchBar shows set names, searches by name"
```

---

### Task 8: Catalog page — wire up all filter components

**Files:**
- Modify: `src/app/catalog/page.tsx`

**Step 1: Import new components**

```ts
import GameTabs from "@/components/catalog/GameTabs";
import CategoryToggle from "@/components/catalog/CategoryToggle";
```

**Step 2: Update JSX layout**

Replace the current header section with:

```tsx
<main className="mx-auto max-w-7xl px-6 py-8">
  {/* Header */}
  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold">Card Catalog</h1>
      {lastSynced && (
        <p className="mt-1 text-xs text-gray-500">
          Last synced: {new Date(lastSynced).toLocaleString("en-GB")}
        </p>
      )}
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
      <SearchBar
        sets={allSets.map(s => ({ code: s.code, name: s.name }))}
        currentQuery={query}
        currentSet={setFilter}
      />
    </Suspense>
  </div>

  {/* Discount banner */}
  ...

  {/* CardTable, Pagination, total count */}
  ...
</main>
```

**Step 3: Verify**

Run: `pnpm build && pnpm dev`
Expected: Catalog renders with game tabs, category toggle, and upgraded set filter. Clicking tabs updates URL params and filters cards.

**Step 4: Commit**

```bash
git add src/app/catalog/page.tsx
git commit -m "feat: wire game tabs, category toggle, and set filter into catalog"
```

---

### Task 9: CardTable — sort additions

**Files:**
- Modify: `src/components/catalog/CardTable.tsx`

**Step 1: Add sort header for Set column**

Make the "Set" column header clickable (sort by `set`):

```tsx
<th
  className="px-4 py-3 font-medium cursor-pointer hover:text-gray-200 transition select-none"
  onClick={() => toggleSort("set")}
>
  Set{sortIndicator("set")}
</th>
```

**Step 2: Update the catalog page sort logic to handle "set" and "newest"**

In `src/app/catalog/page.tsx`, update the sort column resolution. For "set" sort, join with the sets table:

```ts
if (sortField === "set") {
  // Need to use setId-based ordering or join
  // Simple approach: order by cards.setId then cards.cardNumber
  const orderBy = sortOrder === "desc"
    ? [desc(cards.setId), desc(cards.cardNumber)]
    : [asc(cards.setId), asc(cards.cardNumber)];
}
```

For "newest" sort, order by sets.sortOrder descending (higher sortOrder = newer set), then cardNumber:

```ts
if (sortField === "newest") {
  orderBy = [desc(cards.setId), asc(cards.cardNumber)];
}
```

**Step 3: Add sort dropdown in SearchBar**

Add a third control to SearchBar — a sort dropdown with options:
- Card # (default)
- Price: Low → High
- Price: High → Low
- Set
- Newest

This replaces the clickable column headers approach for better UX consistency. Keep the clickable headers too for Card# and Price.

**Step 4: Verify**

Run: `pnpm build`
Expected: No type errors. Sorting by set/newest works.

**Step 5: Commit**

```bash
git add src/components/catalog/CardTable.tsx src/components/catalog/SearchBar.tsx src/app/catalog/page.tsx
git commit -m "feat: add set and newest sort options to catalog"
```

---

### Task 10: Admin — games/sets management page

**Files:**
- Create: `src/app/admin/games/page.tsx`
- Create: `src/app/api/admin/games/route.ts`
- Create: `src/app/api/admin/games/[id]/route.ts`
- Create: `src/app/api/admin/sets/route.ts`
- Create: `src/app/api/admin/sets/[id]/route.ts`
- Modify: `src/app/admin/layout.tsx`

**Step 1: Add "Games" link to admin layout**

In `src/app/admin/layout.tsx`, add a Games link next to Clients:

```tsx
<Link href="/admin/games" className="text-sm hover:text-brand-500 transition">Games</Link>
```

**Step 2: Create API routes for games CRUD**

`src/app/api/admin/games/route.ts`:
- `GET` — list all games with their set counts, ordered by sortOrder
- `POST` — create a new game (code, name, slug, active)

`src/app/api/admin/games/[id]/route.ts`:
- `PATCH` — update game (name, sortOrder, active, imageUrl)
- `DELETE` — delete game (only if no sets/cards reference it)

**Step 3: Create API routes for sets CRUD**

`src/app/api/admin/sets/route.ts`:
- `GET?gameId=N` — list sets for a game, ordered by sortOrder
- `POST` — create a set (gameId, code, name, releaseDate)

`src/app/api/admin/sets/[id]/route.ts`:
- `PATCH` — update set (name, releaseDate, sortOrder, active)
- `DELETE` — delete set (only if no cards reference it)

**Step 4: Create admin games page**

`src/app/admin/games/page.tsx` — client component:

Layout:
- List of games as expandable cards
- Each game card shows: name, code, status badge (active/inactive), set count
- Toggle active/inactive with a switch
- Click to expand → shows sets list
- Inside expanded: list sets with name, code, release date, sortOrder
- "Add Set" button inside each game's expanded section
- Inline edit for set details (click to edit name/date)

Follow the same pattern as `clients/page.tsx`:
- `"use client"` component
- `useEffect` fetch on mount
- Expandable rows
- Inline editing

**Step 5: Verify**

Run: `pnpm build && pnpm dev`
Expected: `/admin/games` renders with game list, expandable to show sets. CRUD operations work.

**Step 6: Commit**

```bash
git add src/app/admin/games/ src/app/api/admin/games/ src/app/api/admin/sets/ src/app/admin/layout.tsx
git commit -m "feat: admin games/sets management page with CRUD"
```

---

### Task 11: Final verification and cleanup

**Files:**
- Modify: `src/lib/s3.ts` (remove `SET_NAME_MAP` if now redundant)

**Step 1: Remove hardcoded SET_NAME_MAP from s3.ts**

The `SET_NAME_MAP` and `getSetName()` in `src/lib/s3.ts:4-18` are now redundant — set names come from the `sets` table. Update the sync route to look up set names from the DB instead. Remove the map and the `getSetName` export.

Update `fetchPriceFeed` to no longer set `setName` — the sync route handles it.

**Step 2: Full build verification**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 3: Smoke test**

Run: `pnpm dev` and verify:
1. `/catalog` — game tabs render, "All Games" selected by default
2. Click "One Piece" — filters to One Piece cards, set dropdown shows OP sets
3. Category toggle — "Singles" active by default, "Sealed Products" shows empty state
4. Set filter — shows "OP01 — Romance Dawn" format
5. Sort by Set/Newest works
6. `/admin/games` — shows game list, expandable sets, activate/deactivate
7. Trigger sync — cards get gameId/setId assigned

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: game/set hierarchy, category filter, sealed products"
```

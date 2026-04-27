# P15 — Card Game Filter, Set Hierarchy & Sealed Products

The catalog currently only filters by set code. As we expand beyond One Piece to Pokémon, Yu-Gi-Oh, Dragon Ball etc., we need a proper game → set hierarchy and a sealed product category.

## Schema Changes

### 1. Add `games` table
```ts
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),       // "onepiece", "pokemon", "yugioh", "dragonball"
  name: text("name").notNull(),                 // "One Piece", "Pokémon", "Yu-Gi-Oh!", "Dragon Ball"
  slug: text("slug").notNull().unique(),        // URL-friendly: "one-piece", "pokemon"
  imageUrl: text("image_url"),                  // game logo/icon
  sortOrder: integer("sort_order").default(0),
  active: integer("active", { mode: "boolean" }).default(true),
});
```

### 2. Add `sets` table
```ts
export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull().references(() => games.id),
  code: text("code").notNull(),                 // "OP01", "OP02", "ST01"
  name: text("name").notNull(),                 // "Romance Dawn", "Paramount War"
  releaseDate: text("release_date"),            // "2022-07-22"
  sortOrder: integer("sort_order").default(0),
  active: integer("active", { mode: "boolean" }).default(true),
});
```

### 3. Update `cards` table
Add:
- `gameId` — references games table
- `setId` — references sets table  
- `category` — enum: "singles" | "sealed"
- `productType` — for sealed: "booster_box", "booster_pack", "starter_deck", "collection_box", "promo_pack", etc. Null for singles.
- `imageUrl` — card/product image (future use)

### 4. Seed data for One Piece sets
Seed the games table with One Piece (active) + Pokémon, Yu-Gi-Oh, Dragon Ball (inactive placeholders).

Seed One Piece sets. Here are the main ones:
```
OP01 - Romance Dawn
OP02 - Paramount War
OP03 - Pillars of Strength
OP04 - Kingdoms of Intrigue
OP05 - Awakening of the New Era
OP06 - Wings of the Captain
OP07 - 500 Years in the Future
OP08 - Two Legends
OP09 - The Four Emperors
OP10 - Royal Blood (upcoming)
ST01-ST16 - Starter Decks
EB01 - Extra Booster: Memorial Collection
PRB01 - Premium Booster
```

Map existing cards to their game + set based on the SKU pattern (`OP-OP01-001-JP` → game: onepiece, set: OP01).

## Catalog UI Changes

### 5. Game tabs / filter
At the top of `/catalog`, add game tabs:
```
[All Games]  [One Piece]  [Pokémon*]  [Yu-Gi-Oh!*]  [Dragon Ball*]
                                        * Coming Soon
```

- Active games are clickable tabs
- Inactive games shown greyed out with "Coming Soon" badge
- URL: `/catalog?game=onepiece&set=OP01&category=singles`

### 6. Category toggle
Below game tabs:
```
[Singles]  [Sealed Products]
```

- Singles shows individual cards (current behavior)
- Sealed shows booster boxes, starter decks, etc.
- Default to Singles

### 7. Set filter upgrade
Replace the current set code dropdown with a proper set selector:
- Only shows sets for the selected game
- Shows set name, not just code: "OP01 — Romance Dawn" 
- Sorted by release date (newest first) or sort_order
- "All Sets" option at top

### 8. Sorting additions
Add sort options:
- Card number (existing)
- Price low → high / high → low (existing)
- Set (group by set, then card number within set)
- Newest (by set release date, newest first)

### 9. URL structure
Update search params to include game and category:
```
/catalog?game=onepiece&set=OP01&category=singles&q=luffy&sort=price&order=asc&page=1
```

All params optional. Defaults: all games, all sets, singles, no search, sort by card number asc.

## Admin: Manage Games & Sets

### 10. `/admin/games` page
- List games (reorder, activate/deactivate)
- Add new game
- For each game: list its sets, add/edit sets

### 11. Sync update
When S3 sync runs, auto-create games/sets if they don't exist (based on SKU patterns). Map cards to game + set + category.

The S3 price feed has SKUs like:
- `OP-OP01-001-JP` → game: onepiece, set: OP01, category: singles
- For sealed products (future): different SKU pattern or manual CSV upload

## Migration
- Add gameId, setId, category to cards table (nullable initially)
- Run migration to populate from existing setCode data
- After migration, make gameId NOT NULL

Commit: `feat: game/set hierarchy, category filter, sealed products`

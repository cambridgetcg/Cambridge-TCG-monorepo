# Game/Set Hierarchy, Category Filter & Sealed Products

## Problem

The catalog only filters by set code. As the platform expands beyond One Piece to Pokémon, Yu-Gi-Oh, Dragon Ball, we need a proper game → set hierarchy and a sealed product category.

## Approach

Full normalization with FK relationships. Since only seed data exists, we reset the DB via updated seed rather than running migrations.

## Schema

### `games` table

| Column    | Type    | Notes                          |
|-----------|---------|--------------------------------|
| id        | int PK  | autoincrement                  |
| code      | text    | unique, e.g. "onepiece"        |
| name      | text    | "One Piece"                    |
| slug      | text    | unique, URL-friendly           |
| imageUrl  | text?   | game logo                      |
| sortOrder | int     | default 0                      |
| active    | bool    | default true                   |

### `sets` table

| Column      | Type    | Notes                        |
|-------------|---------|------------------------------|
| id          | int PK  | autoincrement                |
| gameId      | int FK  | → games.id                   |
| code        | text    | "OP01"                       |
| name        | text    | "Romance Dawn"               |
| releaseDate | text?   | "2022-07-22"                 |
| sortOrder   | int     | default 0                    |
| active      | bool    | default true                 |

### `cards` table additions

| Column      | Type    | Notes                                    |
|-------------|---------|------------------------------------------|
| gameId      | int FK  | → games.id, NOT NULL                     |
| setId       | int FK  | → sets.id, NOT NULL                      |
| category    | text    | "singles" or "sealed", default "singles" |
| productType | text?   | for sealed: "booster_box", etc.          |
| imageUrl    | text?   | future use                               |

Drizzle relations defined for games → sets → cards.

## Seed Data

- 4 games: One Piece (active), Pokémon/Yu-Gi-Oh/Dragon Ball (inactive)
- ~20 One Piece sets: OP01–OP10, ST01–ST16, EB01, PRB01
- Existing 10 sample cards mapped to game/set IDs

## Catalog UI

### Game tabs

Horizontal pills at top: `[All Games] [One Piece] [Pokémon*] [Yu-Gi-Oh!*] [Dragon Ball*]`

- Active games clickable, inactive greyed with "Coming Soon"
- URL: `?game=onepiece`

### Category toggle

Below game tabs: `[Singles] [Sealed Products]`

- Default: Singles. Sealed shows empty state until products are added.
- URL: `?category=singles`

### Set filter upgrade

- Filtered by selected game
- Format: "OP01 — Romance Dawn"
- Sorted by sortOrder (newest first)
- "All Sets" at top

### Sort additions

- Existing: Card # asc/desc, Price asc/desc
- New: Set (by release date, card# within), Newest (release date desc)

### URL structure

`/catalog?game=onepiece&set=OP01&category=singles&q=luffy&sort=price&order=asc&page=1`

All params optional. Defaults: all games, singles, no search, card number asc.

## Sync Route

- Parse SKU `OP-OP01-001-JP` → game "onepiece", set "OP01"
- Auto-upsert game/set records if missing
- Set gameId, setId, category "singles" on cards
- Keep setCode/setName columns for backward compat

## Admin `/admin/games`

- List games with reorder + activate/deactivate
- Expand game → list sets, add/edit sets
- No "add game" (games are rare, seed-managed)

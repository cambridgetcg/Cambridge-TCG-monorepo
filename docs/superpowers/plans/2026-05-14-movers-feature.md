# Movers Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real 7-day price-movers surface at `/prices/[game]/movers`, replacing the substrate-honest "most valuable" placeholder so the page delivers what `menu-config.ts:70` advertises.

**Architecture:** New bearer-gated wholesale endpoint `/api/v1/prices/movers` runs a single CTE over `price_archive` (cardrush rows only, singles, nm) joined to `cards`, computes pct change between a "now" row (last 2 days) and a "then" row (5–9d ago), applies a £10 floor on the prior price, channel-prices each result via `priceForChannel`. Storefront's Falcon proxies via a new `fetchMovers()`. The page keeps its scaffold and renders the new substrate with a coloured arrow + pct cell; on a quiet week it falls back to the existing most-valuable table.

**Tech Stack:** Next.js 15 (wholesale) / Next.js 16.2.1 (storefront), TypeScript, Drizzle ORM, PostgreSQL `price_archive`, vitest.

**Spec:** `docs/superpowers/specs/2026-05-14-movers-feature-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/wholesale/src/app/api/v1/prices/movers/helpers.ts` | new | Pure helpers: `parseMoversParams`, `buildMoversResponse` |
| `apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts` | new | Vitest unit tests for the helpers |
| `apps/wholesale/src/app/api/v1/prices/movers/route.ts` | new | Next.js route handler — auth, game lookup, SQL, channel pricing, serialize |
| `apps/wholesale/package.json` | modify | Add `"test": "vitest run"` script |
| `apps/storefront/src/lib/wholesale/client.ts` | modify | Add `MoverItem`, `MoversResponse`, `fetchMovers()` |
| `apps/storefront/src/lib/wholesale/__tests__/movers.test.ts` | new | Vitest for `fetchMovers` error paths |
| `apps/storefront/src/app/prices/[game]/movers/page.tsx` | rewrite-body | Wire `fetchMovers`, flip h1/metadata, drop amber banner, add pct table + empty fallback |
| `apps/storefront/src/lib/manifest.ts` | modify line 486 | Update `storefront.prices.movers` description for new shape |

---

## Task 1: Wholesale — `parseMoversParams` helper (TDD)

**Files:**
- Create: `apps/wholesale/src/app/api/v1/prices/movers/helpers.ts`
- Test: `apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts`
- Modify: `apps/wholesale/package.json` (add test script)

- [ ] **Step 1.1: Add `test` script to wholesale package.json**

Open `apps/wholesale/package.json`. Find the `"scripts"` block (around line 5–14). Insert `"test": "vitest run",` between `"typecheck": "tsc --noEmit -p tsconfig.json",` and the next script (db:generate). Final scripts block should include both `typecheck` and `test`.

- [ ] **Step 1.2: Write the failing test file**

Create `apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts` with this exact content:

```ts
import { describe, it, expect } from "vitest";
import { parseMoversParams, type MoversParams } from "./helpers";

describe("parseMoversParams", () => {
  it("requires ?game=", () => {
    const result = parseMoversParams(new URLSearchParams(""));
    expect(result).toEqual({
      error: "Missing required ?game=",
      status: 400,
    });
  });

  it("returns defaults when only game is provided", () => {
    const result = parseMoversParams(new URLSearchParams("game=op"));
    expect(result).toEqual({
      game: "op",
      window: "7d",
      windowDays: 7,
      windowToleranceDays: 2,
      minPrice: 10,
      category: "singles",
      limit: 50,
    });
  });

  it("accepts numeric overrides", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&min_price=5&limit=25"),
    );
    expect(result).toMatchObject({
      game: "op",
      minPrice: 5,
      limit: 25,
    });
  });

  it("clamps limit to 200", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&limit=999"),
    ) as MoversParams;
    expect(result.limit).toBe(200);
  });

  it("rejects non-7d window", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&window=30d"),
    );
    expect(result).toMatchObject({
      error: "Unsupported window: 30d. v1 only supports 7d.",
      status: 400,
    });
  });

  it("rejects negative min_price", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&min_price=-1"),
    );
    expect(result).toMatchObject({ status: 400 });
  });

  it("rejects unknown category", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&category=foo"),
    );
    expect(result).toMatchObject({ status: 400 });
  });

  it("accepts sealed category", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&category=sealed"),
    ) as MoversParams;
    expect(result.category).toBe("sealed");
  });
});
```

- [ ] **Step 1.3: Run test to verify it fails**

Run: `pnpm --filter tcg-wholesale test`
Expected: All `parseMoversParams` tests fail with module-not-found / cannot-find `./helpers`.

- [ ] **Step 1.4: Implement the helper**

Create `apps/wholesale/src/app/api/v1/prices/movers/helpers.ts` with this exact content:

```ts
/**
 * Pure helpers for the movers endpoint. Tested in helpers.test.ts.
 *
 * Lives next to the route so a reader of route.ts can find the
 * validation + serialization without spelunking through @/lib.
 */

export type MoversWindow = "7d";
export type MoversCategory = "singles" | "sealed";

export interface MoversParams {
  game: string;
  window: MoversWindow;
  windowDays: number;
  windowToleranceDays: number;
  minPrice: number;
  category: MoversCategory;
  limit: number;
}

export interface MoversParamsError {
  error: string;
  status: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MIN_PRICE = 10;
const MAX_MIN_PRICE = 10_000;

export function parseMoversParams(
  searchParams: URLSearchParams,
): MoversParams | MoversParamsError {
  const game = searchParams.get("game");
  if (!game) return { error: "Missing required ?game=", status: 400 };

  const windowParam = searchParams.get("window") || "7d";
  if (windowParam !== "7d") {
    return {
      error: `Unsupported window: ${windowParam}. v1 only supports 7d.`,
      status: 400,
    };
  }

  const minPriceRaw = searchParams.get("min_price");
  const minPriceNum =
    minPriceRaw === null ? DEFAULT_MIN_PRICE : Number(minPriceRaw);
  if (
    !Number.isFinite(minPriceNum) ||
    minPriceNum < 0 ||
    minPriceNum > MAX_MIN_PRICE
  ) {
    return { error: `Invalid min_price: ${minPriceRaw}`, status: 400 };
  }

  const categoryParam = searchParams.get("category") || "singles";
  if (categoryParam !== "singles" && categoryParam !== "sealed") {
    return { error: `Invalid category: ${categoryParam}`, status: 400 };
  }

  const limitRaw = searchParams.get("limit");
  const limitNum =
    limitRaw === null ? DEFAULT_LIMIT : parseInt(limitRaw, 10);
  if (!Number.isFinite(limitNum) || limitNum < 1) {
    return { error: `Invalid limit: ${limitRaw}`, status: 400 };
  }
  const limit = Math.min(limitNum, MAX_LIMIT);

  return {
    game,
    window: "7d",
    windowDays: 7,
    windowToleranceDays: 2,
    minPrice: minPriceNum,
    category: categoryParam as MoversCategory,
    limit,
  };
}
```

- [ ] **Step 1.5: Run test to verify it passes**

Run: `pnpm --filter tcg-wholesale test`
Expected: All 8 `parseMoversParams` tests pass.

If vitest isn't found, run first: `pnpm --filter tcg-wholesale add -D vitest`, then retry.

- [ ] **Step 1.6: Commit**

```bash
git add apps/wholesale/package.json \
        apps/wholesale/src/app/api/v1/prices/movers/helpers.ts \
        apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): add parseMoversParams helper + tests

First slice of /api/v1/prices/movers. Pure param-parsing helper
that validates ?game= (required), ?window= (7d only in v1),
?min_price= (numeric, clamped), ?category= (singles|sealed), and
?limit= (clamped to 200). Returns a discriminated union of
MoversParams | MoversParamsError so the route handler can branch
once. Also wires "vitest run" into wholesale's test script so the
existing ebay test + future helper tests are runnable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wholesale — `buildMoversResponse` helper (TDD)

**Files:**
- Modify: `apps/wholesale/src/app/api/v1/prices/movers/helpers.ts`
- Modify: `apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts`

- [ ] **Step 2.1: Add the failing tests**

Append to `apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts`:

```ts
import { buildMoversResponse, type MoversRow } from "./helpers";

describe("buildMoversResponse", () => {
  const params: MoversParams = {
    game: "op",
    window: "7d",
    windowDays: 7,
    windowToleranceDays: 2,
    minPrice: 10,
    category: "singles",
    limit: 50,
  };

  const fixedNow = new Date("2026-05-14T12:00:00Z");

  const sampleRow: MoversRow = {
    sku: "OP09-051-P-EN",
    card_number: "OP09-051",
    name: "ルフィ",
    name_en: "Monkey D. Luffy",
    set_code: "OP09",
    set_name: "Emperors in the New World",
    rarity: "SR",
    image_url: "https://example.com/luffy.jpg",
    category: "singles",
    price_now: 18.2,
    price_then: 12.4,
    channel_price: 24.5,
    pct_change: 46.77,
    now_date: "2026-05-14",
    then_date: "2026-05-07",
  };

  it("wraps rows with metadata + computed_at", () => {
    const response = buildMoversResponse(
      [sampleRow],
      params,
      "cambridgetcg",
      fixedNow,
    );

    expect(response).toEqual({
      window: "7d",
      window_days: 7,
      window_tolerance_days: 2,
      min_price_floor: 10,
      source: "cardrush",
      source_license: "internal-only",
      channel: "cambridgetcg",
      game_code: "op",
      computed_at: "2026-05-14T12:00:00.000Z",
      count: 1,
      movers: [
        {
          sku: "OP09-051-P-EN",
          card_number: "OP09-051",
          name: "ルフィ",
          name_en: "Monkey D. Luffy",
          set_code: "OP09",
          set_name: "Emperors in the New World",
          rarity: "SR",
          image_url: "https://example.com/luffy.jpg",
          category: "singles",
          price_then: 12.4,
          price_now: 18.2,
          channel_price: 24.5,
          pct_change: 46.77,
          then_date: "2026-05-07",
          now_date: "2026-05-14",
        },
      ],
    });
  });

  it("returns empty movers when no rows", () => {
    const response = buildMoversResponse([], params, "cambridgetcg", fixedNow);
    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
    expect(response.source_license).toBe("internal-only");
  });

  it("preserves row order from input (caller sorted)", () => {
    const r2 = { ...sampleRow, sku: "B", pct_change: 30 };
    const r1 = { ...sampleRow, sku: "A", pct_change: 50 };
    const response = buildMoversResponse(
      [r1, r2],
      params,
      "cambridgetcg",
      fixedNow,
    );
    expect(response.movers.map((m) => m.sku)).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `pnpm --filter tcg-wholesale test`
Expected: 3 new `buildMoversResponse` tests fail — `buildMoversResponse` and `MoversRow` not exported from `./helpers`.

- [ ] **Step 2.3: Add the helper implementation**

Append to `apps/wholesale/src/app/api/v1/prices/movers/helpers.ts`:

```ts
// ── Response builder ────────────────────────────────────────────────

/** One row coming out of the SQL+channel-pricing pipeline. */
export interface MoversRow {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  price_now: number;
  price_then: number;
  channel_price: number;
  pct_change: number;
  now_date: string;
  then_date: string;
}

export interface MoverItem {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  price_then: number;
  price_now: number;
  channel_price: number;
  pct_change: number;
  then_date: string;
  now_date: string;
}

export interface MoversResponse {
  window: MoversWindow;
  window_days: number;
  window_tolerance_days: number;
  min_price_floor: number;
  source: "cardrush";
  source_license: "internal-only";
  channel: string;
  game_code: string;
  computed_at: string;
  count: number;
  movers: MoverItem[];
}

export function buildMoversResponse(
  rows: MoversRow[],
  params: MoversParams,
  channel: string,
  computedAt: Date,
): MoversResponse {
  return {
    window: params.window,
    window_days: params.windowDays,
    window_tolerance_days: params.windowToleranceDays,
    min_price_floor: params.minPrice,
    source: "cardrush",
    source_license: "internal-only",
    channel,
    game_code: params.game,
    computed_at: computedAt.toISOString(),
    count: rows.length,
    movers: rows.map((r) => ({
      sku: r.sku,
      card_number: r.card_number,
      name: r.name,
      name_en: r.name_en,
      set_code: r.set_code,
      set_name: r.set_name,
      rarity: r.rarity,
      image_url: r.image_url,
      category: r.category,
      price_then: r.price_then,
      price_now: r.price_now,
      channel_price: r.channel_price,
      pct_change: r.pct_change,
      then_date: r.then_date,
      now_date: r.now_date,
    })),
  };
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `pnpm --filter tcg-wholesale test`
Expected: All 11 helper tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/wholesale/src/app/api/v1/prices/movers/helpers.ts \
        apps/wholesale/src/app/api/v1/prices/movers/helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): add buildMoversResponse + MoversRow/MoverItem types

Pure response-builder pulls the SQL row shape (price_now,
price_then, pct_change, dates, channel_price) into the wire
contract. Tags every response with source_license: "internal-only"
so downstream renderers (and humans) know raw price_then/price_now
are cardrush-derived and shouldn't leak to anonymous surfaces;
only the derived pct_change + the platform's channel_price are
publishable. Row order is caller-controlled — the SQL CTE in the
route does the ABS(pct) DESC sort and the builder preserves it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wholesale — route handler

**Files:**
- Create: `apps/wholesale/src/app/api/v1/prices/movers/route.ts`

- [ ] **Step 3.1: Create the route file**

Create `apps/wholesale/src/app/api/v1/prices/movers/route.ts` with this exact content:

```ts
/**
 * GET /api/v1/prices/movers — 7-day biggest-mover surface.
 *
 * Single SQL CTE over price_archive (cardrush, singles, nm) joined
 * to cards, scoped by ?game=<code|slug>. Picks a "now" row (most
 * recent within last 2d) and a "then" row (most recent within 5–9d
 * ago) per card, computes pct_change, applies the ?min_price= floor
 * to the "then" price (default £10), then channel-prices each row
 * for the API key's channel. Sorted by ABS(pct_change) DESC.
 *
 * Auth: bearer-gated; channel comes from the API key.
 * License: source_license: "internal-only" — raw price_then/price_now
 * are cardrush-derived GBP and must not be re-exported to anonymous
 * surfaces. The derived pct_change and the platform's own channel_price
 * are publishable.
 *
 * Companion spec: docs/superpowers/specs/2026-05-14-movers-feature-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";
import { priceForChannel } from "@/lib/channel-pricing";
import {
  parseMoversParams,
  buildMoversResponse,
  type MoversRow,
} from "./helpers";

interface SqlRow {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  price_now: string;
  price_then: string;
  now_date: string;
  then_date: string;
  pct_change: string;
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const parsed = parseMoversParams(req.nextUrl.searchParams);
    if ("error" in parsed) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const params = parsed;

    // Resolve game (accepts both code and slug — mirrors /api/v1/prices)
    const gameRows = await db
      .select({ id: games.id, code: games.code })
      .from(games)
      .where(or(eq(games.code, params.game), eq(games.slug, params.game)))
      .limit(1);
    if (!gameRows.length) {
      return NextResponse.json(
        { error: `Game not found: ${params.game}` },
        { status: 404 },
      );
    }
    const gameId = gameRows[0].id;
    const gameCode = gameRows[0].code;

    const rows = await db.execute<SqlRow>(sql`
      WITH now_rows AS (
        SELECT DISTINCT ON (pa.card_id)
          pa.card_id, pa.price AS price_now, pa.snapshot_date AS now_date
        FROM price_archive pa
        JOIN cards c ON c.id = pa.card_id
        WHERE pa.source = 'cardrush'
          AND pa.category = ${params.category}
          AND pa.condition = 'nm'
          AND pa.snapshot_date >= CURRENT_DATE - INTERVAL '2 days'
          AND c.game_id = ${gameId}
        ORDER BY pa.card_id, pa.snapshot_date DESC
      ),
      then_rows AS (
        SELECT DISTINCT ON (pa.card_id)
          pa.card_id, pa.price AS price_then, pa.snapshot_date AS then_date
        FROM price_archive pa
        JOIN cards c ON c.id = pa.card_id
        WHERE pa.source = 'cardrush'
          AND pa.category = ${params.category}
          AND pa.condition = 'nm'
          AND pa.snapshot_date BETWEEN CURRENT_DATE - INTERVAL '9 days'
                                   AND CURRENT_DATE - INTERVAL '5 days'
          AND c.game_id = ${gameId}
        ORDER BY pa.card_id, pa.snapshot_date DESC
      )
      SELECT
        c.sku,
        c.card_number,
        c.name,
        c.name_en,
        c.set_code,
        c.set_name,
        c.rarity,
        c.image_url,
        c.category,
        c.cardrush_jpy,
        c.gbp_jpy_rate,
        n.price_now::text  AS price_now,
        n.now_date::text   AS now_date,
        t.price_then::text AS price_then,
        t.then_date::text  AS then_date,
        (((n.price_now - t.price_then) / NULLIF(t.price_then, 0)) * 100)::text AS pct_change
      FROM now_rows n
      JOIN then_rows t ON t.card_id = n.card_id
      JOIN cards c ON c.id = n.card_id
      WHERE t.price_then >= ${params.minPrice}
        AND n.price_now > 0
        AND n.price_now <> t.price_then
      ORDER BY ABS(((n.price_now - t.price_then) / NULLIF(t.price_then, 0))) DESC
      LIMIT ${params.limit}
    `);

    // Channel-price each row (mirrors /api/v1/prices/route.ts:191)
    const channel = apiKey.channel;
    const enriched: MoversRow[] = await Promise.all(
      rows.map(async (r) => {
        const priceNow = Number(r.price_now);
        const priceThen = Number(r.price_then);
        const pctChange = Number(r.pct_change);

        let channelPrice = priceNow;
        if (
          channel !== "wholesale" &&
          r.cardrush_jpy &&
          r.gbp_jpy_rate
        ) {
          const breakdown = await priceForChannel(
            r.cardrush_jpy,
            r.gbp_jpy_rate,
            channel,
            r.category,
          );
          channelPrice = breakdown.price;
        }

        return {
          sku: r.sku,
          card_number: r.card_number,
          name: r.name,
          name_en: r.name_en,
          set_code: r.set_code,
          set_name: r.set_name,
          rarity: r.rarity,
          image_url: r.image_url,
          category: r.category,
          price_now: priceNow,
          price_then: priceThen,
          channel_price: channelPrice,
          pct_change: Number(pctChange.toFixed(2)),
          now_date: r.now_date,
          then_date: r.then_date,
        };
      }),
    );

    const response = buildMoversResponse(
      enriched,
      { ...params, game: gameCode },
      channel,
      new Date(),
    );

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/prices/movers] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3.2: Typecheck the wholesale app**

Run: `pnpm --filter tcg-wholesale typecheck`
Expected: 0 errors. If you see errors about `db.execute` row type or `priceForChannel` signature, recheck imports — `db` from `@/lib/db`, `games` from `@/lib/db/schema`, `priceForChannel` from `@/lib/channel-pricing`.

- [ ] **Step 3.3: Manual smoke against staging RDS**

Skip this step if you don't have local wholesale env. Otherwise:

```bash
cd apps/wholesale && pnpm dev &
WHOLESALE_PID=$!
sleep 4
curl -s "http://localhost:3000/api/v1/prices/movers?game=op&limit=5" \
  -H "Authorization: Bearer $WHOLESALE_API_KEY" | jq .
kill $WHOLESALE_PID
```

Expected: JSON response with `window: "7d"`, `source: "cardrush"`, `source_license: "internal-only"`, and a `movers` array. The array may be empty if cardrush hasn't snapshotted within the windows — that's substrate-honest; the storefront falls back to most-valuable.

- [ ] **Step 3.4: Commit**

```bash
git add apps/wholesale/src/app/api/v1/prices/movers/route.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): GET /api/v1/prices/movers — 7d cardrush movers

Bearer-gated route that issues a single CTE over price_archive
(cardrush + singles + nm) joined to cards (scoped by game_id),
picks now/then rows in the (today-2d / today-5-9d) windows, applies
the min_price floor on the "then" price, channel-prices each row,
and returns top-N by ABS(pct_change). source_license stays
"internal-only" on the wire — raw price_then/price_now are
cardrush-derived GBP and the contract makes the boundary visible.

Composes parseMoversParams + buildMoversResponse from helpers.ts.
SQL uses the existing (source, condition, card_id, snapshot_date)
index for both CTEs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Storefront — `fetchMovers` Falcon function (TDD)

**Files:**
- Modify: `apps/storefront/src/lib/wholesale/client.ts`
- Create: `apps/storefront/src/lib/wholesale/__tests__/movers.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/storefront/src/lib/wholesale/__tests__/movers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMovers } from "../client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("WHOLESALE_API_URL", "https://example.test");
  vi.stubEnv("WHOLESALE_API_KEY", "test-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchMovers", () => {
  it("returns the parsed response on success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        window: "7d",
        window_days: 7,
        window_tolerance_days: 2,
        min_price_floor: 10,
        source: "cardrush",
        source_license: "internal-only",
        channel: "cambridgetcg",
        game_code: "op",
        computed_at: "2026-05-14T12:00:00Z",
        count: 1,
        movers: [
          {
            sku: "OP09-051-P-EN",
            card_number: "OP09-051",
            name: "ルフィ",
            name_en: "Monkey D. Luffy",
            set_code: "OP09",
            set_name: "Emperors",
            rarity: "SR",
            image_url: null,
            category: "singles",
            price_then: 12.4,
            price_now: 18.2,
            channel_price: 24.5,
            pct_change: 46.77,
            then_date: "2026-05-07",
            now_date: "2026-05-14",
          },
        ],
      }),
    );

    const response = await fetchMovers({
      game: "op",
      window: "7d",
      min_price: 10,
      limit: 50,
    });

    expect(response.count).toBe(1);
    expect(response.movers[0].sku).toBe("OP09-051-P-EN");
    expect(response.source_license).toBe("internal-only");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).toContain("game=op");
    expect(calledUrl).toContain("window=7d");
    expect(calledUrl).toContain("min_price=10");
    expect(calledUrl).toContain("limit=50");
  });

  it("returns empty MoversResponse on !ok", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Game not found: foo" }, 404),
    );

    const response = await fetchMovers({ game: "foo" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
    expect(response.computed_at).toBeNull();
  });

  it("returns empty MoversResponse on fetch throw (timeout)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("aborted"));

    const response = await fetchMovers({ game: "op" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
  });

  it("returns empty MoversResponse on JSON parse error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await fetchMovers({ game: "op" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `pnpm --filter storefront test`
Expected: `fetchMovers` tests fail — `fetchMovers` not exported from `../client`.

- [ ] **Step 4.3: Add types + implementation to the Falcon client**

Open `apps/storefront/src/lib/wholesale/client.ts`. Find the section near the end (after `fetchQuarantine`, before `reportSale` — around line 800). Insert the following block right before the `reportSale` function:

```ts
// ── Movers ──────────────────────────────────────────────────────────
//
// Companion to /prices/[game]/movers. Calls wholesale's bearer-gated
// /api/v1/prices/movers endpoint. On any failure (timeout, !ok, parse
// error) returns an empty MoversResponse so the page degrades visibly
// to the most-valuable fallback rather than throwing.
//
// Spec: docs/superpowers/specs/2026-05-14-movers-feature-design.md

export interface MoverItem {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  price_then: number;
  price_now: number;
  channel_price: number;
  pct_change: number;
  then_date: string;
  now_date: string;
}

export interface MoversResponse {
  window: "7d";
  window_days: number;
  window_tolerance_days: number;
  min_price_floor: number;
  source: "cardrush";
  source_license: "internal-only";
  channel: string;
  game_code: string;
  computed_at: string | null;
  count: number;
  movers: MoverItem[];
}

function emptyMovers(game: string): MoversResponse {
  return {
    window: "7d",
    window_days: 7,
    window_tolerance_days: 2,
    min_price_floor: 10,
    source: "cardrush",
    source_license: "internal-only",
    channel: "cambridgetcg",
    game_code: game,
    computed_at: null,
    count: 0,
    movers: [],
  };
}

export async function fetchMovers(opts: {
  game: string;
  window?: "7d";
  min_price?: number;
  limit?: number;
  category?: "singles" | "sealed";
}): Promise<MoversResponse> {
  const url = new URL(WHOLESALE_URL + "/api/v1/prices/movers");
  url.searchParams.set("game", opts.game);
  if (opts.window) url.searchParams.set("window", opts.window);
  if (opts.min_price !== undefined)
    url.searchParams.set("min_price", String(opts.min_price));
  if (opts.limit !== undefined)
    url.searchParams.set("limit", String(opts.limit));
  if (opts.category) url.searchParams.set("category", opts.category);

  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: "Bearer " + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error("[wholesale] movers fetch error", err);
    return emptyMovers(opts.game);
  }
  if (!res.ok) {
    console.error("[wholesale] movers error", res.status);
    return emptyMovers(opts.game);
  }
  try {
    return (await res.json()) as MoversResponse;
  } catch (err) {
    console.error("[wholesale] movers parse error", err);
    return emptyMovers(opts.game);
  }
}
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `pnpm --filter storefront test`
Expected: 4 `fetchMovers` tests pass; existing storefront tests still pass.

- [ ] **Step 4.5: Typecheck storefront**

Run: `pnpm --filter storefront typecheck`
Expected: 0 errors.

- [ ] **Step 4.6: Commit**

```bash
git add apps/storefront/src/lib/wholesale/client.ts \
        apps/storefront/src/lib/wholesale/__tests__/movers.test.ts
git commit -m "$(cat <<'EOF'
feat(storefront): fetchMovers Falcon function + types

New typed call into wholesale's /api/v1/prices/movers. Same
hourglass + bearer trim pattern as fetchPrices (5s timeout,
revalidate 300s, returns empty response on any failure rather
than throwing). MoversResponse + MoverItem types mirror the
wholesale contract; source_license: "internal-only" stays on
the wire so the page renderer can withhold raw price_then/
price_now from anonymous surfaces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Storefront — movers page rewrite

**Files:**
- Rewrite body of: `apps/storefront/src/app/prices/[game]/movers/page.tsx`

- [ ] **Step 5.1: Update imports + metadata**

Open `apps/storefront/src/app/prices/[game]/movers/page.tsx`.

Find the `import { fetchPrices, type PriceItem }` line (around line 29). Replace it with:

```ts
import {
  fetchPrices,
  fetchMovers,
  type PriceItem,
  type MoverItem,
} from "@/lib/wholesale/client";
```

Find `generateMetadata` (around lines 47–57). Replace the `return` block with:

```ts
  return {
    title: `${cfg.short_name} Movers — 7-Day Price Changes — ${cfg.display_name} Price Guide UK`,
    description: `Biggest 7-day movers in ${cfg.display_name}. Cardrush-derived percent change with a £10 floor. Updated daily.`,
  };
```

- [ ] **Step 5.2: Add `fetchMovers` to the parallel data fetch**

In `GameMoversPage`, find the `Promise.all(...)` block (around lines 94–108). Replace it with:

```ts
  const [moversData, data, tradeinData, rates, currency] = await Promise.all([
    fetchMovers({
      game: cfg.slug,
      window: "7d",
      min_price: 10,
      limit: 50,
    }),
    fetchPrices({
      game: cfg.slug,
      sort: "price_desc",
      limit: 50,
    }).catch(() => ({ items: [], total: 0 } as { items: PriceItem[]; total: number })),
    fetchPrices({
      game: cfg.slug,
      sort: "price_desc",
      limit: 50,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] } as { items: PriceItem[] })),
    fetchRates(),
    getDisplayCurrency(),
  ]);

  const hasMovers = moversData.movers.length > 0;
```

- [ ] **Step 5.3: Update breadcrumb JSON-LD + h1**

Find the `breadcrumbJsonLd` block (around lines 130–149). In `itemListElement[3]`, change `name: "Most Valuable"` to `name: "Movers"`.

Find the `<h1>` near line 191. Replace its content:

```tsx
        <h1 className={`text-3xl font-bold mb-4 ${accent.text}`}>
          {cfg.short_name} — Biggest 7-Day Movers
        </h1>
```

Find the `<li className="text-white">Most Valuable</li>` in the breadcrumb (around line 187). Replace with:

```tsx
            <li className="text-white">Movers</li>
```

- [ ] **Step 5.4: Replace the Provenance + WhyLink block**

Find the `<div className="mb-4 flex flex-wrap items-center gap-3">` block containing `<Provenance ... />` and `<WhyLink ... />` (around lines 195–207). Replace the whole block with:

```tsx
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Provenance
            kind="computed"
            source="cardrush"
            at={moversData.computed_at}
            cadence="daily"
          />
          <WhyLink
            href="/methodology/cross-source-pricing"
            label="how movers are computed"
          />
        </div>
```

- [ ] **Step 5.5: Replace the intro paragraph + remove the amber banner**

Find the intro `<p>` (around lines 209–213). Replace with:

```tsx
        <p className="text-neutral-300 leading-relaxed max-w-3xl mb-6">
          Top 50 {cfg.display_name} cards by absolute 7-day percent
          change. Cardrush-derived. Cards worth under £10 seven days
          ago are excluded as noise. Updated daily.
        </p>
```

Then DELETE the entire amber-banner block — the `<section className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">...</section>` (around lines 225–240).

- [ ] **Step 5.6: Replace the table section with a branching renderer**

Find `{/* Top 50 table */}` and replace the whole `<section className="mb-12">...</section>` (around lines 242–320) with:

```tsx
        {/* Movers table (primary) — falls back to most-valuable on a quiet week */}
        {hasMovers ? (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-5">
              Top {moversData.movers.length} biggest 7-day movers
            </h2>
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-10">#</th>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Set</th>
                    <th className="px-3 py-3">Rarity</th>
                    <th className="px-3 py-3 text-right">7d Δ%</th>
                    <th className="px-3 py-3 text-right">Buy Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {moversData.movers.map((m: MoverItem, i: number) => {
                    const setSlug = m.set_code?.toLowerCase() ?? "";
                    const numberSlug = m.card_number.toLowerCase();
                    const displayName =
                      m.name_en || m.name || m.card_number;
                    const up = m.pct_change >= 0;
                    return (
                      <tr
                        key={m.sku}
                        className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
                      >
                        <td className="px-3 py-3 text-neutral-500 font-medium">
                          {i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={
                              setSlug
                                ? `/prices/${cfg.slug}/${setSlug}/${numberSlug}`
                                : `/product/${m.sku}`
                            }
                            className="text-white hover:text-blue-400 transition-colors"
                          >
                            {displayName}
                          </Link>
                          <span className="text-neutral-500 text-xs ml-2">
                            {m.card_number}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-neutral-400">
                          {setSlug ? (
                            <Link
                              href={`/prices/${cfg.slug}/${setSlug}`}
                              className="hover:text-blue-400 transition-colors"
                            >
                              {m.set_code}
                            </Link>
                          ) : (
                            m.set_code
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <RarityBadge rarity={m.rarity} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className={
                              up
                                ? "text-emerald-400 font-medium"
                                : "text-red-400 font-medium"
                            }
                          >
                            {up ? "▲" : "▼"} {Math.abs(m.pct_change).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          <Money value={m.channel_price} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              Cardrush-derived; £10 floor on the 7-day-ago price. Quiet weeks
              fall back to the most-valuable table below.
            </p>
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
            <p className="text-sm text-neutral-300">
              <strong className="font-semibold text-white">
                No qualifying movers this week.
              </strong>{" "}
              £10 floor, 7-day window. Showing top valuable cards instead.
            </p>
          </section>
        )}

        {/* Most-valuable table — always present when no movers, also as a secondary surface */}
        {!hasMovers && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-5">
              Top {data.items.length} by current price
            </h2>
            {data.items.length === 0 ? (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400 text-sm">
                No priced cards returned for {cfg.display_name} yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-10">#</th>
                      <th className="px-3 py-3">Card</th>
                      <th className="px-3 py-3">Set</th>
                      <th className="px-3 py-3">Rarity</th>
                      <th className="px-3 py-3 text-right">Buy Price</th>
                      <th className="px-3 py-3 text-right">We Buy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {cards.map((card, i) => {
                      const setSlug = card.set_code?.toLowerCase() ?? "";
                      const numberSlug = card.card_number.toLowerCase();
                      return (
                        <tr
                          key={card.sku}
                          className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
                        >
                          <td className="px-3 py-3 text-neutral-500 font-medium">
                            {i + 1}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={
                                setSlug
                                  ? `/prices/${cfg.slug}/${setSlug}/${numberSlug}`
                                  : `/product/${card.sku}`
                              }
                              className="text-white hover:text-blue-400 transition-colors"
                            >
                              {card.name}
                            </Link>
                            <span className="text-neutral-500 text-xs ml-2">
                              {card.card_number}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-neutral-400">
                            {setSlug ? (
                              <Link
                                href={`/prices/${cfg.slug}/${setSlug}`}
                                className="hover:text-blue-400 transition-colors"
                              >
                                {card.set_code}
                              </Link>
                            ) : (
                              card.set_code
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <RarityBadge rarity={card.rarity} />
                          </td>
                          <td className="px-3 py-3 text-right text-white font-medium">
                            <Money value={card.price} />
                          </td>
                          <td className="px-3 py-3 text-right text-green-400">
                            <Money
                              value={card.tradein_credit}
                              treatZeroAsMissing
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
```

This block uses the existing `cards` variable (built earlier from `data.items` + `tradeinData.items`). Don't delete the `cards` array construction above — it stays intact for the fallback path.

- [ ] **Step 5.7: Typecheck**

Run: `pnpm --filter storefront typecheck`
Expected: 0 errors. If you see "cards is not defined" inside the fallback section, the `cards` construction (around lines 117–126 of the original file) must remain in place above the JSX return.

- [ ] **Step 5.8: Dev-server smoke**

Run: `pnpm --filter storefront dev`
Open: `http://localhost:3001/prices/one-piece/movers`
Verify:
1. Page loads with h1 "One Piece — Biggest 7-Day Movers".
2. If movers exist: table renders pct cell coloured green/red with ▲/▼ arrow; clicking a card row goes to the per-card detail.
3. If movers don't exist (or wholesale unreachable): neutral fallback banner shows + most-valuable table below it.
4. Provenance pill says "computed · cardrush" (kind=computed).
5. Currency selector still works on the Buy Price column.
6. No console errors.

If type checking complained about `tradein_credit` field name on `card`, verify the `cards` construction at lines ~117–126 still includes `tradein_credit: tradeinMap.get(item.sku) ?? null,`.

- [ ] **Step 5.9: Commit**

```bash
git add apps/storefront/src/app/prices/[game]/movers/page.tsx
git commit -m "$(cat <<'EOF'
feat(storefront): rewire /prices/[game]/movers to real movers

Page now calls fetchMovers in parallel with fetchPrices, renders
the 7d pct-change table as primary surface (green ▲ / red ▼,
ABS(pct).toFixed(1)%, channel_price as Buy Price column). On a
quiet week (movers.length === 0) the page renders a neutral
"no qualifying movers" disclosure and falls back to the existing
most-valuable table — substrate-honest about the substitution.

Title + h1 flip from "Most Valuable Cards" to "Biggest 7-Day
Movers". Amber "coming soon" banner removed; the substrate has
shipped. Provenance kind="computed" makes the derived nature
explicit. Raw price_then/price_now never reach the render path
(internal-only license boundary).

Closes the substrate-honesty violation between menu-config.ts:70
("Biggest price changes 7d") and the page surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manifest description + verify gate

**Files:**
- Modify: `apps/storefront/src/lib/manifest.ts:486`

- [ ] **Step 6.1: Update the manifest description**

Open `apps/storefront/src/lib/manifest.ts`. Find the entry at line 486 starting with `{ id: "storefront.prices.movers", description:`. Replace its `description` field with:

```ts
      { id: "storefront.prices.movers", description: "Per-game 7-day movers page — /prices/[game]/movers. Top 50 cards by absolute 7-day percent change, derived from price_archive cardrush rows (singles, nm condition) with a £10 floor on the 7-day-ago price. Single SQL CTE in wholesale at /api/v1/prices/movers; storefront Falcon proxies via fetchMovers. Renders coloured pct cells + the platform's channel_price (raw cardrush-derived price_then/price_now stay off the wire — source_license: internal-only). Quiet weeks fall back to the most-valuable table. kingdom-080 follow-up; closes the substrate-honesty gap between menu-config.ts and the page.",
```

(Keep the rest of the entry — `host: "storefront", path: "/prices/[game]/movers", methods: ["GET"]` — untouched.)

- [ ] **Step 6.2: Run the full verify gate**

Run: `pnpm verify`
Expected: typecheck across all apps passes, four audits pass, admin vitest passes.

If `pnpm audit:inclusion` flags a 48h hardcode in any movers-related file, recheck: the spec doesn't introduce hardcoded response windows; the `2`/`5`/`9` day numbers in the SQL are window definitions for movers (substrate-honest constants describing the feature itself), not user response windows. If the audit still flags them, add a one-line `// audit: not a response-window — movers window definition` comment near the offending line. Do not change the numbers.

- [ ] **Step 6.3: Commit**

```bash
git add apps/storefront/src/lib/manifest.ts
git commit -m "$(cat <<'EOF'
docs(manifest): rewrite storefront.prices.movers for real movers

The placeholder description ("most-valuable-cards page... substrate-
honest about the 7d/30d delta endpoint not yet existing") no longer
matches reality. Update to describe the shipped shape: 7d cardrush
pct movers, £10 floor, single SQL CTE in wholesale, storefront
Falcon proxy, quiet-week fallback to most-valuable. Cites the new
wholesale endpoint path so the manifest is grep-able for the
kingdom-080 follow-up that just landed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist (run before declaring done)

- [ ] All 11 wholesale helper tests pass (`pnpm --filter tcg-wholesale test`)
- [ ] All 4 fetchMovers tests pass (`pnpm --filter storefront test`)
- [ ] `pnpm verify` exits 0
- [ ] Manual smoke: `/prices/one-piece/movers` loads with movers OR fallback (substrate-honest in both states)
- [ ] No raw `price_then` / `price_now` rendered in the page DOM (inspect element in dev tools)
- [ ] Provenance pill shows `kind="computed"` not `"synced"`
- [ ] Currency selector still works on the Buy Price column
- [ ] Breadcrumb final crumb says "Movers" (matches h1)
- [ ] Six commits landed, each green individually

## Rollback plan

If the new endpoint misbehaves in production and the page renders empty for >1h:

1. Revert the six commits (or just the page commit + manifest commit) — the page reverts to the most-valuable placeholder.
2. Or set `WHOLESALE_API_KEY` to an invalid value on the storefront — Falcon returns empty MoversResponse, page shows the quiet-week fallback. No data corruption; no schema changes to undo.

No DB migrations. No package.json changes other than adding a `test` script to wholesale (safe).

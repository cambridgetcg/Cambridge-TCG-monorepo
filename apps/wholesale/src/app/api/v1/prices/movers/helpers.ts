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

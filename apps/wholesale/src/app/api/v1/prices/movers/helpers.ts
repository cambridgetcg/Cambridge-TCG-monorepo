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

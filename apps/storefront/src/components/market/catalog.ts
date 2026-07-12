/**
 * Catalog surface types + pure helpers shared by /market and /market/list.
 *
 * Mirrors the response shape of GET /api/market/catalog, including its
 * structured-error contract: a source outage arrives as a 503 with
 * `{ error: { code, message }, source: "unavailable" }` and must surface
 * as an error, never as an empty catalog.
 */

export interface CatalogCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  // Labelled publicly viewable reference price — the catalogue number, never
  // an offer. Collectors-first (2026-07-06): the trade-in credit channel
  // that used to ride alongside it is gone with the we-buy desk.
  spot_price: number;
  market_price: number;
  stock: number;
  best_bid: number | null;
  best_ask: number | null;
  p2p_sellers: number;
  p2p_buyers: number;
  has_p2p: boolean;
}

export interface SetInfo {
  code: string;
  name: string;
  card_count: number;
  release_date: string | null;
}

export type CatalogSource = "wholesale-api" | "wholesale-db" | "unavailable";

export type SortKey =
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "number_asc";

export type ViewMode = "table" | "grid";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "price_asc", label: "Price Low → High" },
  { value: "price_desc", label: "Price High → Low" },
  { value: "number_asc", label: "Card Number" },
];

export const DEFAULT_GAME = "one-piece";
export const PAGE_SIZE = 48;

export type CatalogResult =
  | { ok: true; cards: CatalogCard[]; total: number; source: CatalogSource }
  | { ok: false; message: string; code?: string };

export type SetsResult =
  | { ok: true; sets: SetInfo[]; source: CatalogSource }
  | { ok: false; message: string; code?: string };

export interface CatalogQuery {
  game: string;
  q: string;
  set: string | null;
  sort: SortKey;
  page: number; // 1-based
  view: ViewMode;
}

export function isSortKey(v: string | undefined | null): v is SortKey {
  return SORT_OPTIONS.some((o) => o.value === v);
}

/**
 * Parse /market's URL params into a CatalogQuery. One interpretation,
 * two readers: the server page (initial render) and MarketBrowser's
 * popstate handler (back/forward, which the app router restores as a
 * URL-only sync — no server re-render) must agree on what a URL means.
 */
export function parseBrowseParams(sp: URLSearchParams): CatalogQuery {
  const sort = sp.get("sort");
  return {
    game: (sp.get("game") || DEFAULT_GAME).trim() || DEFAULT_GAME,
    q: (sp.get("q") || "").trim(),
    set: (sp.get("set") || "").trim() || null,
    sort: isSortKey(sort) ? sort : "name_asc",
    page: Math.max(1, parseInt(sp.get("page") || "1", 10) || 1),
    view: sp.get("view") === "grid" ? "grid" : "table",
  };
}

/** Query string for GET /api/market/catalog from a CatalogQuery. */
export function buildCatalogSearch(q: CatalogQuery, limit = PAGE_SIZE): string {
  const params = new URLSearchParams({
    game: q.game,
    sort: q.sort,
    limit: String(limit),
    offset: String((q.page - 1) * limit),
  });
  if (q.set) params.set("set", q.set);
  if (q.q) params.set("q", q.q);
  return params.toString();
}

/** Canonical /market URL for a query — defaults omitted so URLs stay short. */
export function buildBrowseUrl(q: CatalogQuery): string {
  const params = new URLSearchParams();
  if (q.game !== DEFAULT_GAME) params.set("game", q.game);
  if (q.q) params.set("q", q.q);
  if (q.set) params.set("set", q.set);
  if (q.sort !== "name_asc") params.set("sort", q.sort);
  if (q.page > 1) params.set("page", String(q.page));
  if (q.view !== "table") params.set("view", q.view);
  const s = params.toString();
  return s ? `/market?${s}` : "/market";
}

/**
 * Extract the honest failure message from a non-OK catalog response body.
 * The route's structured form is `{ error: { code, message } }`; older
 * endpoints use `{ error: string }`. Anything else gets a generic line
 * that still names the failure as an outage rather than emptiness.
 */
export function parseCatalogError(body: unknown): { message: string; code?: string } {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string" && err) return { message: err };
    if (err && typeof err === "object") {
      const { code, message } = err as { code?: unknown; message?: unknown };
      if (typeof message === "string" && message) {
        return { message, code: typeof code === "string" ? code : undefined };
      }
    }
  }
  return {
    message:
      "The card catalog could not be loaded — this is a source problem, not an empty catalog. Please try again shortly.",
  };
}

/**
 * Set ordering for the sidebar: main sets (OP) first, then EB, ST, PRB,
 * promos, everything else — numeric-aware within each group. Same order
 * the old /market shipped; kept as a pure helper so it's testable.
 */
const SET_GROUP_ORDER: Record<string, number> = {
  OP: 0, EB: 1, ST: 2, PRB: 3, PCC: 4, P: 5, PROMO: 6, SEALED: 7,
};

export function sortSetsForDisplay(sets: SetInfo[]): SetInfo[] {
  return [...sets].sort((a, b) => {
    const prefA = a.code.replace(/[0-9-].*/, "");
    const prefB = b.code.replace(/[0-9-].*/, "");
    const gA = SET_GROUP_ORDER[prefA] ?? 8;
    const gB = SET_GROUP_ORDER[prefB] ?? 8;
    if (gA !== gB) return gA - gB;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

export interface PageStats {
  /** Cards on this page with at least one open collector ask or bid. */
  cardsWithActivity: number;
  /** Open ask units (quantity remaining) across this page. */
  openAskUnits: number;
  /** Open collector bid units across this page. */
  openBidUnits: number;
}

/**
 * Stats for the strip above the catalog. Page-scoped by construction
 * (the API only returns one page) — the UI labels them as computed from
 * the cards on this page, never as market-wide totals.
 *
 * Collectors-first (2026-07-06): counts are pure. The catalog API no
 * longer folds a house credit bid into p2p_buyers, so there is nothing
 * to subtract — every bid is a collector's.
 */
export function derivePageStats(cards: CatalogCard[]): PageStats {
  let cardsWithActivity = 0;
  let openAskUnits = 0;
  let openBidUnits = 0;
  for (const c of cards) {
    if (c.p2p_sellers > 0 || c.p2p_buyers > 0) cardsWithActivity++;
    openAskUnits += c.p2p_sellers;
    openBidUnits += c.p2p_buyers;
  }
  return { cardsWithActivity, openAskUnits, openBidUnits };
}

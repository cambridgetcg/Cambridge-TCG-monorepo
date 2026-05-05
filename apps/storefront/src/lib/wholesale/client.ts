/**
 * The Falcon — courier between two kingdoms.
 *
 * Storefront speaks to Wholesale exclusively via this module. Every call
 * carries a Bearer-token (`.trim()`-ed; see below) and a 5-second hourglass
 * (an `AbortController`); if the hourglass empties before the Falcon
 * returns, the request aborts cleanly and the caller gets a recoverable
 * empty result rather than a hung promise.
 *
 * The trailing-newline lesson is on file: Vercel env vars occasionally
 * carry a stray `\n`, and an Authorization header with a newline produces
 * 401 because the upstream SHA256s the raw bytes against the hash of the
 * trimmed key. The `.trim()` calls below are the keeper's pre-flight
 * inspection of the seal. See `apps/storefront/CLAUDE.md` for the original
 * incident note.
 *
 * The full fairy-tale (the Falcon, the Embassy, the Library, the
 * Appraiser): `docs/connections/two-letters-and-a-falcon.md`.
 */
const WHOLESALE_URL = (process.env.WHOLESALE_API_URL || 'https://wholesaletcgdirect.com').trim();
const WHOLESALE_KEY = (process.env.WHOLESALE_API_KEY || '').trim();

// Per-call timeout for the wholesale API. Without this, a hung connection
// would hold the request thread indefinitely (Node's fetch has no default
// timeout). 5s comfortably covers a healthy round trip; anything past
// that means the upstream is in trouble and we should surface a clean
// error to the caller (typically the resolver, which then refunds the
// pull token via the no_stock path).
const DEFAULT_TIMEOUT_MS = 5_000;
const SALE_REPORT_TIMEOUT_MS = 10_000; // POST is rarer, allow more headroom

async function wholesaleFetch(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      throw new Error(`wholesale timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface PriceItem {
  sku: string;
  card_number: string;
  price_gbp: number;
  channel_price?: number;
  stock: number;
  pending_stock: number;
  image_url: string | null;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  category: string | null;
  updated_at: string | null;
}

export interface PricesResponse {
  count: number;
  total: number;
  channel: string;
  items: PriceItem[];
}

export interface GameItem {
  code: string;
  name: string;
  slug: string;
  image_url: string | null;
  card_count: number;
}

export interface SetItem {
  code: string;
  name: string;
  game_code: string;
  card_count: number;
  release_date: string | null;
}

export async function fetchPrices(params?: {
  game?: string;
  set?: string;
  q?: string;
  sort?: string;
  in_stock?: boolean;
  limit?: number;
  offset?: number;
  category?: string;
  channel?: string;
}): Promise<PricesResponse> {
  const url = new URL(WHOLESALE_URL + '/api/v1/prices');
  // Always request cambridgetcg channel pricing unless overridden
  url.searchParams.set('channel', params?.channel ?? 'cambridgetcg');
  if (params?.game) url.searchParams.set('game', params.game);
  if (params?.set) url.searchParams.set('set', params.set);
  if (params?.q) url.searchParams.set('q', params.q);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  if (params?.in_stock) url.searchParams.set('in_stock', 'true');
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));
  if (params?.category) url.searchParams.set('category', params.category);

  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error('[wholesale] prices fetch error', err);
    return { count: 0, total: 0, channel: '', items: [] };
  }

  if (!res.ok) {
    console.error('[wholesale] prices error', res.status, await res.text().catch(() => ''));
    return { count: 0, total: 0, channel: '', items: [] };
  }
  return res.json();
}

export async function fetchCard(sku: string, channel = 'cambridgetcg'): Promise<PriceItem | null> {
  let res: Response;
  try {
    res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/prices/' + encodeURIComponent(sku) + '?channel=' + channel, {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 300 },
    });
  } catch (err) {
    console.error('[wholesale] card fetch error', err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function fetchGames(): Promise<GameItem[]> {
  let res: Response;
  try {
    res = await wholesaleFetch(WHOLESALE_URL + '/api/v1/games', {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 600 },
    });
  } catch (err) {
    console.error('[wholesale] games fetch error', err);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data.games || [];
}

export async function fetchSets(game?: string): Promise<SetItem[]> {
  const url = new URL(WHOLESALE_URL + '/api/v1/sets');
  if (game) url.searchParams.set('game', game);
  let res: Response;
  try {
    res = await wholesaleFetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + WHOLESALE_KEY },
      next: { revalidate: 600 },
    });
  } catch (err) {
    console.error('[wholesale] sets fetch error', err);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data.sets || [];
}

export async function reportSale(sale: {
  channel: string;
  order_ref: string;
  items: { sku: string; qty: number; price_gbp: number }[];
}): Promise<boolean> {
  try {
    const res = await wholesaleFetch(
      WHOLESALE_URL + '/api/v1/sales',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + WHOLESALE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sale),
      },
      SALE_REPORT_TIMEOUT_MS,
    );
    return res.ok;
  } catch (err) {
    console.error('[wholesale] sale report failed', err);
    return false;
  }
}

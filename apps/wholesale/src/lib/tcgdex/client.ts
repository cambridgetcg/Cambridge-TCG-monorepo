/**
 * TCGdex client — the second-witness courier.
 *
 * TCGdex (https://api.tcgdex.net/v2/) is a community-maintained,
 * multilingual Pokémon TCG metadata API. Free, no auth, REST. We use it
 * as a *metadata-correctness witness* alongside CardRush (the
 * market-reality witness). See `docs/connections/the-second-witness.md`.
 *
 * Substrate-honest about absence: every call returns `null` on 404 /
 * timeout / non-OK rather than throwing. The caller (typically
 * cardrush-discovery.ts `ensureSetRow`) decides what to do with absence
 * — usually "leave tcgdex_* columns NULL, retry on next discovery run".
 *
 * Pokémon-only: TCGdex doesn't carry One Piece or Dragon Ball. The
 * client guards game code so callers don't waste a request.
 */

const TCGDEX_BASE = "https://api.tcgdex.net/v2";
const DEFAULT_TIMEOUT_MS = 5_000;

/** Games that TCGdex carries. Today: Pokémon only. */
const SUPPORTED_GAMES = new Set(["pokemon"]);

export function tcgdexSupportsGame(gameCode: string): boolean {
  return SUPPORTED_GAMES.has(gameCode);
}

/**
 * Subset of the TCGdex set response we persist. The full response also
 * carries a `cards[]` array (one per card in the set); we ignore that
 * here because card-level enrichment is a separate cron (deferred).
 *
 * Verified against `GET /v2/ja/sets/SV11B` on 2026-05-14.
 */
export interface TcgdexSet {
  id: string;
  name: string;
  serie?: { id: string; name: string } | null;
  logo?: string | null;
  symbol?: string | null;
  releaseDate?: string | null;
  cardCount?: {
    total?: number;
    official?: number;
    holo?: number;
    normal?: number;
    reverse?: number;
    firstEd?: number;
  } | null;
}

/**
 * Fetch a single set by `(lang, setCode)`. `lang` defaults to "ja" since
 * our pokemon set codes mirror the Japanese release SKUs. Returns null
 * on 404, timeout, or any non-OK response — never throws. Caller logs.
 */
export async function fetchTcgdexSet(
  setCode: string,
  lang: "ja" | "en" | "fr" | "de" | "es" | "it" | "pt" | "pl" | "nl" | "id" | "th" | "zh-tw" | "zh-cn" | "ko" = "ja",
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TcgdexSet | null> {
  const url = `${TCGDEX_BASE}/${lang}/sets/${encodeURIComponent(setCode)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    console.error(
      "[tcgdex]",
      err instanceof Error && err.name === "AbortError"
        ? `timeout after ${timeoutMs}ms: ${url}`
        : `fetch error: ${err instanceof Error ? err.message : String(err)} (${url})`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[tcgdex] non-OK", res.status, url);
    return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    console.error(
      "[tcgdex] json parse error",
      err instanceof Error ? err.message : String(err),
      url,
    );
    return null;
  }

  if (!isTcgdexSet(body)) {
    console.error("[tcgdex] unexpected response shape", url);
    return null;
  }
  return body;
}

function isTcgdexSet(v: unknown): v is TcgdexSet {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string";
}

/**
 * Project a TcgdexSet into the `tcgdex_*` column shape on the `sets`
 * table. Pure — no DB writes. Callers (cardrush-discovery's ensureSetRow,
 * the orphan-backfill name-pass) compose this with their own UPDATE.
 */
export function projectToColumns(set: TcgdexSet): {
  tcgdexId: string;
  tcgdexName: string;
  tcgdexSerieName: string | null;
  tcgdexLogoUrl: string | null;
  tcgdexReleaseDate: string | null;
  tcgdexCardCount: number | null;
  tcgdexFetchedAt: Date;
} {
  return {
    tcgdexId: set.id,
    tcgdexName: set.name,
    tcgdexSerieName: set.serie?.name ?? null,
    tcgdexLogoUrl: set.logo ?? null,
    tcgdexReleaseDate: set.releaseDate ?? null,
    tcgdexCardCount: set.cardCount?.total ?? set.cardCount?.official ?? null,
    tcgdexFetchedAt: new Date(),
  };
}

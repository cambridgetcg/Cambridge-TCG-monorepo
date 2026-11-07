/**
 * The official sample-image lanes, as data. Pure, with no imports, so the
 * readers, the manual tools and the redistribution audit read one table.
 *
 * - en: the 2026-07-13 decision (docs/EN-CARD-DATA.md). Its One Piece check
 *   is host-only (paths: null), as it always was. Fusion World shares one
 *   host between languages, so its English path is checked too: images under
 *   /fw/images/cards/card/en/ and, for card_texts provenance, pages under
 *   /fw/en/.
 * - ja: Yu's decision of 2026-10-30 (docs/decisions/2026-10-30-japanese-official-images.md).
 *   Its credit lines are the Japanese footers' own, full-width characters
 *   kept: never NFKC-normalise them.
 *
 * A reader binds its lane by the function it calls, never from a row's own
 * lang or source.
 */

export type OfficialImageLaneLang = "en" | "ja";
export type OfficialImageGame = "op" | "dbf";

export interface OfficialImageGameLane {
  /** The publisher host a row's source_url must name. */
  readonly host: string;
  /** Path prefixes the source_url must start with; null means host-only. */
  readonly paths: readonly string[] | null;
  /** The publisher image file's extension. */
  readonly ext: "png" | "webp";
}

export interface OfficialImageLane {
  readonly lang: OfficialImageLaneLang;
  readonly source: "bandai-en" | "bandai-jp";
  /** The recorded display decision the lane publishes under. */
  readonly policy: string;
  /** The value each row's license_note must carry, or null where rows carry none. */
  readonly evidence: string | null;
  /** The exact credit line per game, or null where rows carry their own. */
  readonly credits: Readonly<Record<OfficialImageGame, string>> | null;
  readonly games: Readonly<Record<OfficialImageGame, OfficialImageGameLane>>;
}

export const OFFICIAL_IMAGE_LANES = {
  en: {
    lang: "en",
    source: "bandai-en",
    policy: "cambridge.official-en-media/2026-07-13",
    evidence: null,
    credits: null,
    games: {
      op: { host: "en.onepiece-cardgame.com", paths: null, ext: "png" },
      dbf: { host: "www.dbs-cardgame.com", paths: ["/fw/en/", "/fw/images/cards/card/en/"], ext: "webp" },
    },
  },
  ja: {
    lang: "ja",
    source: "bandai-jp",
    policy: "cambridge.official-ja-media/2026-10-30",
    evidence: "cambridge.official-ja-media/2026-10-30",
    credits: {
      op: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
      dbf: "©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc.",
    },
    games: {
      op: { host: "www.onepiece-cardgame.com", paths: ["/images/cardlist/card/"], ext: "png" },
      dbf: { host: "www.dbs-cardgame.com", paths: ["/fw/images/cards/card/jp/"], ext: "webp" },
    },
  },
} as const satisfies Readonly<Record<OfficialImageLaneLang, OfficialImageLane>>;

const TOKEN_KEY = /token|secret|password|credential|authorization|api[_-]?key|signature/i;
const KEY_RE = /^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z]{2})(?:-([A-Z0-9]+))?$/;

/** Whether the publisher file a URL names is the key's own card. Derived
 * from the key, never from the URL. Japanese keys are base prints only:
 * OP01-001.png; FB10-001.webp or FB10-001_f.webp (front face). English keys
 * keep a parallel or reprint tail: OP-OP01-001-EN-P1 is OP01-001_p1.png, and
 * Fusion World's front marker sits before it (FB10-001_f_p1.webp). */
function fileNamesKey(lane: OfficialImageLane, game: OfficialImageGame, pathname: string, key: string): boolean {
  const parts = KEY_RE.exec(key);
  if (!parts || parts[1] !== game.toUpperCase() || parts[4] !== lane.lang.toUpperCase()) return false;
  const stem = `${parts[2]}-${parts[3]}`, variant = parts[5];
  if (lane.lang === "ja" ? variant !== undefined : variant !== undefined && !/^[PR]\d+$/.test(variant)) return false;
  const tail = variant ? `_${variant.toLowerCase()}` : "";
  const ext = lane.games[game].ext;
  const names = game === "dbf" ? [`${stem}${tail}.${ext}`, `${stem}_f${tail}.${ext}`] : [`${stem}${tail}.${ext}`];
  const basename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return names.includes(basename);
}

/**
 * A row's stored publisher URL, when it fits the lane: https with no
 * credentials, port or fragment, the game's host and path, and no token-like
 * query keys. With a key, the file must also be that key's own card (the
 * upload tool checks both lanes this way). The Japanese lane always needs
 * the key, and its query must be empty or one bare numeric cache token
 * (One Piece's `?261016`).
 */
export function laneSourceUrl(lane: OfficialImageLane, game: string, value: unknown, key?: string): URL | null {
  if (typeof value !== "string" || value !== value.trim() || /[\s\\]/.test(value)) return null;
  if (!Object.hasOwn(lane.games, game)) return null;
  const expected = lane.games[game as OfficialImageGame];
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.hostname !== expected.host) return null;
  if (!(expected.paths === null || expected.paths.some((prefix) => url.pathname.startsWith(prefix)))) return null;
  if ([...url.searchParams.keys()].some((name) => TOKEN_KEY.test(name))) return null;
  if (lane.lang === "ja") {
    if (key === undefined) return null;
    if (!(url.search === "" || (game === "op" && /^\?\d{1,8}$/.test(url.search)))) return null;
  }
  if (key !== undefined && !fileNamesKey(lane, game as OfficialImageGame, url.pathname, key)) return null;
  return url;
}

/** The lane whose language a key's language segment names, if any. */
export function laneForLang(lang: string): OfficialImageLane | null {
  return lang === "en" || lang === "ja" ? OFFICIAL_IMAGE_LANES[lang] : null;
}

import { createImageReference, type ImageReference } from "./image-reference";
import { createCardNumberImageReference, type CardNumberImageReference } from "./card-number-image-reference";
import { createSameLanguageImageReference, type SameLanguageImageReference } from "./same-language-image-reference";
import { laneSourceUrl, OFFICIAL_IMAGE_LANES, type OfficialImageGame, type OfficialImageLane } from "./official-image-lanes";

/** Recorded display decision, not a publisher license or a live asset check.
 * The English lane's, kept as it was; both lanes live in official-image-lanes.ts. */
export const OFFICIAL_MEDIA_POLICY = {
  id: OFFICIAL_IMAGE_LANES.en.policy,
  source: OFFICIAL_IMAGE_LANES.en.source,
  documentation: "/legal/card-images",
  scope: "Existing attributed official media on Cambridge surfaces; no onward license.",
} as const;

export const DEFAULT_CARD_IMAGE_CDN = "https://ctcg-card-images.s3.us-east-1.amazonaws.com";
const OFFICIAL_HOSTS = new Set(["ctcg-card-images.s3.us-east-1.amazonaws.com", "ctcg-card-images.s3.amazonaws.com"]);
const CATALOG_HOSTS = new Set(["jp-op-photos.s3.us-east-1.amazonaws.com", "jp-pk-photos.s3.us-east-1.amazonaws.com", "jp-db-photos.s3.us-east-1.amazonaws.com"]);

export interface StoredOfficialImage {
  sku: string;
  lang: string;
  source: string;
  kind: string;
  takedown_status: string;
  s3_key: string | null;
  attribution: string;
  source_url: string | null;
  retrieved_at: unknown;
  /** The Japanese lane's evidence (its decision id); English rows carry none. */
  license_note?: string | null;
}

interface OfficialImageDetails {
  url: string;
  attribution: string;
  kind: "official_sample";
  source: "bandai-en";
  source_url: string;
  retrieved_at: string;
  publication_policy: typeof OFFICIAL_MEDIA_POLICY.id;
}

export interface OfficialCardImage extends OfficialImageDetails {
  reference: ImageReference;
}

export interface OfficialCardNumberImage extends OfficialImageDetails {
  reference: CardNumberImageReference;
}

/** An official image in the requested SKU's own language (Japanese), self-hosted with its Japanese credit. */
export interface SameLanguageCardImage {
  url: string;
  attribution: string;
  kind: "official_sample";
  source: "bandai-jp";
  source_url: string;
  retrieved_at: string;
  publication_policy: typeof OFFICIAL_IMAGE_LANES.ja.policy;
  language: "ja";
  reference: SameLanguageImageReference;
}

type OfficialImageReference = ImageReference | CardNumberImageReference | SameLanguageImageReference;
type StoredProvenance = Pick<StoredOfficialImage, "sku" | "lang" | "source" | "attribution" | "source_url" | "retrieved_at">;

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value !== value.trim() || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch { return null; }
}

/** Conservative object paths: no traversal, encoded separators or URL suffixes. */
function objectKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Enforces the recorded self-hosted fallback, without declaring its provenance. */
export function catalogImageUrl(value: unknown): string | null {
  const url = httpsUrl(value);
  if (!url || !CATALOG_HOSTS.has(url.hostname) || url.search || !objectKey(url.pathname.slice(1))) return null;
  // Inspect the original path too: URL parsing would erase dot segments.
  const rawPath = String(value).slice(String(value).indexOf("/", "https://".length) + 1);
  return objectKey(rawPath) ? url.href : null;
}

export function officialImageUrl(key: unknown, cdn: string = DEFAULT_CARD_IMAGE_CDN): string | null {
  const base = httpsUrl(cdn);
  if (!base || !OFFICIAL_HOSTS.has(base.hostname) || base.pathname !== "/" || base.search) return null;
  if (!objectKey(key) || !key.startsWith("official/")) return null;
  return `${base.origin}/${key}`;
}

/** Check local calendar fields before parsing: Date.parse can roll invalid days
 * into the next month. Keep the existing UTC millisecond wire representation. */
function retrievalTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!
    || hour > 23 || minute > 59 || second > 59) return null;
  const offset = parts[7]!;
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Every relationship kind shares one stored source-evidence boundary, in
 * the lane its caller binds. A row from another lane is refused whatever its
 * own lang or source says. */
function provenanceForReference<T extends OfficialImageReference>(reference: T | null, row: StoredProvenance, lane: OfficialImageLane) {
  const sourceUrl = httpsUrl(row.source_url);
  if (!reference || row.lang !== lane.lang || row.source !== lane.source || !sourceUrl) return null;
  const game = reference.depicted_canonical_sku.split("-")[0]!;
  if (!Object.hasOwn(lane.games, game)) return null;
  const expected = lane.games[game as OfficialImageGame];
  if (sourceUrl.hostname !== expected.host || !(expected.paths === null || expected.paths.some((prefix) => sourceUrl.pathname.startsWith(prefix)))) return null;
  if ([...sourceUrl.searchParams.keys()].some((key) => /token|secret|password|credential|authorization|api[_-]?key|signature/i.test(key))) return null;
  if (typeof row.attribution !== "string" || !row.attribution.trim()) return null;
  const timestamp = retrievalTimestamp(row.retrieved_at);
  if (timestamp === null) return null;
  return { reference, attribution: row.attribution, source_url: sourceUrl.href, retrieved_at: new Date(timestamp).toISOString() };
}

/** Stored source evidence is checked for coherence, not independently verified.
 * Text provenance (card_texts) stays in the English lane. */
export function officialMediaProvenance(requestedSku: string, row: StoredProvenance) {
  return provenanceForReference(createImageReference(requestedSku, row.sku), row, OFFICIAL_IMAGE_LANES.en);
}

function projectImage<T extends OfficialImageReference>(reference: T | null, row: StoredOfficialImage, cdn: string, lane: OfficialImageLane) {
  if (row.kind !== "official_sample" || row.takedown_status !== "clear") return null;
  const provenance = provenanceForReference(reference, row, lane);
  const url = officialImageUrl(row.s3_key, cdn);
  return provenance && url ? { url, ...provenance, kind: "official_sample" as const } : null;
}

/** Strict SKU requests still accept only the selected English base-image row. */
export function projectOfficialImage(requestedSku: string, row: StoredOfficialImage, cdn = DEFAULT_CARD_IMAGE_CDN): OfficialCardImage | null {
  const image = projectImage(createImageReference(requestedSku, row.sku), row, cdn, OFFICIAL_IMAGE_LANES.en);
  return image ? { ...image, source: OFFICIAL_MEDIA_POLICY.source, publication_policy: OFFICIAL_MEDIA_POLICY.id } : null;
}

/** Practice references preserve the selected English parallel/reprint identifier. */
export function projectOfficialCardNumberImage(game: string, cardNumber: string, row: StoredOfficialImage, cdn = DEFAULT_CARD_IMAGE_CDN): OfficialCardNumberImage | null {
  const image = projectImage(createCardNumberImageReference(game, cardNumber, row.sku), row, cdn, OFFICIAL_IMAGE_LANES.en);
  return image ? { ...image, source: OFFICIAL_MEDIA_POLICY.source, publication_policy: OFFICIAL_MEDIA_POLICY.id } : null;
}

/** A Japanese request's own-language base image (Yu, 2026-10-30). Beyond the
 * shared checks, the Japanese lane requires its exact credit line and
 * decision id, an object named for the row's own key, and a publisher file
 * that names the same card in a clean URL (official-image-lanes.ts). */
export function projectSameLanguageImage(requestedSku: string, row: StoredOfficialImage, cdn = DEFAULT_CARD_IMAGE_CDN): SameLanguageCardImage | null {
  const lane = OFFICIAL_IMAGE_LANES.ja;
  const image = projectImage(createSameLanguageImageReference(requestedSku, row.sku), row, cdn, lane);
  if (!image) return null;
  const game = image.reference.depicted_canonical_sku.split("-")[0] as OfficialImageGame;
  if (row.attribution !== lane.credits[game] || row.license_note !== lane.evidence
    || row.s3_key !== `official/${row.sku}.${lane.games[game].ext}` || !laneSourceUrl(lane, game, row.source_url, row.sku)) return null;
  return { ...image, source: lane.source, publication_policy: lane.policy, language: "ja" };
}

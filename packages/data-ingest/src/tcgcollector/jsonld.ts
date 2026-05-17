/**
 * JSON-LD `<script type="application/ld+json">` extractor.
 *
 * Pure function: HTML string in, parsed JSON-LD objects out. No fetch,
 * no DOM, no I/O. Tolerant of:
 *   - Multiple `<script>` blocks on the page (returns all)
 *   - Whitespace and attribute order variations
 *   - HTML entities inside the script (`&amp;`, `&lt;`, `&gt;`)
 *   - `@graph` containers (flattens to children)
 *   - Malformed JSON (skips that block; returns the rest)
 *
 * Substrate-honest about absence: empty array when no JSON-LD found.
 * Substrate-honest about malformation: each parse failure produces an
 * entry in `errors` rather than throwing.
 *
 * Used by the TCGCollector discovery + ingest path; structured so
 * future sitemap-discovery vendors (Cardmarket EU, TCGCSV, etc.) can
 * import the same primitive.
 */

/** A parsed JSON-LD object. Untyped at this layer — adapters narrow. */
export type JsonLdObject = Record<string, unknown>;

/** Result of extracting JSON-LD from an HTML page. */
export interface JsonLdExtractResult {
  /** Every JSON-LD object found. `@graph` containers are flattened. */
  objects: JsonLdObject[];
  /** Parse failures, one per malformed `<script>` block. */
  errors: string[];
}

/**
 * Extract every `<script type="application/ld+json">…</script>` block
 * from the HTML. Each block's body is JSON-parsed; arrays and `@graph`
 * containers are flattened to a flat list of objects.
 *
 * The regex matches a script tag with `type="application/ld+json"`
 * (single or double quoted, case-insensitive on the type value, any
 * attribute order before/after the type attribute). HTML entities in
 * the body are decoded before parsing so `"name": "Rayquaza &amp; Friends"`
 * round-trips correctly.
 */
export function extractJsonLd(html: string): JsonLdExtractResult {
  const objects: JsonLdObject[] = [];
  const errors: string[] = [];

  // Match <script ... type="application/ld+json" ... >body</script>.
  // The character class for the type value tolerates single+double quotes;
  // [^<]* in the body stops at the next `<` which is the closing tag.
  // The `i` flag handles case variation in attribute names.
  const re =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const m of html.matchAll(re)) {
    const body = decodeHtmlEntities(m[1].trim());
    if (body.length === 0) continue;
    try {
      const parsed = JSON.parse(body);
      pushFlat(parsed, objects);
    } catch (err) {
      errors.push(
        `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { objects, errors };
}

/**
 * Flatten a JSON-LD value into the accumulator. Handles three shapes:
 *   - object → push directly (or expand its `@graph` if present)
 *   - array → recurse each element
 *   - other (string, number, null) → skip (not a JSON-LD object)
 */
function pushFlat(value: unknown, acc: JsonLdObject[]): void {
  if (Array.isArray(value)) {
    for (const v of value) pushFlat(v, acc);
    return;
  }
  if (!isPlainObject(value)) return;
  const obj = value as JsonLdObject;
  if (Array.isArray(obj["@graph"])) {
    pushFlat(obj["@graph"], acc);
    return;
  }
  acc.push(obj);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Decode the five HTML entities that appear in JSON-LD bodies in
 * practice. Numeric entities (`&#39;`, `&#x27;`) for apostrophes are
 * also handled because Schema.org renderers sometimes emit them.
 *
 * Substrate-honest: this is not a full HTML entity decoder. It handles
 * the entities that actually appear in JSON-LD; anything more exotic
 * is preserved verbatim, which yields a substrate-honest JSON parse
 * error rather than a silently-mangled string.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

// ── Schema.org filters ──────────────────────────────────────────────────

/**
 * Return only objects whose `@type` is `Product` (or includes Product
 * in a string array). Schema.org allows multi-type (e.g.
 * `["Product", "TradingCard"]`).
 */
export function filterProducts(objects: readonly JsonLdObject[]): JsonLdObject[] {
  return objects.filter((o) => typeIncludes(o, "Product"));
}

/**
 * Return only objects whose `@type` is `Offer` or `AggregateOffer`. Some
 * pages expose offers as a top-level object alongside the product.
 */
export function filterOffers(objects: readonly JsonLdObject[]): JsonLdObject[] {
  return objects.filter(
    (o) => typeIncludes(o, "Offer") || typeIncludes(o, "AggregateOffer"),
  );
}

/**
 * Check whether a JSON-LD object's `@type` includes the given target.
 * Tolerant of `@type: "Product"` and `@type: ["Product", "TradingCard"]`.
 */
export function typeIncludes(obj: JsonLdObject, target: string): boolean {
  const t = obj["@type"];
  if (typeof t === "string") return t === target;
  if (Array.isArray(t)) return t.some((x) => x === target);
  return false;
}

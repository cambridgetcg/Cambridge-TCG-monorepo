import Link from "next/link";
import { MEMBER_PRICE_POLICIES } from "@cambridge-tcg/data-ingest/member-prices";
import { Field, Input, Select } from "@/lib/ui/Input";
import { DISPLAY_ONLY_INPUT_PAGE_LIMIT, DISPLAY_ONLY_INPUT_PAGES, DISPLAY_ONLY_INPUT_PAGES_END, isDisplayOnlyInput, type MemberPriceItem, type MemberPricePage, type MemberPriceSource } from "@/lib/prices/member-feed-types";
import type { MemberPriceImage, MemberPriceImages } from "@/lib/prices/member-images";
import { LANGUAGE_NAMES } from "@/lib/cards/image-labels";
import { memberPriceExportHref, memberPriceHref } from "./member-query";

const METRICS = ["avg", "low", "trend", "avg1", "avg7", "avg30", "avg-foil", "low-foil", "trend-foil", "avg1-foil", "avg7-foil", "avg30-foil", "usd", "usd_foil", "usd_etched", "eur", "eur_foil", "sell", "market", "listed-median"];
const SOURCE_NAMES = { cardmarket: "Cardmarket", scryfall: "Scryfall", cardrush: "CardRush", tcgplayer: "TCGplayer" } as const satisfies Record<MemberPriceSource, string>;
const MARKET_NAMES = { cardmarket: "Cardmarket", tcgplayer: "TCGplayer", cardrush: "CardRush" } as const satisfies Record<MemberPriceItem["underlyingMarket"], string>;
// The yen has no minor unit; euro and dollar amounts show at least cents.
const MINOR_DIGITS = { EUR: 2, USD: 2, JPY: 0 } as const satisfies Record<MemberPriceItem["currency"], number>;
const isSource = (value: string | null): value is MemberPriceSource => value !== null && Object.hasOwn(MEMBER_PRICE_POLICIES, value);
const DISPLAY_ONLY_INPUTS = (Object.keys(MEMBER_PRICE_POLICIES) as MemberPriceSource[]).filter((source) => isDisplayOnlyInput(MEMBER_PRICE_POLICIES[source]));

// Display only: the reader and export retain the exact decimal string. Avoid
// Number coercion (precision loss) and the shared GBP-only price formatters.
// Trailing zeros past the currency's minor unit are storage scale, not data.
function formatNativeAmount(amount: string, currency: MemberPriceItem["currency"]): string {
  const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount);
  if (!parts) return "—";
  const fraction = (parts[2] ?? "").replace(/0+$/, "").padEnd(MINOR_DIGITS[currency], "0");
  return fraction ? `${parts[1]}.${fraction}` : parts[1]!;
}

/** `displayOnly`: the display-only sources holding rows to show
 * (displayOnlySourcesWithRows). Only those are offered, with the filter in use. */
export function MemberPriceFilters({ params, displayOnly }: { params: URLSearchParams; displayOnly: readonly MemberPriceSource[] }) {
  const selected = params.get("source");
  const offered = DISPLAY_ONLY_INPUTS.filter((source) => displayOnly.includes(source) || selected === source);
  return (
    <form action="/prices" method="get" className="my-6 space-y-4" aria-label="Filter member prices">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product name" htmlFor="member-price-q">
          <Input id="member-price-q" name="q" defaultValue={params.get("q") ?? ""} maxLength={120} placeholder="Search source product names or IDs" />
        </Field>
        <Field label="Source" htmlFor="member-price-source">
          <Select id="member-price-source" name="source" defaultValue={params.get("source") ?? ""}>
            <option value="">All eligible display sources</option>
            <option value="cardmarket">Cardmarket · display and export</option>
            <option value="scryfall">Scryfall · display only</option>
            {offered.map((source) => <option key={source} value={source}>{SOURCE_NAMES[source]} · display only</option>)}
          </Select>
        </Field>
        <Field label="Game slug" htmlFor="member-price-game" hint="Coverage depends on imported observations, not the presence of a filter option.">
          <Input id="member-price-game" name="game" list="member-price-games" defaultValue={params.get("game") ?? ""} maxLength={100} />
          <datalist id="member-price-games">
            <option value="magic">Magic: The Gathering</option>
            <option value="pokemon">Pokémon</option>
            <option value="yu-gi-oh">Yu-Gi-Oh!</option>
            <option value="one-piece">One Piece</option>
          </datalist>
        </Field>
        <Field label="Source metric" htmlFor="member-price-metric" hint="Keep metrics distinct; averages, low and trend are not individual sales.">
          <Input id="member-price-metric" name="metric" list="member-price-metrics" defaultValue={params.get("metric") ?? ""} maxLength={100} />
          <datalist id="member-price-metrics">{METRICS.map((metric) => <option key={metric} value={metric} />)}</datalist>
        </Field>
        <Field label="View" htmlFor="member-price-mode">
          <Select id="member-price-mode" name="mode" defaultValue={params.get("mode") ?? "current"}>
            <option value="current">Current · latest stored observations</option>
            <option value="history">History · stored observations</option>
          </Select>
        </Field>
        <Field label="Rows per page" htmlFor="member-price-limit">
          <Input id="member-price-limit" name="limit" type="number" min={1} max={500} defaultValue={params.get("limit") ?? "100"} />
        </Field>
        <Field label="Canonical set code" htmlFor="member-price-set" hint="Exact catalog mappings only.">
          <Input id="member-price-set" name="set" defaultValue={params.get("set") ?? ""} maxLength={100} />
        </Field>
        <Field label="Canonical SKU" htmlFor="member-price-sku" hint="Exact catalog mappings only; leave empty to include unmatched products.">
          <Input id="member-price-sku" name="sku" defaultValue={params.get("sku") ?? ""} maxLength={200} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-page">Apply filters</button>
        <Link href="/prices" prefetch={false} className="text-sm text-accent underline underline-offset-4">Clear filters</Link>
      </div>
    </form>
  );
}

function ObservationTime({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{value}</time> : <>Unknown</>;
}

// Language names are shared with the market labels (image-labels.ts); any
// other code shows as the code alone.
const languageOf = (code: string) => Object.hasOwn(LANGUAGE_NAMES, code) ? `${LANGUAGE_NAMES[code]} (${code})` : `in language ${code}`;
// pN and rN are the publisher's parallel and reprint suffixes; any other variant is named as stored.
const variantOf = (variant: string | null) => variant === null ? "another printing" : /^p\d+$/.test(variant) ? "a parallel" : /^r\d+$/.test(variant) ? "a reprint" : `a variant (${variant})`;

/** What the official image is, then how it relates to the row: plainly, so
 * a member never takes base art, or art in another language, for the row's
 * own printing. Even a matching SKU is syntax only (the reference's scope),
 * so it says so. The image's language is named in every case. */
function officialLabel(image: NonNullable<MemberPriceImage["official"]>): [string, string] {
  const imageLanguage = LANGUAGE_NAMES[image.imageLang];
  if (image.relationship === "pooled-row") return [`Official ${imageLanguage} base print`, "this row is a source-product aggregate: language and art may differ"];
  if (image.relationship === "same-printing") return ["Official image", `this printing (${imageLanguage}), matched by SKU, not verified`];
  if (image.relationship === "same-language-base-print") return [`Official ${imageLanguage} base print`, `this row is ${variantOf(image.rowVariant)}, art may differ`];
  return image.rowVariant === null
    ? [`Official ${imageLanguage} image`, `this row is ${languageOf(image.rowLang)}: language differs`]
    : [`Official ${imageLanguage} base print`, `this row is ${languageOf(image.rowLang)}, ${variantOf(image.rowVariant)}: language differs, art may differ`];
}

/** A row's official base print, small and fixed-size, from
 * Cambridge's own image host, for checking the item. The data attributes say
 * the same as the label, for an agent reading the HTML. */
function OfficialImage({ image, item }: { image: NonNullable<MemberPriceImage["official"]>; item: MemberPriceItem }) {
  const [what, relation] = officialLabel(image);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the projector's URL as served, never re-optimised
    <img
      src={image.url}
      alt={`${item.productName ?? item.sourceProductId}: ${what}; ${relation}`}
      width={56}
      height={78}
      loading="lazy"
      decoding="async"
      data-image-source="official"
      data-image-lang={image.imageLang}
      data-row-lang={image.rowLang ?? "unknown"}
      data-relationship={image.relationship}
      data-depicted-sku={image.depictedSku}
      data-scope={image.scope}
      className="h-[78px] w-14 shrink-0 rounded border border-border-subtle bg-surface-subtle object-contain"
    />
  );
}

/** A CardRush listing's own image at CardRush's URL: a plain img, never
 * next/image or a proxy, so Cambridge links it and never copies it. It sits
 * in a closed details element and loads lazily, so the member's browser asks
 * CardRush for it only when the member opens it (checked in Chromium: a lazy
 * image in a closed details element is not fetched). The request sends no
 * Referer, so CardRush is not told which member page asked. */
function ListingImage({ image, item }: { image: NonNullable<MemberPriceImage["listing"]>; item: MemberPriceItem }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-accent">Show CardRush&apos;s listing image (this listing)</summary>
      <p className="mt-1 text-ink-muted">Loads from CardRush, which then sees your IP address.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- linked at the source's own URL, never optimised or proxied */}
      <img
        src={image.url}
        alt={`${item.productName ?? item.sourceProductId}: CardRush listing image`}
        width={56}
        height={78}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        data-image-source="cardrush-listing"
        data-image-lang={image.lang ?? "unknown"}
        data-row-lang={image.lang ?? "unknown"}
        data-relationship={image.relationship}
        className="mt-2 h-[78px] w-14 rounded border border-border-subtle bg-surface-subtle object-contain"
      />
      <p className="mt-1"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Image: CardRush</a></p>
    </details>
  );
}

/** `images`: the rows' identity images (readMemberPriceImages); a row with none shows none. */
export function MemberPriceResults({ page, params, images }: { page: MemberPricePage; params: URLSearchParams; images?: MemberPriceImages }) {
  if (page.status === "unavailable") return (
    <div role="status" className="my-6 border-y border-border-subtle py-6">
      <h3 className="font-display text-lg italic text-ink">Member price source unavailable</h3>
      <p className="mt-2 text-sm text-ink-muted">The observation store could not be read. Setup or a migration may still be pending, or the source service may be unavailable. This is not an empty result or a zero price. Try again later.</p>
    </div>
  );
  if (page.status === "empty") return (
    <div role="status" className="my-6 border-y border-border-subtle py-6">
      <h3 className="font-display text-lg italic text-ink">No eligible observations match</h3>
      <p className="mt-2 text-sm text-ink-muted">The store was read, but there are no permitted observations for these filters. A source may not have been imported yet. Try a wider search; set and SKU filters exclude uncertain mappings.</p>
      {params.has("cursor") && <Link href={memberPriceHref(params)} prefetch={false} className="mt-3 inline-block text-sm text-accent underline underline-offset-4">Back to first page</Link>}
    </div>
  );
  return (
    <>
      <p className="mb-3 text-xs text-ink-muted">{page.count} observations on this page; {page.total} in this filtered snapshot. {page.complete ? "End of results." : page.nextCursor ? "More results follow." : "More results match than this view shows."}</p>
      <p className="mb-4 text-xs text-ink-muted">Snapshot opened: <ObservationTime value={page.asOf} />. This is a pagination boundary, not source freshness. Source and retrieval times appear on each row.</p>
      {images && page.items.length > images.rowsLookedUp && <p className="mb-4 text-xs text-ink-muted">Images are looked up for the first {images.rowsLookedUp} rows of a page.</p>}
      <div className="overflow-x-auto rounded-lg border border-border-subtle" role="region" aria-label="Source price observations" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Stored source price observations in native currency. Product-level aggregates are not exact-printing sales.</caption>
          <thead className="bg-surface-subtle text-xs text-ink-muted">
            <tr>{["Product", "Source & metric", "Native amount", "Specificity", "Observation times"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-medium">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {page.items.map((item) => {
              const image = images?.byItem.get(item.id);
              return (
                <tr key={item.id} className="align-top">
                  <th scope="row" className="min-w-64 px-4 py-4 font-normal">
                    <div className="flex gap-3">
                      {image?.official && <OfficialImage image={image.official} item={item} />}
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{item.productName ?? "Source product name unknown"}</p>
                        <p className="mt-1 text-xs text-ink-muted">{item.game}{item.setCode ? ` · ${item.setCode}` : ""}</p>
                        <p className="mt-1 break-all font-mono text-xs text-ink-muted">{item.sku ?? `Source ID: ${item.sourceProductId}`}</p>
                        {image?.official && <p className="mt-2 text-xs text-ink-muted">{officialLabel(image.official).join(" · ")}<span lang={image.official.imageLang === "ja" ? "ja" : undefined} className="block text-ink-faint">{image.official.attribution}</span></p>}
                        {image?.listing && <ListingImage image={image.listing} item={item} />}
                      </div>
                    </div>
                  </th>
                  <td className="min-w-48 px-4 py-4">
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">{SOURCE_NAMES[item.source]}</a>
                    <p className="mt-1 font-mono text-xs text-ink">{item.metric}</p>
                    <p className="mt-1 text-xs text-ink-muted">Market: {MARKET_NAMES[item.underlyingMarket]}</p>
                    <p className="mt-2 text-xs text-ink-muted">{item.attribution}</p>
                    <p className="mt-2 text-xs text-ink-muted">{item.permittedUses.includes("member-download") ? "Eligible for member export" : "View only · not in API or downloads"}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-mono text-ink">{formatNativeAmount(item.amount, item.currency)} {item.currency}</td>
                  <td className="min-w-56 px-4 py-4 text-xs text-ink-muted">
                    <p>{item.granularity === "source-product" ? "Source-product aggregate" : "Printing-level observation"}</p>
                    <p className="mt-1">Mapping: {item.mappingStatus === "exact" ? "exact catalog mapping" : item.mappingStatus === "ambiguous" ? "ambiguous · no exact card match" : "unmapped · source product only"}</p>
                    <p className="mt-1">Finish: {item.finish ?? "unknown"}</p>
                    <p>Language: {item.language ?? "unknown"}</p>
                    <p>Condition: {item.condition ?? "unknown · not condition-adjusted"}</p>
                  </td>
                  <td className="min-w-56 px-4 py-4 text-xs text-ink-muted">
                    <p>Stored snapshot · not a live quote</p>
                    <p className="mt-2">Source updated: <ObservationTime value={item.sourceUpdatedAt} /></p>
                    <p className="mt-2">Retrieved: <ObservationTime value={item.retrievedAt} /></p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-accent">Provenance details</summary>
                      <dl className="mt-2 space-y-1 break-all">
                        <div><dt>Parser</dt><dd className="font-mono">{item.parserVersion}</dd></div>
                        <div><dt>Crosswalk</dt><dd className="font-mono">{item.crosswalkVersion}</dd></div>
                        <div><dt>Source evidence</dt><dd className="font-mono">{item.evidenceVersion}</dd></div>
                        {item.catalogSourceUrl && <div><dt>Product catalog</dt><dd><a href={item.catalogSourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Catalog source</a></dd></div>}
                        {item.catalogUpdatedAt && <div><dt>Catalog updated</dt><dd><ObservationTime value={item.catalogUpdatedAt} /></dd></div>}
                      </dl>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Member price pages" className="mt-5 flex flex-wrap gap-5 text-sm">
        {params.has("cursor") && <Link href={memberPriceHref(params)} prefetch={false} className="text-accent underline underline-offset-4">Back to first page</Link>}
        {page.nextCursor && <Link href={memberPriceHref(params, page.nextCursor)} prefetch={false} className="text-accent underline underline-offset-4">Next page</Link>}
        {/* Only a view that includes display-only sources ends before its results do. */}
        {!page.complete && !page.nextCursor && <p role="note" className="text-ink-muted">{DISPLAY_ONLY_INPUT_PAGES_END}</p>}
      </nav>
    </>
  );
}

/** The reader leaves display-only derivation inputs out of history, of pages
 * over DISPLAY_ONLY_INPUT_PAGE_LIMIT rows and of searches not narrowed to a
 * name, a SKU or a set within a game. Say so for `sources`, the ones holding
 * rows to show; link the view that shows them when the search is narrowed.
 * Names come from the policy, never from the URL. */
export function MemberPriceDisplayOnlyNote({ params, sources, narrowed }: { params: URLSearchParams; sources: readonly MemberPriceSource[]; narrowed: boolean }) {
  const names = DISPLAY_ONLY_INPUTS.filter((source) => sources.includes(source)).map((name) => SOURCE_NAMES[name]).join(" and ");
  if (!names) return null;
  const next = new URLSearchParams(params);
  next.set("mode", "current");
  next.set("limit", String(DISPLAY_ONLY_INPUT_PAGE_LIMIT));
  return (
    <p role="note" className="my-4 max-w-3xl text-sm text-ink-muted">
      {names} prices are not in this view. They are for looking at, not collecting, so they appear only in the current view of a search narrowed by product name, SKU, or set and game, at most {DISPLAY_ONLY_INPUT_PAGE_LIMIT} rows a page and {DISPLAY_ONLY_INPUT_PAGES} pages.
      {narrowed && <>{" "}<Link href={memberPriceHref(next)} prefetch={false} className="text-accent underline underline-offset-4">Show this search at {DISPLAY_ONLY_INPUT_PAGE_LIMIT} rows a page</Link></>}
    </p>
  );
}

export function MemberPriceDownloads({ params }: { params: URLSearchParams }) {
  // Named from the policy, never echoed from the URL. An unknown source is
  // refused by the reader and the export alike.
  const source = params.get("source");
  const displayOnly = isSource(source) && !(MEMBER_PRICE_POLICIES[source].uses as readonly string[]).includes("member-download") ? SOURCE_NAMES[source] : null;
  return (
    <section aria-labelledby="member-downloads-heading" className="mt-8 border-t border-border-subtle pt-5">
      <h3 id="member-downloads-heading" className="font-display text-lg font-medium text-ink">Take permitted data with you</h3>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">Cardmarket official-file observations can be exported. Scryfall, CardRush and TCGplayer observations are for these views only and are excluded from every API and download. These are source-specific permissions, not a CC0 license for a mixed dataset.</p>
      {displayOnly ? <p className="mt-3 text-sm text-ink-muted">Downloads are unavailable for the {displayOnly}-only filter.</p> : (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a href={memberPriceExportHref(params, "csv")} className="text-accent underline underline-offset-4">Download CSV</a>
          <a href={memberPriceExportHref(params, "ndjson")} className="text-accent underline underline-offset-4">Download NDJSON</a>
        </div>
      )}
      <p className="mt-3 max-w-3xl text-xs text-ink-muted">Downloads start at the first page with these filters, without a display cursor. Requests are bounded; follow the export continuation information for remaining rows.</p>
      <Link href="/account/data" prefetch={false} className="mt-3 inline-block text-sm text-accent underline underline-offset-4">Data keys, API and complete-export instructions</Link>
    </section>
  );
}

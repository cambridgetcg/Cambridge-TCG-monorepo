import Link from "next/link";
import { Field, Input, Select } from "@/lib/ui/Input";
import type { MemberPricePage } from "@/lib/prices/member-feed-types";
import { memberPriceExportHref, memberPriceHref } from "./member-query";

const METRICS = ["avg", "low", "trend", "avg1", "avg7", "avg30", "avg-foil", "low-foil", "trend-foil", "avg1-foil", "avg7-foil", "avg30-foil", "usd", "usd_foil", "usd_etched", "eur", "eur_foil"];

// Display only: the reader and export retain the exact decimal string. Avoid
// Number coercion (precision loss) and the shared GBP-only price formatters.
function formatNativeAmount(amount: string): string {
  const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount);
  if (!parts) return "—";
  return `${parts[1]}.${(parts[2] ?? "").replace(/0+$/, "").padEnd(2, "0")}`;
}

export function MemberPriceFilters({ params }: { params: URLSearchParams }) {
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

export function MemberPriceResults({ page, params }: { page: MemberPricePage; params: URLSearchParams }) {
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
      <p className="mb-3 text-xs text-ink-muted">{page.count} observations on this page; {page.total} in this filtered snapshot. {page.complete ? "End of results." : "More results follow."}</p>
      <p className="mb-4 text-xs text-ink-muted">Snapshot opened: <ObservationTime value={page.asOf} />. This is a pagination boundary, not source freshness. Source and retrieval times appear on each row.</p>
      <div className="overflow-x-auto rounded-lg border border-border-subtle" role="region" aria-label="Source price observations" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Stored source price observations in native currency. Product-level aggregates are not exact-printing sales.</caption>
          <thead className="bg-surface-subtle text-xs text-ink-muted">
            <tr>{["Product", "Source & metric", "Native amount", "Specificity", "Observation times"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-medium">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {page.items.map((item) => (
              <tr key={item.id} className="align-top">
                <th scope="row" className="min-w-48 px-4 py-4 font-normal">
                  <p className="font-medium text-ink">{item.productName ?? "Source product name unknown"}</p>
                  <p className="mt-1 text-xs text-ink-muted">{item.game}{item.setCode ? ` · ${item.setCode}` : ""}</p>
                  <p className="mt-1 break-all font-mono text-xs text-ink-muted">{item.sku ?? `Source ID: ${item.sourceProductId}`}</p>
                </th>
                <td className="min-w-48 px-4 py-4">
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">{item.source === "cardmarket" ? "Cardmarket" : "Scryfall"}</a>
                  <p className="mt-1 font-mono text-xs text-ink">{item.metric}</p>
                  <p className="mt-1 text-xs text-ink-muted">Market: {item.underlyingMarket === "cardmarket" ? "Cardmarket" : "TCGplayer"}</p>
                  <p className="mt-2 text-xs text-ink-muted">{item.attribution}</p>
                  <p className="mt-2 text-xs text-ink-muted">{item.permittedUses.includes("member-download") ? "Eligible for member export" : "View only · not in API or downloads"}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-mono text-ink">{formatNativeAmount(item.amount)} {item.currency}</td>
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
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Member price pages" className="mt-5 flex flex-wrap gap-5 text-sm">
        {params.has("cursor") && <Link href={memberPriceHref(params)} prefetch={false} className="text-accent underline underline-offset-4">Back to first page</Link>}
        {page.nextCursor && <Link href={memberPriceHref(params, page.nextCursor)} prefetch={false} className="text-accent underline underline-offset-4">Next page</Link>}
      </nav>
    </>
  );
}

export function MemberPriceDownloads({ params }: { params: URLSearchParams }) {
  const displayOnly = params.get("source") === "scryfall";
  return (
    <section aria-labelledby="member-downloads-heading" className="mt-8 border-t border-border-subtle pt-5">
      <h3 id="member-downloads-heading" className="font-display text-lg font-medium text-ink">Take permitted data with you</h3>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">Cardmarket official-file observations can be exported. Scryfall observations are for these value-added views only and are excluded from every API and download. These are source-specific permissions, not a CC0 license for a mixed dataset.</p>
      {displayOnly ? <p className="mt-3 text-sm text-ink-muted">Downloads are unavailable for the Scryfall-only filter.</p> : (
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

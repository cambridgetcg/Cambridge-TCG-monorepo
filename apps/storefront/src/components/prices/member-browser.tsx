import Link from "next/link";
import { getSource } from "@cambridge-tcg/data-ingest";
import { scheduledCollection } from "@/lib/datafeed/collection-flags";
import { getMemberSessionActor } from "@/lib/prices/member-access";
import { displayOnlySourcesWithRows, MemberPriceQueryError, parseMemberPriceQuery, readMemberPrices } from "@/lib/prices/member-feed";
import { displayOnlyInputsNarrowed, displayOnlyInputsOffered, type MemberPriceQuery } from "@/lib/prices/member-feed-types";
import { memberPriceParams, type MemberPriceSearchParams } from "./member-query";
import { MemberPriceDisplayOnlyNote, MemberPriceDownloads, MemberPriceFilters, MemberPriceResults } from "./member-source-browser";

export async function MemberPriceBrowser({ search }: { search: MemberPriceSearchParams }) {
  const params = memberPriceParams(search);
  // Authentication is verified on the server before any private price read.
  // Public catalog callers cannot opt in through fetchPrices or a query flag.
  let actor;
  try {
    actor = await getMemberSessionActor();
  } catch {
    return (
      <section aria-labelledby="member-prices-heading" className="my-8 border-y border-border-subtle py-6">
        <h2 id="member-prices-heading" className="font-display text-xl font-medium text-ink">Member sign-in unavailable</h2>
        <p role="status" className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">We could not verify your account just now, so member prices have not been read. Please try again later. The public catalog below remains open without signing in.</p>
      </section>
    );
  }
  if (!actor) {
    const returnPath = `/prices${params.size ? `?${params}` : ""}`;
    return (
      <section aria-labelledby="member-prices-heading" className="my-8 border-y border-border-subtle py-6">
        <h2 id="member-prices-heading" className="font-display text-xl font-medium text-ink">Source prices &amp; history</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">Sign in with an existing account to view permitted source prices and stored history. Free to use.</p>
        <Link href={`/login?return=${encodeURIComponent(returnPath)}`} prefetch={false} className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-page">Sign in for free price access</Link>
        <p className="mt-3 text-sm text-ink-muted">Availability depends on imported data.</p>
        <details className="mt-3 text-sm leading-6 text-ink-muted">
          <summary className="cursor-pointer py-1 font-medium text-ink">Sources and downloads</summary>
          <p className="mt-2 max-w-3xl">Cardmarket official-file observations support member downloads; Scryfall is view-only, and its bulk activation is deferred. CardRush and TCGplayer page prices, once collected, are view-only too.</p>
          <p className="mt-2 max-w-3xl">{getSource("cardmarket")?.meta.description ?? "The Cardmarket registry entry is unavailable."}</p>
          <Link href="/methodology/member-pricing" className="mt-2 inline-block text-accent underline underline-offset-4">Source permissions and price meanings</Link>
        </details>
      </section>
    );
  }

  // Which display-only sources hold rows to show, asked beside the read; it never throws.
  const collected = displayOnlySourcesWithRows();
  let page;
  let query: MemberPriceQuery | undefined;
  try {
    query = parseMemberPriceQuery(params);
    page = await readMemberPrices(actor, query, "member-display");
  } catch (error) {
    if (!(error instanceof MemberPriceQueryError)) throw error;
  }
  const displayOnly = await collected;
  // The reader leaves CardRush and TCGplayer out of this view; say why, but
  // only for a source with rows to show, so no view implies prices that do not exist.
  const filter = query?.source;
  const leftOut = page && query && !displayOnlyInputsOffered(query) ? displayOnly.filter((source) => !filter || filter === source) : [];
  const narrowed = query ? displayOnlyInputsNarrowed(query) : false;
  const results = page ? <MemberPriceResults page={page} params={params} /> : (
    <div role="alert" className="my-5 border-y border-border-subtle py-5 text-sm text-ink-muted">
      <h3 className="font-medium text-ink">These price filters could not be used</h3>
      <p className="mt-2">Check the filters or return to the first page. A continuation cursor must match its original filters.</p>
      <Link href="/prices" prefetch={false} className="mt-2 inline-block text-accent underline underline-offset-4">Start a fresh search</Link>
    </div>
  );
  // Read at render, so the line changes with the collection flags.
  const scheduled = scheduledCollection();
  return (
    <section aria-labelledby="member-prices-heading" className="my-8 border-y border-border-subtle py-6">
      <h2 id="member-prices-heading" className="font-display text-xl font-medium text-ink">Member source browser</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">Free reference access. Current means latest stored observation, not a live quote. History contains only retained, permitted observations. Prices remain in their source currency; condition and printing differences matter. {scheduled ? `Cambridge collects ${scheduled}; imports from other sources are manual.` : "Cambridge has no scheduled refresh for these sources; imports are manual."} See <Link href="/api/v1/sources" className="text-accent underline underline-offset-4">/api/v1/sources</Link>.</p>
      <Link href="/methodology/member-pricing" className="mt-3 inline-block text-sm text-accent underline underline-offset-4">Source permissions and price meanings</Link>
      <MemberPriceFilters params={params} displayOnly={displayOnly} />
      {leftOut.length > 0 && <MemberPriceDisplayOnlyNote params={params} sources={leftOut} narrowed={narrowed} />}
      {results}
      <MemberPriceDownloads params={params} />
    </section>
  );
}

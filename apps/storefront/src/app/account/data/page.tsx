import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberSessionActor } from "@/lib/prices/member-access";
import { listMemberKeys } from "@/lib/datafeed/member-keys";
import { PageHeader, WhyLink, ErrorAlert } from "@/lib/ui";
import { MemberDataClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member data", robots: { index: false, follow: false } };

export default async function MemberDataPage() {
  const actor = await getMemberSessionActor();
  if (!actor) redirect("/login?return=%2Faccount%2Fdata");
  let keys;
  try { keys = await listMemberKeys(actor.userId); }
  catch { return <ErrorAlert description="Member key management is unavailable. No keys have been changed. Please try again later." />; }
  return <div className="space-y-6">
    <PageHeader title="Member data" description="Free price access for your scripts and spreadsheets. No subscription, paid tier, or agent identity needed." />
    <WhyLink href="/methodology/member-pricing" />
    <MemberDataClient initialKeys={keys} />
    <section className="space-y-3 text-sm text-ink-muted" aria-labelledby="feed-instructions">
      <h2 id="feed-instructions" className="font-display text-xl text-ink">Using the feed</h2>
      <p>Send your key only as <code>Authorization: Bearer &lt;key&gt;</code> to <code className="break-all">https://cambridgetcg.com/api/v1/member-prices</code>. Never put it in a URL, a public spreadsheet, or a shared repository. Agent and wholesale keys do not work here.</p>
      <p>Filters: <code>q</code> (up to 120 characters), <code>source</code>, <code>game</code>, <code>set</code>, <code>sku</code>, <code>metric</code>, <code>mode=current|history</code>, <code>limit</code> (up to 500), and <code>cursor</code>. JSON returns a page under <code>data</code>. Repeat with the same filters and <code>data.nextCursor</code> until <code>data.complete</code> is true.</p>
      <p>Each request returns one bounded page, not the whole archive. Snapshot timestamps are not source freshness; every observation carries its own source time, retrieval time, metric, native currency, attribution, and permission evidence. Data is not collectively licensed CC0.</p>
      <p>For session downloads, add the same filters to <code className="break-all">/api/account/prices/export?format=csv</code> or <code>format=ndjson</code>. CSV continuation is in <code>X-Next-Cursor</code> and completeness/counts in <code>X-Price-Complete</code>, <code>X-Price-Count</code>, <code>X-Price-Total</code>. NDJSON includes a manifest and footer; <code>pageComplete</code> means that page arrived, not the whole dataset.</p>
      <p className="flex flex-wrap gap-4">
        <a href="/api/account/prices/export?format=csv" className="text-accent underline">Download CSV page</a>
        <a href="/api/account/prices/export?format=ndjson" className="text-accent underline">Download NDJSON page</a>
        <Link href="/prices" prefetch={false} className="text-accent underline">Browse prices</Link>
      </p>
      <p>Only sources permitted for downloads appear in feeds. Display-only sources such as Scryfall stay out; blocked or uncollected sources are not unlocked by signing in.</p>
    </section>
  </div>;
}

import type { Metadata } from "next";
import Link from "next/link";

/**
 * Temporary fail-closed public boundary.
 *
 * The former server page loaded a SELECT * auction, raw bid rows, trust
 * profiles and settlement fields, then spread that object into a client
 * component. A partial redaction is not a safe public contract. Keep the
 * interactive detail page closed until public and participant projections
 * are separate strict allowlists.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Auction detail temporarily unavailable — Cambridge TCG",
  description:
    "Auction detail is paused while separate public and participant-safe views are completed.",
  robots: { index: false, follow: false },
};

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-page px-4 py-16 text-ink">
      <section className="mx-auto max-w-2xl rounded-xl border border-border-subtle bg-surface p-8">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Auction {id.slice(0, 8)}</p>
        <h1 className="mt-2 text-2xl font-semibold">Auction detail is temporarily paused</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          We are separating the public listing from bidder, seller, winner,
          payment and fulfilment records. No auction or participant data is
          loaded by this page while that boundary is being completed.
        </p>
        <Link
          href="/auctions"
          className="mt-6 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page"
        >
          Back to the public auction directory
        </Link>
      </section>
    </main>
  );
}

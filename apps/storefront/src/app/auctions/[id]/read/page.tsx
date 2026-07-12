import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Auction read mirror temporarily unavailable — Cambridge TCG",
  description:
    "The public read mirror is paused while its aggregate-only projection is completed.",
  robots: { index: false, follow: false },
};

export default async function AuctionReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-page px-4 py-16 text-ink">
      <section className="mx-auto max-w-2xl rounded-xl border border-border-subtle bg-surface p-8">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Auction {id.slice(0, 8)}</p>
        <h1 className="mt-2 text-2xl font-semibold">Public auction mirror paused</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          This mirror currently returns no auction, bidder, winner, seller,
          trust, payment or fulfilment data. It will reopen with aggregate-only
          bids and a strict public auction allowlist.
        </p>
        <Link href="/auctions" className="mt-6 inline-flex text-sm font-semibold text-accent">
          Return to auctions →
        </Link>
      </section>
    </main>
  );
}

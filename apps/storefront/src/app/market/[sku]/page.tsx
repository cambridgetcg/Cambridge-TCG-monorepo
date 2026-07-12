import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Card market detail paused — Cambridge TCG",
  description: "Interactive card detail is paused while catalog and auction publication boundaries are rebuilt.",
  robots: { index: false, follow: false },
};

export default async function CardPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-ink">
      <p className="font-mono text-xs text-ink-faint">{sku} · caller supplied</p>
      <h1 className="mt-2 text-3xl font-semibold">Card market detail is paused</h1>
      <p className="mt-4 text-ink-muted">
        This page loads no catalog identity, reference price, live-auction
        strip, image, seller data, or order book while strict public and
        participant projections are completed.
      </p>
      <Link href="/market" className="mt-6 inline-flex text-accent">Back to the market →</Link>
    </main>
  );
}

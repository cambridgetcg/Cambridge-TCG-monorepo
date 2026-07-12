import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Card reference paused — Cambridge TCG",
  description: "Card reference lookup is paused pending affirmative catalog membership lineage.",
  robots: { index: false, follow: false },
};

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-ink">
      <p className="font-mono text-xs text-ink-faint">{sku} · caller supplied</p>
      <h1 className="mt-2 text-3xl font-semibold">Card reference is paused</h1>
      <p className="mt-4 text-ink-muted">
        No catalog existence, imported identity, image, price, market
        enrichment, or auction data is loaded by this page.
      </p>
      <Link href="/market" className="mt-6 inline-flex text-accent">Back to the market →</Link>
    </main>
  );
}

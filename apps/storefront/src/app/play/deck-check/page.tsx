import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Deck check paused — Cambridge TCG",
  description:
    "Deck validation is paused until card-category metadata has affirmative public lineage.",
  robots: { index: false, follow: false },
};

export default function DeckCheckPage() {
  return (
    <main className="min-h-screen bg-page px-4 py-16 text-ink">
      <section className="mx-auto max-w-2xl rounded-xl border border-border-subtle bg-surface p-8">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Play · deck check</p>
        <h1 className="mt-2 text-2xl font-semibold">Deck validation is paused</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          The former validator inferred card categories from a mixed catalog
          field without affirmative public lineage. The page and API now return
          no category classification or legality result while that dependency
          is replaced with an approved source or caller-supplied schema.
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          The endpoint currently returns HTTP 503 with a machine-readable
          rights gap: <code>/api/v1/play/deck/validate</code>.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/play/spec" className="text-accent">Play module status →</Link>
          <Link href="/play" className="text-accent">Back to play →</Link>
        </div>
      </section>
    </main>
  );
}

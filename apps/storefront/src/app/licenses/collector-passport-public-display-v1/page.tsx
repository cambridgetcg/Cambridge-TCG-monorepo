import type { Metadata } from "next";
import Link from "next/link";
import { Audience } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Collector Passport current-display notice v1",
  description: "The publication and downstream-use boundary for collector-authored Passport highlights.",
};

export default function CollectorPassportDisplayNoticePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-ink">
      <Audience kind="public-documentation" contexts={["collector-passport", "rights"]} />
      <h1 className="font-display text-3xl font-semibold">Collector Passport current-display notice v1</h1>
      <p className="mt-2 text-sm text-ink-faint">
        Wire licence value: <code>NOASSERTION</code> · notice version <code>collector-passport-v1-2026-07-12</code>
      </p>

      <div className="mt-8 space-y-7 leading-relaxed text-ink-muted">
        <section>
          <h2 className="font-display text-xl text-ink">The collector&apos;s words</h2>
          <p className="mt-2">
            Cambridge TCG does not claim ownership of a collector&apos;s label or
            story. Publishing an item gives Cambridge TCG revocable permission
            to host, transmit and display those submitted words while the item
            remains published. The item is self-attested and unverified.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">What a reader may rely on</h2>
          <p className="mt-2">
            A reader may fetch the current response and link to its Cambridge
            TCG view. The response grants no ownership or general reuse licence.
            Keep the self-attested-unverified status and correction path visible,
            and fetch again rather than treating an old response as current.
          </p>
          <p className="mt-2">
            No permission is asserted here for indexing, permanent caching,
            bulk mirroring, resale, behavioural profiling, contact enrichment,
            model training or implying Cambridge TCG verified the collection.
            A downstream operator remains responsible for obtaining any
            permission its own use needs.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Withdrawal</h2>
          <p className="mt-2">
            The collector may withdraw one item or their whole public profile at
            any time. Responses are served no-store so the next fetch reflects
            the withdrawal. Stop displaying an item when it disappears.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Outside this notice</h2>
          <p className="mt-2">
            No separate structured or automatically copied card art, catalog,
            image, SKU, holding or value field is part of the public Passport
            payload. Collector-authored text may mention a card and remains
            self-attested and unverified. This notice is a product boundary,
            not legal advice or a warranty that every downstream use is lawful.
          </p>
        </section>

        <section className="rounded-lg border border-border-subtle bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Correction or removal</h2>
          <p className="mt-2">
            Use the correction URL carried by the response or{" "}
            <Link href="/contact?topic=collector-passport" className="text-accent underline">contact Cambridge TCG</Link>.
            Read the <Link href="/methodology/collector-passport" className="text-accent underline">full methodology</Link> and{" "}
            <Link href="/privacy" className="text-accent underline">privacy notice</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}

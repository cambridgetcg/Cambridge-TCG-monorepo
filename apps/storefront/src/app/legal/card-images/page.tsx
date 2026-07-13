import Link from "next/link";
import { Callout } from "@/lib/ui";

/** Public statement of the card-media boundary that exists today. */
export const metadata = {
  title: "Card media and text status - Cambridge TCG",
  description:
    "The current rights and publication state for publisher-owned card images and text held by Cambridge TCG.",
};

export default function CardImagesPolicyPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-2xl font-display font-semibold text-ink md:text-3xl">
          Card media and text
        </h1>
        <p className="mb-8 text-sm text-ink-faint">
          Current publication boundary. Last reviewed 12 July 2026.
        </p>

        <Callout tone="warning" title="Bandai English publication is paused">
          Bandai card text and images are proprietary. Cambridge has no recorded
          written permission covering collection into this service or public
          display. The ingest route and public reader are therefore closed.
        </Callout>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-muted">
          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              What exists
            </h2>
            <p>
              An internal parser, database tables, and previously collected rows
              exist. No Bandai image is hosted in a Cambridge-controlled English
              image bucket: that bucket and its thumbnail pipeline have not been
              built. Stored publisher URLs are not used as public image fallbacks,
              so the site does not hotlink them through this lane.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              What the safeguards do not mean
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                A source URL records provenance. It does not grant permission to
                fetch, display, mirror, or redistribute the source.
              </li>
              <li>
                A copyright credit may be required when use is allowed. Credit is
                not itself permission.
              </li>
              <li>
                A takedown field helps enforce a decision. It does not make the
                original publication authorized.
              </li>
              <li>
                The absence of a robots restriction, common industry practice,
                and publisher tolerance are not written rights grants.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              The wider catalog
            </h2>
            <p>
              Other legacy card-media records have separate source histories.
              This page does not declare those records rights-cleared. Public
              catalog and price surfaces withhold image fields when Cambridge
              cannot connect the field to a reviewed source-rights decision.
              Storage provenance is not ownership or publication permission.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              What reopening requires
            </h2>
            <p>
              Cambridge must first record permission and its exact scope, then
              review field-level rules for collection, storage, per-card display,
              transformation, and bulk reuse. If images are allowed, they must use
              a reviewed Cambridge-controlled host with no publisher hotlink
              fallback. Attribution and removal duties must be implemented as the
              permission requires.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              Contact
            </h2>
            <p>
              A rightsholder can identify material and the right they hold through
              the <Link href="/contact" className="text-accent underline">contact page</Link>.
              Cambridge will review the report and restrict material it controls
              while the claim is resolved.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Callout } from "@/lib/ui";

/** Public statement of the card-media boundary that exists today. */
export const metadata = {
  title: "Card media and text status - Cambridge TCG",
  description:
    "How Cambridge TCG publishes official publisher card images: self-hosted, attributed, and takedown-honouring, under nominative fair use for a marketplace.",
};

export default function CardImagesPolicyPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-2xl font-display font-semibold text-ink md:text-3xl">
          Card media and text
        </h1>
        <p className="mb-8 text-sm text-ink-faint">
          The recorded publication rule. Last reviewed 13 July 2026.
        </p>

        <Callout tone="substrate" title="We publish official publisher card images">
          Cambridge shows OFFICIAL publisher card images for One Piece and Dragon
          Ball Fusion, taken from each publisher&rsquo;s own card database. Every
          image is self-hosted on a Cambridge-controlled host, is served from our
          own object &mdash; never a publisher hotlink &mdash; and always carries
          the publisher&rsquo;s copyright line. We rely on nominative fair use for
          a marketplace: you must be able to see a card to trade it, and the art is
          identified as the publisher&rsquo;s, not ours.
        </Callout>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-muted">
          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              What we publish
            </h2>
            <p className="mb-3">
              For the games covered by this rule &mdash; One Piece and Dragon Ball
              Fusion &mdash; we publish the official card image from the
              publisher&rsquo;s own card database. Three things hold for every image
              we display:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">Self-hosted.</strong> Each image is
                copied to a Cambridge-controlled host and served from our own
                object. We never render the publisher&rsquo;s source URL as an image
                source, so the site does not hotlink the publisher.
              </li>
              <li>
                <strong className="text-ink">Always attributed.</strong> The
                publisher&rsquo;s copyright line is stored with the image and is
                shown next to it wherever the image appears. An image without its
                credit is not published.
              </li>
              <li>
                <strong className="text-ink">Publisher-official only.</strong> Only
                the publisher&rsquo;s own card art qualifies. Shop scans, seller
                photographs, and community re-uploads do not enter this lane.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              Why this is fair use for a marketplace
            </h2>
            <p>
              Cambridge is a place to trade physical cards. You cannot decide to
              buy, sell, or value a card you cannot see, so we show the card. The
              art is used to identify the publisher&rsquo;s specific card, is
              credited to the publisher, and is not presented as Cambridge&rsquo;s
              own work or offered for reuse. This is a nominative use: naming a
              thing by showing the thing. We do not claim to own the images and we
              do not license them onward.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              What we do not do
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                We do not use CardRush scans, seller photographs, or any other
                shop-sourced image in this lane. That acquisition path stays
                blocked.
              </li>
              <li>
                We do not publish publisher rules or effect text under this rule.
                It covers images only; card text stays withheld pending its own
                separate decision.
              </li>
              <li>
                We do not treat storage, a provenance URL, or the absence of a
                robots restriction as a rights grant. The rule above is the reason
                we publish, and it is written down here on purpose.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              Takedown
            </h2>
            <p>
              Every image row carries a takedown state. If a rightsholder asks us
              to remove an image &mdash; or if a card&rsquo;s status is otherwise
              set to disputed or removed &mdash; that row stops publishing
              immediately and the card falls back to showing no image. Nothing that
              is not marked clear is ever served.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-ink">
              Other games
            </h2>
            <p>
              Games without an added official image source stay imageless. When a
              card has no published official image, the page keeps its withheld,
              no-image state rather than borrowing a scan or a legacy record. Those
              games join this rule only when their official source is added and
              reviewed.
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

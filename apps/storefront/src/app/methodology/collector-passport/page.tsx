import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Collector Passport methodology",
  description: "How Cambridge TCG keeps a private portfolio separate from revocable collector-authored highlights.",
  other: audienceMetadata("public-documentation", ["methodology", "privacy", "collecting"]),
};

export default function CollectorPassportMethodologyPage() {
  return (
    <>
      <h1>Collector Passport</h1>
      <p>
        Collector Passport is a private-first set of collection highlights in
        the collector&apos;s own words. It is not proof of ownership, a catalog,
        a valuation, an offer to sell, or a public copy of the portfolio.
      </p>

      <h2>Why it is separate</h2>
      <p>
        A private portfolio row can carry condition, quantity, cost, date,
        notes, valuation inputs and catalog-derived display metadata. Those
        fields have different privacy and source-rights histories. Choosing a
        public profile does not publish that row.
      </p>
      <p>
        A Passport item instead contains a separate label and optional story
        typed by the collector. Existing showcase rows were kept as private
        drafts; nothing was copied from card names, sets, images or SKUs.
      </p>

      <h2>What publication requires</h2>
      <ol>
        <li>The signed-in collector owns the linked portfolio row.</li>
        <li>Their profile is currently public.</li>
        <li>They write the public label and optional story.</li>
        <li>They accept the exact current publication notice.</li>
        <li>They stay within twelve current published items.</li>
      </ol>
      <p>
        Withdrawal is immediate and unrestricted. Making a profile private
        withdraws every Passport item; making it public again does not silently
        republish anything. A fresh later publication receives a fresh public id.
      </p>

      <h2>What leaves the database</h2>
      <p>
        Username, random public item id, collector-authored label and story,
        display order, first publication time, current text/order update time, an explicit self-attested-unverified
        status, and correction/reuse notices.
      </p>
      <p>
        No separate structured or automatically copied SKU, catalog, holding,
        image, acquisition, private-note, value, P&amp;L, internal-id or social
        graph field leaves through this route. A collector may mention a card
        in their own label or story; those words remain self-attested and
        unverified. The route makes no proof-of-ownership claim.
      </p>

      <h2>No directory and no implied licence</h2>
      <p>
        Passport is exact-handle only. There is no collector directory, search
        or bulk dump. Private, suspended, unknown and fully withdrawn profiles
        are indistinguishable at the API boundary.
      </p>
      <p>
        Responses are no-store and carry <code>NOASSERTION</code>. CORS permits
        a browser to fetch a current response; it does not grant permission to
        mirror, index, train on, profile or resell a collector&apos;s words. Read
        the <Link href="/licenses/collector-passport-public-display-v1">current-display notice</Link>.
      </p>

      <h2>Text first</h2>
      <p>
        The first release publishes no image. Catalog images do not have the
        field-level lineage needed for this purpose. Owner photos belong in the
        separate private media vault and remain private in this release.
      </p>

      <h2>Private portability</h2>
      <p>
        The signed-in owner can export a private JSON archive with SKU,
        condition, quantity, acquisition price/date, private notes and their
        collector-authored Passport text. The archive labels field lineage and
        excludes catalog-resolved names, sets, rarity, images and valuation.
        It is an account archive, not a public catalog dataset.
      </p>

      <h2>Receipt retention</h2>
      <p>
        The private receipt stores no label, story, card, image, cost or value.
        Its actor account id is removed after 180 days or account deletion; the
        remaining pseudonymised publication fact is deleted after two years.
      </p>
    </>
  );
}

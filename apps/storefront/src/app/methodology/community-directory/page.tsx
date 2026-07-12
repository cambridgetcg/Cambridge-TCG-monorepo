import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Community directory methodology",
  other: audienceMetadata("public-documentation", ["methodology", "community", "privacy"]),
};

export default function CommunityDirectoryMethodologyPage() {
  return (
    <>
      <h1>Community directory</h1>
      <p>
        Cambridge TCG publishes organisations before people. The first directory
        covers shops, clubs, guilds, labs and tournament collectives whose
        steward separately published the web profile, accepted the current
        directory notice, and attested authority to represent the organisation.
      </p>

      <h2>What leaves the database</h2>
      <p>
        A strict allowlist only: name, kind, coarse region, games, languages,
        description, submitted website, generic public contact page,
        accessibility notes, listing/edit timestamps, self-attested-unverified
        status, correction link and per-record rights. There is no member count.
        These are not independently verified. Every record carries a
        listing-specific correction link through{" "}
        <Link href="/contact?topic=directory">/contact</Link>.
      </p>

      <h2>What stays out</h2>
      <ul>
        <li>No searchable people directory, member count, roster or social graph.</li>
        <li>No steward identity or dedicated personal-contact, home-address or private-location field.</li>
        <li>No dedicated attendance, live-location, portfolio, wishlist or acquisition-cost field.</li>
        <li>No inferred relationship between two people or organisations.</li>
      </ul>
      <p>
        Submitted free text is screened for obvious contact patterns, but it is
        not independently verified and cannot be treated as a guarantee. Every
        record remains visibly unverified and reportable through its correction link.
      </p>
      <p>
        The receipt log keeps its action, organisation slug, notice version and
        time as an audit fact. Its private actor account id is deliberately
        mutable: maintenance removes that id after 180 days, or account deletion
        removes it earlier. The actor id is never a public directory field.
      </p>
      <p>
        Abuse controls allow an account to create three organisations per day,
        steward ten in total, and publish five listings per day. Short-lived
        counters store only a window-specific HMAC of the internal account id.
        Withdrawal is never rate-limited.
      </p>

      <h2>Visibility is not a licence</h2>
      <p>
        A steward choosing public display does not dedicate the organisation&apos;s
        facts to the public domain. Directory responses therefore use a
        public-display-only licence reference, not a CC0 grant. The platform&apos;s
        safe response default is NOASSERTION. V1 records are served no-store for current-request display;
        permanent indexing, mirrors, resale, profiling and training use are not
        granted. Read the exact{" "}
        <Link href="/licenses/community-directory-public-display-v1">display terms</Link>.
      </p>

      <h2>Privacy reset</h2>
      <p>
        Profiles, feed entries, unsolicited messages and collective-member
        visibility now default private. Reviews also stay private unless the
        reviewer chooses to publish that review. Historic defaults were
        unpublished because the old schema did not record an affirmative
        publication act. People can choose again from a current notice.
      </p>
      <p>
        A public profile can show chosen profile fields, showcase cards,
        explicitly-public activity, public reviews and narrow trust aggregates.
        It does not expose internal user or trade identifiers, collection size,
        wishlist, exact trade value, or follower/following lists. Following
        lists stay inside their owner's account.
      </p>
      <p>
        Trade matching is paused until explicit card-level trade intents exist.
        A portfolio is private inventory, not an offer; a wishlist is private
        planning, not permission to scan a person into a matching graph.
      </p>

      <h2>Coverage order</h2>
      <ol>
        <li>Public organisations — live.</li>
        <li>Established non-residential public venues — planned.</li>
        <li>Public events with provenance, JSON-LD and iCalendar — planned.</li>
        <li>Export-first Collection Passport — planned.</li>
        <li>People and trade intents — withheld until the safety controls exist.</li>
      </ol>

      <p>
        Read the <Link href="/community/directory">human directory</Link> or the{" "}
        <Link href="/api/v1/directory/coverage">machine-readable coverage map</Link>. Builders
        can validate records against the{" "}
        <Link href="/schemas/v1/community-organisation.json">raw JSON Schema</Link>.
      </p>
    </>
  );
}

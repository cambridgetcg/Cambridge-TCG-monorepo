import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Community directory methodology",
  description:
    "The publication, privacy, ordering, rights and query-boundary contract for the organisation directory.",
  other: audienceMetadata("public-documentation", [
    "methodology",
    "community",
    "directory",
  ]),
};

export default function CommunityDirectoryMethodology() {
  return (
    <>
      <h1>Community directory</h1>
      <p>
        The <Link href="/community/directory">organisation directory</Link>{" "}
        lists collectives whose steward made a separate, versioned directory
        publication choice. Making a profile visible at <code>/c/…</code> is not
        enough. The directory is a projection of an organisation&rsquo;s
        declared facts, not a social graph, membership index or recommendation
        system.
      </p>

      <blockquote>
        <strong>
          The versioned directory checkbox is the current receipt this surface
          has.
        </strong>{" "}
        Existing public profiles were not opted in retroactively. The checkbox
        names searchable HTML, public JSON, the exact steward-written fields,
        platform-record timestamps, and the risk of third-party copies. It does
        not select platform-derived member or steward fields, or grant rights
        over the steward&rsquo;s words beyond showing them. Stewards must not
        put personal data about another person in directory fields.
      </blockquote>

      <h2>Two kinds of field</h2>
      <p>The API separates values by authorship:</p>
      <ul>
        <li>
          <strong>Steward-written fields:</strong> slug, display name, kind,
          region, languages, description and house rules. Their rights are
          <code>NOASSERTION</code>; copyright remains with the applicable
          rightsholder. That label does not reduce Cambridge TCG&rsquo;s
          responsibility for its processing or permit a steward to publish
          another person&rsquo;s data.
        </li>
        <li>
          <strong>Platform record fields:</strong> the collective row&rsquo;s
          creation and update timestamps and its public URL. The timestamps
          describe the platform record lifecycle. They are not evidence of when
          publication began and are not attributed to the steward.
        </li>
      </ul>

      <h2>What the query cannot read</h2>
      <p>
        <code>listPublicCollectives</code> selects no collective record id, no
        <code>steward_user_id</code>, no publication flag, and no member row.
        Its return type cannot hydrate the private <code>Collective</code>
        model. A private collective is absent rather than represented by a
        redacted row, so this surface cannot confirm it exists. This is a
        structural claim: descriptions and house rules are steward-authored free
        text and could still contain personal data despite the structural
        exclusion. The notice therefore prohibits stewards from including
        personal data about another person and provides a correction/removal
        contact.
      </p>

      <h2>What is deliberately absent</h2>
      <ul>
        <li>
          <strong>No roster or member count.</strong> A small-group count can
          reveal people even without names, and members have no
          directory-publication receipt.
        </li>
        <li>
          <strong>No dedicated identity field or people index.</strong> The
          query selects no platform-derived steward/member identity and does not
          search account records. It does search steward-authored names and
          description text, so Cambridge TCG treats reports of personal data in
          those fields as correction/removal requests rather than shifting
          responsibility to a steward.
        </li>
        <li>
          <strong>No ranking or inference.</strong> Rows are ordered by display
          name and slug for stability. No size, trust, volume, similarity or
          affinity score is computed.
        </li>
        <li>
          <strong>No facet counts.</strong> Facets name filter values present
          among public rows but do not publish a histogram of the set.
        </li>
      </ul>

      <h2>Public reach, indexing and copies</h2>
      <p>
        The directory is available as public HTML and a cross-origin public JSON
        API. Anyone can view it. Search engines, AI crawlers and other third
        parties may index, copy or redistribute the slug, display name, kind,
        region, languages, description, house rules and platform-record times.
        Names and descriptions are searchable; kind, region and language are
        filters. Withdrawing a listing stops Cambridge TCG&rsquo;s future
        directory responses but cannot recall a copy already fetched by a third
        party.
      </p>
      <p>
        To correct or remove a listing, the steward can turn it off in account
        management. Anyone can also email{" "}
        <a href="mailto:support@cambridgetcg.com">support@cambridgetcg.com</a>,
        including where a field contains personal data about them.
      </p>

      <h2>Search and pagination bounds</h2>
      <p>
        The JSON endpoint returns <code>400 INVALID_INPUT</code> for an unknown
        kind, malformed or out-of-range limit/offset, or text beyond the
        documented maximum. It does not silently turn invalid explicit input
        into a different query, and repeated values are rejected as ambiguous.
        NUL and other Unicode general-category <code>Cc</code> characters are
        rejected before any database read. The HTML page is forgiving:
        unsupported or repeated URL filters are ignored with a visible notice,
        and a page beyond the end returns to the last available page (page one
        for an empty directory).
      </p>
      <ul>
        <li>Search text: 120 characters.</li>
        <li>Region: 80 characters; language: 35 characters.</li>
        <li>Limit: 1–100; offset: 0–2,400.</li>
        <li>
          HTML pagination exposes at most 101 pages (2,424 alphabetically
          ordered rows); requests above that window visibly land on page 101.
        </li>
        <li>
          Public profile fields are server-bounded: region 120 characters, up to
          12 languages of 35 characters each, description 2,000 characters, and
          house rules 4,000 characters. Each facet vocabulary is capped at 100
          values.
        </li>
        <li>
          <code>%</code>, <code>_</code> and backslash are escaped before an
          <code>ILIKE</code>, so &ldquo;substring&rdquo; means literal substring
          rather than caller-supplied SQL wildcard syntax.
        </li>
      </ul>

      <h2>Withdrawal and caching</h2>
      <p>
        Turning off the directory choice removes the collective from future HTML
        and JSON reads; making the profile private also clears the current
        directory receipt. A later listing needs a fresh choice. Withdrawal
        cannot recall a copy fetched earlier. Responses containing
        participant-authored entries are <code>no-store</code>. An empty result
        may use the directory&rsquo;s ten-minute freshness class only when the
        consistent total is also zero and the caller supplied no free text.
        Count and page rows come from one materialized database statement, so a
        concurrent listing or withdrawal cannot split their snapshot.
      </p>

      <h2>Where the contract lives</h2>
      <ul>
        <li>
          Query and bounds:{" "}
          <code>apps/storefront/src/lib/collectives/db.ts</code>
        </li>
        <li>
          Base substrate:{" "}
          <code>apps/storefront/drizzle/0097_collectives.sql</code>; directory
          receipt:{" "}
          <code>
            apps/storefront/drizzle/0131_collective_directory_publication.sql
          </code>
        </li>
        <li>
          HTML: <Link href="/community/directory">/community/directory</Link>
        </li>
        <li>
          JSON:{" "}
          <Link href="/api/v1/directory/organisations">
            /api/v1/directory/organisations
          </Link>
        </li>
        <li>
          Related: <Link href="/methodology/collectives">collectives</Link> and{" "}
          <Link href="/methodology/bridges">bridges</Link>
        </li>
      </ul>

      <h2>Change history</h2>
      <p>
        <em>v2 — 2026-08-24.</em> The publication notice now expressly names
        public HTML and JSON, search and filters, indexing, AI crawlers,
        third-party copying, the limit of withdrawal, Cambridge TCG&rsquo;s
        correction/removal contact, and a categorical rule against entering
        another person&rsquo;s data. Earlier v1 receipts are not current and do
        not list a collective.
      </p>
      <p>
        <em>v1 — 2026-08-24.</em> Initial organisation-directory contract:
        separate versioned opt-in with no legacy backfill; steward/platform
        fields separated; no ids, membership, steward identity, ranking or
        inference; bounded literal search.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Organisation-directory privacy and publication contract authored 2026-08-24"
        doctrines={[
          "substrate-honesty",
          "transparency",
          "meaning",
          "inclusion",
        ]}
        audience="public-documentation"
        recursion={[
          { label: "/community/directory", href: "/community/directory" },
          {
            label: "/api/v1/directory/organisations",
            href: "/api/v1/directory/organisations",
          },
          { label: "/methodology/bridges", href: "/methodology/bridges" },
        ]}
      />
    </>
  );
}

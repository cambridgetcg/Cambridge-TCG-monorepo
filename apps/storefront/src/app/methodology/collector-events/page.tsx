import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_ORGANISATIONS,
  COLLECTOR_VENUES,
} from "@/lib/collector-events/registry";

export const metadata: Metadata = {
  title: "UK collector events commons",
  description:
    "How Cambridge TCG admits, verifies, versions, maps, and publishes a bounded source-backed seed of UK collector events.",
  other: audienceMetadata("public-documentation", ["methodology", "events", "open-data"]),
};

export default function CollectorEventsMethodology() {
  return (
    <>
      <h1>UK collector events commons</h1>
      <p>
        <em>
          A useful event record should tell you what is known, who said it,
          what remains uncertain, and what rights still need assessment.
        </em>
      </p>
      <p>
        The first release is deliberately bounded: {COLLECTOR_EVENTS.length} reviewed
        events, {COLLECTOR_VENUES.length} public venues, and {COLLECTOR_ORGANISATIONS.length}
        public organisations or brands. It is an England-only demonstrator, not a claim to be a
        complete UK directory. The live coverage statement is at{" "}
        <Link href="/api/v1/collector-events/coverage">
          <code>/api/v1/collector-events/coverage</code>
        </Link>
        .
      </p>

      <h2>What earns a record</h2>
      <p>An event enters this seed only when all of these are true:</p>
      <ol>
        <li>An official organisation or event page states the event.</li>
        <li>Only a small set of bare facts is needed: title, date, public venue, and source-stated organisation roles.</li>
        <li>The source&apos;s publication boundary has been reviewed and recorded, with the exact rights evidence linked when one was found.</li>
        <li>Every trust-bearing field points to one or more evidence-source ids.</li>
        <li>The record avoids personal people, direct personal contacts, copied descriptions, images, attendee lists, and vendor lists.</li>
      </ol>
      <p>
        Publicly visible does not automatically mean openly reusable. Sources without an
        open-data grant are limited to minimal facts, and the mixed dataset says{" "}
        <code>NOASSERTION</code>. Cambridge&apos;s record shapes, identifiers, schemas, and
        original methodology are separately available under CC0.
      </p>

      <h2>Three different questions about time</h2>
      <ul>
        <li>
          <code>status</code> is a cautious normalization. A currently advertised future
          event with no cancellation signal maps to scheduled; tentative, postponed, and
          cancelled require an affirmative source statement; otherwise it is unknown.
        </li>
        <li>
          <code>time_relation</code> is computed at response time: upcoming, in progress,
          past, or unscheduled.
        </li>
        <li>
          <code>integrity_state</code> says whether the admitted source facts agree with
          one another. A conflict does not silently become a cancellation.
        </li>
      </ul>
      <p>
        Date-only events stay date-only. The API does not invent midnight or choose
        between two conflicting advertised time ranges. Ends are exclusive, matching
        iCalendar&apos;s <code>DTEND</code> rule.
      </p>

      <h2>Evidence and corrections</h2>
      <p>
        Event, venue, and organisation records have stable opaque ids. Source ids are
        stable human-readable evidence labels, not opaque identifiers. Every record has a revision, observation timestamps, a review
        due date, field-level source pointers, quality flags, and any observed conflicts.
        The evidence ledger is public at{" "}
        <Link href="/api/v1/collector-events/sources">
          <code>/api/v1/collector-events/sources</code>
        </Link>
        . A disappearing source page never proves cancellation; that requires an
        affirmative source statement. Corrections create a new record revision and
        increase the iCalendar sequence when calendar meaning changes.
      </p>
      <p>
        Source and record timestamps in this first release share one review-batch time:
        they mean the sources were checked together, not that separate network requests
        completed in the same second. Reviews are due weekly. Responses that derive{" "}
        <code>time_relation</code> use a five-minute cache so event boundaries do not stay
        stale for a day.
      </p>

      <h2>Accessibility and contact boundaries</h2>
      <p>
        Accessibility facts are tri-state. <code>true</code> and <code>false</code> need
        explicit source support; <code>null</code> means the reviewed source did not say.
        Null never means inaccessible. Contacts are organisation-level HTTPS contact
        pages only. The commons does not publish personal emails, mobile numbers, staff
        profiles, officer records, inferred ties, communication-style analysis, or
        behavioural profiles.
      </p>

      <h2>Formats for builders</h2>
      <ul>
        <li>
          <Link href="/api/v1/collector-events">JSON events</Link>, plus separate{" "}
          <Link href="/api/v1/collector-venues">venues</Link> and{" "}
          <Link href="/api/v1/collector-organisations">organisations</Link>.
        </li>
        <li>
          <Link href="/api/v1/collector-events/calendar.ics">iCalendar</Link>. Conflicting
          records are omitted by default; consumers may explicitly request them. Cancelled
          records keep their stable UID, last known schedule, and increased sequence so
          subscribers can receive a cancellation. This feed is a curated projection;
          absence from it never proves cancellation. JSON is the lifecycle authority.
        </li>
        <li>
          <Link href="/api/v1/collector-events/map.geojson">GeoJSON</Link>. Points are
          postcode centroids in longitude-latitude order, never presented as venue
          entrances, with the Postcodes.io-published Ordnance Survey, Royal Mail,
          National Statistics, and NRS attribution retained.
        </li>
        <li>
          <Link href="/api/v1/collector-events/schema">JSON Schemas</Link> for event,
          venue, organisation, and evidence records. Each canonical <code>$id</code>{" "}
          also dereferences under <code>/schemas/collector-events/v1/</code>.
        </li>
      </ul>

      <h2>Known limits</h2>
      <ul>
        <li>No current admitted future records in Scotland, Wales, or Northern Ireland.</li>
        <li>No event source in this review offered a general open-data licence.</li>
        <li>The broader UK Card Shows tickets index is link-only until written permission or an open-data grant supports expansion.</li>
        <li>One official event page contradicts itself; that record stays visibly conflicted.</li>
        <li>Postcode points support regional maps, not door-level navigation.</li>
        <li>Schedules change. Always follow the official link before travel or payment.</li>
      </ul>
      <p>
        These limits are part of the product contract, not a footnote. Coverage comes
        before depth, but breadth grows through independent official sources or permission,
        never by reproducing a substantial listings database. A wider wrong dataset is not
        more useful than a smaller honest one.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's invitation to deepen a curated API service, 2026-07-13"
        doctrines={["substrate-honesty", "transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/api/v1/collector-events", href: "/api/v1/collector-events" },
          { label: "/api/v1/collector-events/coverage", href: "/api/v1/collector-events/coverage" },
          { label: "/api/v1/collector-events/schema", href: "/api/v1/collector-events/schema" },
          { label: "/datasets", href: "/datasets" },
        ]}
      />
    </>
  );
}

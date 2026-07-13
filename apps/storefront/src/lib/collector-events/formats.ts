import {
  COLLECTOR_EVENT_ATTRIBUTIONS,
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENT_BY_ID,
  COLLECTOR_VENUE_BY_ID,
} from "./registry";
import {
  evidenceForEvent,
  evidenceForIds,
  evidenceForVenue,
  eventTimeRelation,
} from "./query";
import type { CollectorEvent, CollectorEventView, CollectorVenue } from "./types";

const SITE = "https://cambridgetcg.com";

function stripControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[\r\n]+/g, " ");
}

function escapeIcs(value: string): string {
  return stripControls(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 content lines are folded at 75 octets, not 75 characters. */
export function foldIcsLine(line: string): string {
  const clean = stripControls(line);
  const chunks: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of clean) {
    const candidate = current + character;
    if (Buffer.byteLength(candidate, "utf8") > limit && current) {
      chunks.push(current);
      current = character;
      limit = 74; // continuation lines begin with one folding space
    } else {
      current = candidate;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

function utcStamp(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function addressLine(venue: CollectorVenue): string {
  return [
    venue.address.street,
    venue.address.locality,
    venue.address.postcode,
    venue.address.nation,
  ].filter(Boolean).join(", ");
}

function statusForIcs(
  event: CollectorEvent,
): "CONFIRMED" | "TENTATIVE" | "CANCELLED" | null {
  if (event.status === "cancelled") return "CANCELLED";
  if (event.status === "scheduled") return "CONFIRMED";
  if (event.status === "tentative" || event.status === "postponed") {
    return "TENTATIVE";
  }
  return null;
}

function eventLines(event: CollectorEvent): string[] {
  if (!event.schedule) return [];
  const venue = event.venue_id ? COLLECTOR_VENUE_BY_ID.get(event.venue_id) : null;
  const sourceUrl = event.public_links[0]?.url;
  const standardStatus = statusForIcs(event);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@events.cambridgetcg.com`,
    `DTSTAMP:${utcStamp(event.last_successful_check_at)}`,
    `LAST-MODIFIED:${utcStamp(event.updated_at)}`,
    `SEQUENCE:${event.calendar_sequence}`,
    `X-CTCG-STATUS:${event.status}`,
    `SUMMARY:${escapeIcs(event.name)}`,
  ];
  if (standardStatus) lines.splice(6, 0, `STATUS:${standardStatus}`);
  if (event.schedule.precision === "date") {
    lines.push(`DTSTART;VALUE=DATE:${event.schedule.start.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${event.schedule.end.replace(/-/g, "")}`);
  } else {
    lines.push(`DTSTART:${utcStamp(event.schedule.start)}`);
    lines.push(`DTEND:${utcStamp(event.schedule.end)}`);
  }
  if (venue) lines.push(`LOCATION:${escapeIcs(addressLine(venue))}`);
  if (sourceUrl) lines.push(`URL:${sourceUrl}`);
  lines.push(
    `DESCRIPTION:${escapeIcs(`Verify before travel at ${sourceUrl ?? `${SITE}/api/v1/collector-events/${event.id}`}.`)}`,
    `X-CTCG-INTEGRITY:${event.integrity_state}`,
    "END:VEVENT",
  );
  return lines;
}

export function buildCollectorEventsCalendar(events: readonly CollectorEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cambridge TCG//UK Collector Events Commons//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:UK collector events — reviewed demonstrator",
    "X-WR-TIMEZONE:Europe/London",
    "X-CTCG-LICENSE:NOASSERTION",
    "X-CTCG-COVERAGE:Four-event incomplete England-only demonstrator",
    "X-CTCG-CALENDAR-AUTHORITY:Projection-not-lifecycle-authority",
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildCollectorEventsGeoJson(
  events: readonly CollectorEventView[],
): Record<string, unknown> {
  const features = events.flatMap((event) => {
    const venue = event.venue_id ? COLLECTOR_VENUE_BY_ID.get(event.venue_id) : null;
    if (!venue?.geometry) return [];
    const evidence = evidenceForIds([
      ...evidenceForEvent(event).map((source) => source.id),
      ...evidenceForVenue(venue).map((source) => source.id),
    ]);
    return [{
      type: "Feature",
      id: event.id,
      geometry: {
        type: "Point",
        coordinates: [...venue.geometry.coordinates],
      },
      properties: {
        event_id: event.id,
        name: event.name,
        status: event.status,
        time_relation: event.time_relation,
        integrity_state: event.integrity_state,
        schedule: event.schedule,
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
        },
        coordinate_precision: venue.geometry.precision,
        postcode_status: venue.geometry.postcode_status,
        coordinate_warning: venue.geometry.warning,
        detail_url: `${SITE}/api/v1/collector-events/${event.id}`,
        evidence_urls: evidence.map((source) => source.url),
      },
    }];
  });

  return {
    type: "FeatureCollection",
    name: "UK collector events — reviewed demonstrator",
    license: "NOASSERTION",
    comprehensive: false,
    coordinate_reference_system: "WGS84 (RFC 7946 longitude, latitude order)",
    coordinate_precision: "postcode-centroid",
    coordinate_warning: "Points are approximate postcode centroids, not venue entrances.",
    attribution: COLLECTOR_EVENT_ATTRIBUTIONS,
    as_of: COLLECTOR_EVENTS_AS_OF,
    generated_at: new Date().toISOString(),
    input_event_count: events.length,
    feature_count: features.length,
    unlocated_count: events.length - features.length,
    features,
  };
}

/** Convenience for consumers that start from a stable event id. */
export function buildSingleEventGeoJson(id: string): Record<string, unknown> | null {
  const event = COLLECTOR_EVENT_BY_ID.get(id as `evt_${string}`);
  if (!event) return null;
  return buildCollectorEventsGeoJson([{ ...event, time_relation: eventTimeRelation(event) }]);
}

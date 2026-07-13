import { describe, expect, it } from "vitest";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_EVENT_GAPS,
  COLLECTOR_EVENT_SOURCE_BY_ID,
  COLLECTOR_EVENT_SOURCES,
  COLLECTOR_ORGANISATION_BY_ID,
  COLLECTOR_ORGANISATIONS,
  COLLECTOR_VENUE_BY_ID,
  COLLECTOR_VENUES,
} from "./registry";
import {
  eventTimeRelation,
  eventOverlapsDateWindow,
  filterCollectorEvents,
  parseCollectorEventFilters,
} from "./query";
import type { CollectorEvent } from "./types";

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

describe("collector-events registry", () => {
  it("uses unique stable ids and keeps every relation resolvable", () => {
    expectUnique(COLLECTOR_EVENTS.map((event) => event.id));
    expectUnique(COLLECTOR_VENUES.map((venue) => venue.id));
    expectUnique(COLLECTOR_ORGANISATIONS.map((organisation) => organisation.id));
    expectUnique(COLLECTOR_EVENT_SOURCES.map((source) => source.id));

    for (const event of COLLECTOR_EVENTS) {
      expect(event.id).toMatch(/^evt_[a-z0-9]+$/);
      if (event.status === "cancelled") {
        expect(event.schedule).not.toBeNull();
        expect(event.calendar_sequence).toBeGreaterThan(0);
      }
      if (event.venue_id) expect(COLLECTOR_VENUE_BY_ID.has(event.venue_id)).toBe(true);
      for (const relation of event.organisation_relations) {
        expect(COLLECTOR_ORGANISATION_BY_ID.has(relation.organisation_id)).toBe(true);
        for (const sourceId of relation.source_ids) {
          expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
        }
      }
      for (const sourceIds of Object.values(event.field_sources)) {
        for (const sourceId of sourceIds) {
          expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
        }
      }
      for (const link of event.public_links) {
        expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(link.source_id)).toBe(true);
      }
      for (const conflict of event.conflicts) {
        for (const sourceId of conflict.source_ids) {
          expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
        }
      }
      for (const [fact, value] of Object.entries(event.accessibility)) {
        if (value !== null) {
          expect(
            event.field_sources[`/accessibility/${fact}`] ??
              event.field_sources["/accessibility"],
          ).toBeDefined();
        }
      }
    }
    for (const venue of COLLECTOR_VENUES) {
      for (const sourceIds of Object.values(venue.field_sources)) {
        for (const sourceId of sourceIds) {
          expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
        }
      }
    }
    for (const organisation of COLLECTOR_ORGANISATIONS) {
      for (const sourceIds of Object.values(organisation.field_sources)) {
        for (const sourceId of sourceIds) {
          expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
        }
      }
    }
  });

  it("keeps provenance URLs public and rights reviews explicit", () => {
    for (const source of COLLECTOR_EVENT_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.rights_review.copied_descriptive_prose_or_media).toBe(false);
      expect(source.rights_review.note.length).toBeGreaterThan(20);
      for (const sourceId of source.rights_review.rights_evidence_source_ids) {
        expect(COLLECTOR_EVENT_SOURCE_BY_ID.has(sourceId)).toBe(true);
      }
      if (source.rights_review.publication_mode === "open-geodata") {
        expect(source.rights_review.upstream_license).toBe("OS OpenData Licence");
      }
    }
  });

  it("does not carry personal-profile or direct-contact fields", () => {
    const serialized = JSON.stringify({
      events: COLLECTOR_EVENTS,
      venues: COLLECTOR_VENUES,
      organisations: COLLECTOR_ORGANISATIONS,
    }).toLowerCase();
    for (const forbiddenField of [
      '"email"',
      '"phone"',
      '"telephone"',
      '"mobile"',
      '"contact_name"',
      '"person_name"',
      '"person"',
      '"officer"',
      '"employee"',
      '"attendee"',
      '"vendor_list"',
      '"communication_style"',
    ]) {
      expect(serialized).not.toContain(forbiddenField);
    }
    expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(serialized).not.toMatch(
      /(?:\+44\s?7\d{3}|07\d{3}|(?:\+44\s?|0)(?:1|2)\d{2,4})[\s().-]?\d{3,4}[\s.-]?\d{3,4}/,
    );
  });

  it("marks source conflicts without converting them into status claims", () => {
    const conflicted = COLLECTOR_EVENTS.filter(
      (event) => event.integrity_state === "conflicting",
    );
    expect(conflicted).toHaveLength(1);
    for (const event of conflicted) {
      expect(event.conflicts.length).toBeGreaterThan(0);
      expect(event.status).toBe("scheduled");
    }
    for (const event of COLLECTOR_EVENTS.filter(
      (candidate) => candidate.integrity_state === "consistent",
    )) {
      expect(event.conflicts).toHaveLength(0);
    }
  });

  it("preserves date precision and valid exclusive end bounds", () => {
    for (const event of COLLECTOR_EVENTS) {
      expect(event.schedule).not.toBeNull();
      const schedule = event.schedule!;
      if (schedule.precision === "date") {
        expect(schedule.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(schedule.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else {
        expect(Number.isNaN(new Date(schedule.start).getTime())).toBe(false);
        expect(Number.isNaN(new Date(schedule.end!).getTime())).toBe(false);
      }
      if (schedule.precision === "date") {
        expect(schedule.end > schedule.start).toBe(true);
      } else {
        expect(new Date(schedule.end).getTime()).toBeGreaterThan(
          new Date(schedule.start).getTime(),
        );
      }
      expect(schedule.end_is_exclusive).toBe(true);
    }
  });

  it("stays a small demonstrator rather than reproducing a publisher index", () => {
    expect(COLLECTOR_EVENTS).toHaveLength(4);
    const ukCardShowsEvents = COLLECTOR_EVENTS.filter((event) =>
      event.public_links.some((link) => link.url.includes("ukcardshows.co.uk")),
    );
    expect(ukCardShowsEvents).toHaveLength(2);
  });

  it("labels every map point as an approximate longitude-latitude postcode centroid", () => {
    for (const venue of COLLECTOR_VENUES) {
      expect(venue.geometry).not.toBeNull();
      const [longitude, latitude] = venue.geometry!.coordinates;
      expect(longitude).toBeGreaterThanOrEqual(-180);
      expect(longitude).toBeLessThanOrEqual(180);
      expect(latitude).toBeGreaterThanOrEqual(-90);
      expect(latitude).toBeLessThanOrEqual(90);
      expect(venue.geometry!.precision).toBe("postcode-centroid");
      expect(["current", "terminated"]).toContain(venue.geometry!.postcode_status);
      expect(venue.geometry!.warning).toContain("not a venue entrance");
    }
  });

  it("derives time relation separately from status", () => {
    const event = COLLECTOR_EVENTS[0];
    expect(eventTimeRelation(event, new Date("2026-07-13T12:00:00Z"))).toBe("upcoming");
    expect(eventTimeRelation(event, new Date("2026-08-01T12:00:00Z"))).toBe("in_progress");
    expect(eventTimeRelation(event, new Date("2026-08-02T12:00:00Z"))).toBe("past");
    expect(event.status).toBe("scheduled");
  });

  it("treats exclusive midnight as outside the following date and excludes unscheduled records from date windows", () => {
    const event = COLLECTOR_EVENTS[0];
    const endingAtMidnight = {
      ...event,
      schedule: {
        ...event.schedule!,
        start: "2026-08-01T20:00:00+01:00",
        end: "2026-08-02T00:00:00+01:00",
      },
    };
    expect(eventOverlapsDateWindow(endingAtMidnight, "2026-08-02", "2026-08-02")).toBe(
      false,
    );
    const unscheduled: CollectorEvent = {
      ...event,
      status: "unknown",
      schedule: null,
    };
    expect(eventOverlapsDateWindow(unscheduled, "2026-08-01", null)).toBe(false);
  });

  it("rejects ambiguous filters and makes the nationwide gap visible", () => {
    expect(
      parseCollectorEventFilters(
        new URL("https://example.test/api/v1/collector-events?from=2026-02-30"),
      ).ok,
    ).toBe(false);
    expect(
      parseCollectorEventFilters(
        new URL("https://example.test/api/v1/collector-events?surprise=true"),
      ).ok,
    ).toBe(false);
    const parsed = parseCollectorEventFilters(
      new URL("https://example.test/api/v1/collector-events?nation=Scotland"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(filterCollectorEvents(parsed.filters)).toHaveLength(0);
    expect(COLLECTOR_EVENT_GAPS.join(" ")).toContain("Scotland");

    const afterKentEnds = parseCollectorEventFilters(
      new URL("https://example.test/api/v1/collector-events?from=2026-10-05&to=2026-10-05"),
    );
    expect(afterKentEnds.ok).toBe(true);
    if (afterKentEnds.ok) expect(filterCollectorEvents(afterKentEnds.filters)).toHaveLength(0);
  });
});

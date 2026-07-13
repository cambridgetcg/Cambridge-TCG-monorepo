import { describe, expect, it } from "vitest";
import { COLLECTOR_EVENTS } from "./registry";
import {
  buildCollectorEventsCalendar,
  buildCollectorEventsGeoJson,
  foldIcsLine,
} from "./formats";
import { projectCollectorEvent } from "./query";
import type { CollectorEvent } from "./types";

describe("collector-event interchange formats", () => {
  it("emits injection-safe RFC 5545 lines without personal contact properties", () => {
    const events = COLLECTOR_EVENTS.filter(
      (event) => event.integrity_state === "consistent",
    );
    const calendar = buildCollectorEventsCalendar(events);
    expect(calendar.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(events.length);
    expect(calendar).not.toMatch(/\r?\n(?:ATTENDEE|CONTACT|ORGANIZER|MAILTO):/i);
    expect(calendar).toContain("X-CTCG-LICENSE:NOASSERTION");
    for (const line of calendar.split("\r\n").filter(Boolean)) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("folds multibyte content by octets", () => {
    const folded = foldIcsLine(`SUMMARY:${"界".repeat(40)}`);
    for (const line of folded.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("keeps stable UIDs and emits explicit cancellation updates", () => {
    const original = COLLECTOR_EVENTS[0];
    const cancelled: CollectorEvent = {
      ...original,
      status: "cancelled" as const,
      calendar_sequence: 1,
      schedule: original.schedule!,
    };
    const calendar = buildCollectorEventsCalendar([cancelled]);
    expect(calendar).toContain(`UID:${original.id}@events.cambridgetcg.com`);
    expect(calendar).toContain("SEQUENCE:1");
    expect(calendar).toContain("STATUS:CANCELLED");
    expect(calendar).toContain("X-CTCG-STATUS:cancelled");
  });

  it("preserves an unknown native status without asserting tentative", () => {
    const unknown = { ...COLLECTOR_EVENTS[0], status: "unknown" as const };
    const calendar = buildCollectorEventsCalendar([unknown]);
    expect(calendar).toContain("X-CTCG-STATUS:unknown");
    expect(calendar).not.toContain("STATUS:TENTATIVE");
  });

  it("emits RFC 7946 longitude-latitude points with approximation warnings", () => {
    const events = COLLECTOR_EVENTS.map((event) =>
      projectCollectorEvent(event, new Date("2026-07-13T12:00:00Z")),
    );
    const collection = buildCollectorEventsGeoJson(events) as {
      type: string;
      comprehensive: boolean;
      coordinate_warning: string;
      attribution: string[];
      input_event_count: number;
      feature_count: number;
      unlocated_count: number;
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: { coordinate_precision: string; evidence_urls: string[] };
      }>;
    };
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.comprehensive).toBe(false);
    expect(collection.coordinate_warning).toContain("not venue entrances");
    expect(collection.attribution.join(" ")).toContain("Crown copyright");
    expect(collection.attribution.join(" ")).toContain("Royal Mail");
    expect(collection.attribution.join(" ")).toContain("NRS");
    expect(collection.input_event_count).toBe(events.length);
    expect(collection.feature_count).toBe(events.length);
    expect(collection.unlocated_count).toBe(0);
    expect(collection.features).toHaveLength(events.length);
    for (const feature of collection.features) {
      const [longitude, latitude] = feature.geometry.coordinates;
      expect(Math.abs(longitude)).toBeLessThan(Math.abs(latitude));
      expect(feature.properties.coordinate_precision).toBe("postcode-centroid");
      expect(feature.properties.evidence_urls.length).toBeGreaterThan(0);
    }
  });
});

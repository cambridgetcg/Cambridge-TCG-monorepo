import { describe, expect, it } from "vitest";
import { COLLECTOR_EVENTS } from "@/lib/collector-events/registry";
import type { CollectorEvent } from "@/lib/collector-events/types";
import { GET, selectCalendarEvents } from "./route";

describe("GET /api/v1/collector-events/calendar.ics", () => {
  it("serves standards-native NOASSERTION calendar bytes and omits conflicts by default", async () => {
    const response = GET(
      new Request("https://example.test/api/v1/collector-events/calendar.ics"),
    );
    const calendar = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("x-content-license")).toBe("NOASSERTION");
    expect(response.headers.get("x-ctcg-conflicting-records-omitted")).toBe("1");
    expect(response.headers.get("x-ctcg-unscheduled-records-omitted")).toBe("0");
    expect(response.headers.get("x-ctcg-calendar-authority")).toBe(
      "projection-not-lifecycle-authority",
    );
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(calendar).not.toContain("Card Con IV 2026");
  });

  it("requires explicit conflict opt-in and rejects unknown switches", async () => {
    const optedIn = GET(
      new Request(
        "https://example.test/api/v1/collector-events/calendar.ics?include_conflicts=true",
      ),
    );
    expect((await optedIn.text()).match(/BEGIN:VEVENT/g)).toHaveLength(4);

    const invalid = GET(
      new Request("https://example.test/api/v1/collector-events/calendar.ics?surprise=true"),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_INPUT");

    const repeated = GET(
      new Request(
        "https://example.test/api/v1/collector-events/calendar.ics?include_conflicts=true&include_conflicts=false",
      ),
    );
    expect(repeated.status).toBe(400);
  });

  it("never filters a cancellation tombstone out because it is conflicting", () => {
    const cancelled: CollectorEvent = {
      ...COLLECTOR_EVENTS[0],
      status: "cancelled" as const,
      integrity_state: "conflicting" as const,
      calendar_sequence: 1,
      schedule: COLLECTOR_EVENTS[0].schedule!,
    };
    expect(selectCalendarEvents([cancelled], false)).toEqual([cancelled]);
  });

  it("fails loudly if a malformed cancellation loses its lifecycle schedule", () => {
    const malformed = {
      ...COLLECTOR_EVENTS[0],
      status: "cancelled",
      schedule: null,
    } as unknown as CollectorEvent;
    expect(() => selectCalendarEvents([malformed], false)).toThrow(
      "lost its lifecycle schedule",
    );
  });
});

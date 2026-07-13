import { errorResponse } from "@/lib/data-pantry";
import { COLLECTOR_EVENTS } from "@/lib/collector-events/registry";
import { buildCollectorEventsCalendar } from "@/lib/collector-events/formats";
import type { CollectorEvent } from "@/lib/collector-events/types";

const ENDPOINT = "/api/v1/collector-events/calendar.ics";

export function selectCalendarEvents(
  events: readonly CollectorEvent[],
  includeConflictingRecords: boolean,
): CollectorEvent[] {
  for (const event of events) {
    if (event.status === "cancelled" && !event.schedule) {
      throw new Error(
        `Cancelled event ${event.id} lost its lifecycle schedule.`,
      );
    }
  }
  return events.filter(
    (event) =>
      event.schedule &&
      (event.status === "cancelled" ||
        includeConflictingRecords ||
        event.integrity_state === "consistent"),
  );
}

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const unknown = [...url.searchParams.keys()].filter(
    (key) => key !== "include_conflicts",
  );
  const includeConflictValues = url.searchParams.getAll("include_conflicts");
  const includeConflicts = includeConflictValues[0] ?? null;
  if (
    unknown.length > 0 ||
    includeConflictValues.length > 1 ||
    (includeConflicts !== null && includeConflicts !== "true" && includeConflicts !== "false")
  ) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "The only calendar option is include_conflicts=true|false.",
      endpoint: ENDPOINT,
      docs: "/methodology/collector-events",
    });
  }

  const includeConflictingRecords = includeConflicts === "true";
  const events = selectCalendarEvents(
    COLLECTOR_EVENTS,
    includeConflictingRecords,
  );
  const omitted = includeConflictingRecords
    ? 0
    : COLLECTOR_EVENTS.filter(
        (event) =>
          event.schedule &&
          event.status !== "cancelled" &&
          event.integrity_state === "conflicting",
      ).length;
  const unscheduledOmitted = COLLECTOR_EVENTS.filter(
    (event) => !event.schedule,
  ).length;

  return new Response(buildCollectorEventsCalendar(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=uk-collector-events.ics",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "Content-Disposition, X-Content-License, X-CTCG-Comprehensive, X-CTCG-Calendar-Authority, X-CTCG-Conflicting-Records-Omitted, X-CTCG-Unscheduled-Records-Omitted, Link",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-License": "NOASSERTION",
      "X-CTCG-Comprehensive": "false",
      "X-CTCG-Calendar-Authority": "projection-not-lifecycle-authority",
      "X-CTCG-Conflicting-Records-Omitted": String(omitted),
      "X-CTCG-Unscheduled-Records-Omitted": String(unscheduledOmitted),
      Link: '</methodology/collector-events>; rel="describedby", </api/v1/collector-events>; rel="alternate"; type="application/json"',
    },
  });
}

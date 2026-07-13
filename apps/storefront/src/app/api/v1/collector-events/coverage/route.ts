import { jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENT_EXCLUSIONS,
  COLLECTOR_EVENT_GAPS,
  COLLECTOR_EVENT_SOURCES,
  COLLECTOR_ORGANISATIONS,
  COLLECTOR_VENUES,
} from "@/lib/collector-events/registry";

export function GET(): Response {
  const byIntegrity = Object.fromEntries(
    ["consistent", "conflicting"].map((state) => [
      state,
      COLLECTOR_EVENTS.filter((event) => event.integrity_state === state).length,
    ]),
  );
  const byNation = Object.fromEntries(
    ["England", "Scotland", "Wales", "Northern Ireland"].map((nation) => [
      nation,
      COLLECTOR_EVENTS.filter((event) => {
        const venue = COLLECTOR_VENUES.find((candidate) => candidate.id === event.venue_id);
        return venue?.address.nation === nation;
      }).length,
    ]),
  );
  const knownAccessibility = COLLECTOR_EVENTS.filter((event) =>
    Object.values(event.accessibility).some((value) => value !== null),
  ).length;

  return jsonResponse({
    endpoint: "/api/v1/collector-events/coverage",
    sources: COLLECTOR_EVENT_SOURCES.map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "Counts describe this four-event demonstrator only; they are not estimates of the full UK event population.",
      "Excluded leads are named to explain the boundary, not to reproduce their event data.",
    ],
    data: {
      "@kind": "collector-event-coverage",
      comprehensive: false,
      admission_policy: "official organisation source + minimal public facts + reviewed reuse boundary",
      counts: {
        events: COLLECTOR_EVENTS.length,
        venues: COLLECTOR_VENUES.length,
        organisations: COLLECTOR_ORGANISATIONS.length,
        evidence_sources: COLLECTOR_EVENT_SOURCES.length,
        events_by_integrity: byIntegrity,
        events_by_nation: byNation,
        events_with_any_source_stated_accessibility_fact: knownAccessibility,
      },
      gaps: COLLECTOR_EVENT_GAPS,
      excluded_leads: COLLECTOR_EVENT_EXCLUSIONS,
      next_coverage_priorities: [
        "Admit independently sourced, source-compatible future events in each missing UK nation.",
        "Obtain written permission or an open-data grant before expanding from a publisher's broader listings index.",
        "Recheck conflicting official pages and publish corrections as new revisions.",
        "Add accessibility facts only when a venue or organiser states them explicitly.",
        "Add organisation-level public contact pages without importing personal details.",
      ],
      methodology: "/methodology/collector-events",
    },
  });
}

import {
  COLLECTOR_EVENT_BY_ID,
  COLLECTOR_EVENT_SOURCE_BY_ID,
  COLLECTOR_EVENTS,
  COLLECTOR_ORGANISATION_BY_ID,
  COLLECTOR_VENUE_BY_ID,
} from "./registry";
import type {
  CollectorEvent,
  CollectorEventStatus,
  CollectorEventView,
  CollectorOrganisation,
  CollectorVenue,
  EvidenceSource,
  EventTimeRelation,
  IntegrityState,
} from "./types";

export interface CollectorEventFilters {
  from: string | null;
  to: string | null;
  venue_id: string | null;
  organisation_id: string | null;
  nation: "England" | "Scotland" | "Wales" | "Northern Ireland" | null;
  status: CollectorEventStatus | null;
  integrity: IntegrityState | null;
  time_relation: EventTimeRelation | null;
}

export type FilterParseResult =
  | { ok: true; filters: CollectorEventFilters }
  | { ok: false; message: string };

const STATUS_VALUES = new Set<CollectorEventStatus>([
  "scheduled",
  "tentative",
  "postponed",
  "cancelled",
  "unknown",
]);
const INTEGRITY_VALUES = new Set<IntegrityState>(["consistent", "conflicting"]);
const TIME_RELATION_VALUES = new Set<EventTimeRelation>([
  "upcoming",
  "in_progress",
  "past",
  "unscheduled",
]);
const NATION_VALUES = new Set<NonNullable<CollectorEventFilters["nation"]>>([
  "England",
  "Scotland",
  "Wales",
  "Northern Ireland",
]);
const ALLOWED_FILTERS = new Set([
  "from",
  "to",
  "venue_id",
  "organisation_id",
  "nation",
  "status",
  "integrity",
  "time_relation",
]);

function oneValue(url: URL, key: string): string | null | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) return undefined;
  const value = values[0]?.trim();
  return value ? value : null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function parseCollectorEventFilters(url: URL): FilterParseResult {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_FILTERS.has(key)) {
      return { ok: false, message: `Unknown filter '${key}'.` };
    }
  }

  const from = oneValue(url, "from");
  const to = oneValue(url, "to");
  const venueId = oneValue(url, "venue_id");
  const organisationId = oneValue(url, "organisation_id");
  const nation = oneValue(url, "nation");
  const status = oneValue(url, "status");
  const integrity = oneValue(url, "integrity");
  const timeRelation = oneValue(url, "time_relation");

  if ([from, to, venueId, organisationId, nation, status, integrity, timeRelation].includes(undefined)) {
    return { ok: false, message: "Each filter may be supplied at most once." };
  }
  if (from && !isIsoDate(from)) {
    return { ok: false, message: "'from' must be a real calendar date in YYYY-MM-DD form." };
  }
  if (to && !isIsoDate(to)) {
    return { ok: false, message: "'to' must be a real calendar date in YYYY-MM-DD form." };
  }
  if (from && to && from > to) {
    return { ok: false, message: "'from' must be on or before 'to'." };
  }
  if (venueId && !COLLECTOR_VENUE_BY_ID.has(venueId as `ven_${string}`)) {
    return { ok: false, message: "Unknown venue_id." };
  }
  if (
    organisationId &&
    !COLLECTOR_ORGANISATION_BY_ID.has(organisationId as `org_${string}`)
  ) {
    return { ok: false, message: "Unknown organisation_id." };
  }
  if (nation && !NATION_VALUES.has(nation as NonNullable<CollectorEventFilters["nation"]>)) {
    return { ok: false, message: "Unknown nation." };
  }
  if (status && !STATUS_VALUES.has(status as CollectorEventStatus)) {
    return { ok: false, message: "Unknown event status." };
  }
  if (integrity && !INTEGRITY_VALUES.has(integrity as IntegrityState)) {
    return { ok: false, message: "Unknown integrity state." };
  }
  if (timeRelation && !TIME_RELATION_VALUES.has(timeRelation as EventTimeRelation)) {
    return { ok: false, message: "Unknown time_relation." };
  }

  return {
    ok: true,
    filters: {
      from: from ?? null,
      to: to ?? null,
      venue_id: venueId ?? null,
      organisation_id: organisationId ?? null,
      nation: (nation as CollectorEventFilters["nation"]) ?? null,
      status: (status as CollectorEventStatus | null) ?? null,
      integrity: (integrity as IntegrityState | null) ?? null,
      time_relation: (timeRelation as EventTimeRelation | null) ?? null,
    },
  };
}

function dateInLondon(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function eventTimeRelation(
  event: CollectorEvent,
  now = new Date(),
): EventTimeRelation {
  if (!event.schedule) return "unscheduled";
  const { schedule } = event;
  if (schedule.precision === "date") {
    const today = dateInLondon(now);
    if (today < schedule.start) return "upcoming";
    if (today >= schedule.end) return "past";
    return "in_progress";
  }

  const nowTime = now.getTime();
  const start = new Date(schedule.start).getTime();
  const end = new Date(schedule.end).getTime();
  if (nowTime < start) return "upcoming";
  if (nowTime >= end) return "past";
  return "in_progress";
}

export function projectCollectorEvent(
  event: CollectorEvent,
  now = new Date(),
): CollectorEventView {
  return { ...event, time_relation: eventTimeRelation(event, now) };
}

function eventDateBounds(event: CollectorEvent): { start: string; end: string } | null {
  if (!event.schedule) return null;
  if (event.schedule.precision === "date") {
    const end = new Date(`${event.schedule.end}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    return {
      start: event.schedule.start,
      end: end.toISOString().slice(0, 10),
    };
  }

  const exclusiveEnd = new Date(event.schedule.end).getTime();
  return {
    start: dateInLondon(new Date(event.schedule.start)),
    end: dateInLondon(new Date(exclusiveEnd - 1)),
  };
}

export function eventOverlapsDateWindow(
  event: CollectorEvent,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  const bounds = eventDateBounds(event);
  if (!bounds) return false;
  if (from && bounds.end < from) return false;
  if (to && bounds.start > to) return false;
  return true;
}

export function filterCollectorEvents(
  filters: CollectorEventFilters,
  now = new Date(),
): CollectorEventView[] {
  return COLLECTOR_EVENTS.map((event) => projectCollectorEvent(event, now))
    .filter((event) => {
      if (!eventOverlapsDateWindow(event, filters.from, filters.to)) return false;
      if (filters.venue_id && event.venue_id !== filters.venue_id) return false;
      if (
        filters.organisation_id &&
        !event.organisation_relations.some(
          (relation) => relation.organisation_id === filters.organisation_id,
        )
      ) return false;
      if (filters.nation) {
        const venue = event.venue_id ? COLLECTOR_VENUE_BY_ID.get(event.venue_id) : null;
        if (venue?.address.nation !== filters.nation) return false;
      }
      if (filters.status && event.status !== filters.status) return false;
      if (filters.integrity && event.integrity_state !== filters.integrity) return false;
      if (filters.time_relation && event.time_relation !== filters.time_relation) return false;
      return true;
    })
    .sort((a, b) => {
      const aStart = a.schedule?.start ?? "9999";
      const bStart = b.schedule?.start ?? "9999";
      return aStart.localeCompare(bStart) || a.id.localeCompare(b.id);
    });
}

export function evidenceForIds(
  ids: Iterable<EvidenceSource["id"]>,
): EvidenceSource[] {
  const pending = [...new Set(ids)];
  const seen = new Set<EvidenceSource["id"]>();
  const evidence: EvidenceSource[] = [];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (seen.has(id)) continue;
    seen.add(id);
    const source = COLLECTOR_EVENT_SOURCE_BY_ID.get(id);
    if (!source) continue;
    evidence.push(source);
    for (const rightsSourceId of source.rights_review.rights_evidence_source_ids) {
      if (!seen.has(rightsSourceId)) pending.push(rightsSourceId);
    }
  }
  return evidence;
}

export function evidenceForEvent(event: CollectorEvent): EvidenceSource[] {
  const ids: EvidenceSource["id"][] = [];
  for (const sourceIds of Object.values(event.field_sources)) ids.push(...sourceIds);
  for (const link of event.public_links) ids.push(link.source_id);
  for (const relation of event.organisation_relations) ids.push(...relation.source_ids);
  for (const conflict of event.conflicts) ids.push(...conflict.source_ids);
  return evidenceForIds(ids);
}

export function evidenceForVenue(venue: CollectorVenue): EvidenceSource[] {
  return evidenceForIds([
    ...Object.values(venue.field_sources).flat(),
    ...venue.public_links.map((link) => link.source_id),
  ]);
}

export function evidenceForOrganisation(
  organisation: CollectorOrganisation,
): EvidenceSource[] {
  return evidenceForIds([
    ...Object.values(organisation.field_sources).flat(),
    ...organisation.public_links.map((link) => link.source_id),
  ]);
}

export function evidenceForEventDetail(event: CollectorEvent): EvidenceSource[] {
  const ids = evidenceForEvent(event).map((source) => source.id);
  if (event.venue_id) {
    const venue = COLLECTOR_VENUE_BY_ID.get(event.venue_id);
    if (venue) ids.push(...evidenceForVenue(venue).map((source) => source.id));
  }
  for (const relation of event.organisation_relations) {
    const organisation = COLLECTOR_ORGANISATION_BY_ID.get(relation.organisation_id);
    if (organisation) {
      ids.push(...evidenceForOrganisation(organisation).map((source) => source.id));
    }
  }
  return evidenceForIds(ids);
}

export function getCollectorEvent(id: string): CollectorEvent | null {
  return COLLECTOR_EVENT_BY_ID.get(id as `evt_${string}`) ?? null;
}

import type { RoomRecord, TrailRecord } from "./types";

const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const PAGE_PATH = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const REGISTERS = new Set(["reference", "interpretation", "personal-account", "experiment"]);
const EDITORIAL_STATES = new Set(["draft", "published", "archived"]);
const PERSONAL_ENTRANCES = new Set(["/account/portfolio", "/account/wishlist"]);

/**
 * Checks authored relationships and safe page entrances. Existence is checked
 * against source in tests, never by crawling pages or invoking their services.
 * This validation does not replace a destination's auth or publication policy.
 */
export function validateRoomDirectory(
  rooms: readonly RoomRecord[],
  trails: readonly TrailRecord[],
): string[] {
  const errors: string[] = [];
  const roomIds = new Set<string>();
  const pageOwners = new Map<string, RoomRecord>();
  const hrefs = new Set<string>();

  const text = (value: string, location: string) => {
    if (!value.trim()) errors.push(`${location} must contain text`);
  };

  for (const room of rooms) {
    if (!ID.test(room.id)) errors.push(`Invalid room ID: ${room.id}`);
    if (roomIds.has(room.id)) errors.push(`Duplicate room ID: ${room.id}`);
    roomIds.add(room.id);
    for (const field of ["title", "taskLabel", "purpose", "introduction"] as const) {
      text(room[field], `${room.id}.${field}`);
    }
    if (!REGISTERS.has(room.register)) errors.push(`Unknown register: ${room.id}`);
    if (!EDITORIAL_STATES.has(room.editorialState)) errors.push(`Unknown editorial state: ${room.id}`);
    if (room.language !== "en") errors.push(`Unsupported authored language: ${room.id}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(room.reviewedAt) || !Number.isFinite(Date.parse(room.reviewedAt))) {
      errors.push(`Invalid review date: ${room.id}`);
    }
    if (room.topics.length === 0 || new Set(room.topics).size !== room.topics.length) {
      errors.push(`Topics must be present and unique: ${room.id}`);
    }
    for (const topic of room.topics) text(topic, `${room.id}.topics`);
    if (!room.pages.some((page) => page.id === room.entryPageId)) {
      errors.push(`Entrance must belong to its room: ${room.id}`);
    }
    for (const page of room.pages) {
      if (!ID.test(page.id)) errors.push(`Invalid page ID: ${page.id}`);
      if (pageOwners.has(page.id)) errors.push(`Duplicate page ID: ${page.id}`);
      pageOwners.set(page.id, room);
      if (hrefs.has(page.href)) errors.push(`Duplicate page destination: ${page.href}`);
      hrefs.add(page.href);
      if (!PAGE_PATH.test(page.href) || /^\/(?:api|admin)(?:\/|$)/.test(page.href)) {
        errors.push(`Page must use an internal reader destination: ${page.id}`);
      }
      if (/^\/account(?:\/|$)/.test(page.href) && !PERSONAL_ENTRANCES.has(page.href)) {
        errors.push(`Personal destination is not a reviewed room entrance: ${page.id}`);
      }
      if (PERSONAL_ENTRANCES.has(page.href) && page.access !== "sign-in") {
        errors.push(`Personal entrance must say sign-in: ${page.id}`);
      }
      if (page.access !== "public" && page.access !== "sign-in") errors.push(`Unknown page access: ${page.id}`);
      for (const field of ["label", "description", "accessDescription"] as const) text(page[field], `${page.id}.${field}`);
    }
  }

  for (const room of rooms) {
    if (new Set(room.relatedRoomIds).size !== room.relatedRoomIds.length) {
      errors.push(`Duplicate related room: ${room.id}`);
    }
    for (const related of room.relatedRoomIds) {
      if (!roomIds.has(related) || related === room.id) errors.push(`Invalid related room: ${room.id} → ${related}`);
    }
  }

  const trailIds = new Set<string>();
  for (const trail of trails) {
    if (!ID.test(trail.id)) errors.push(`Invalid trail ID: ${trail.id}`);
    if (trailIds.has(trail.id)) errors.push(`Duplicate trail ID: ${trail.id}`);
    trailIds.add(trail.id);
    text(trail.title, `${trail.id}.title`);
    text(trail.description, `${trail.id}.description`);
    if (!EDITORIAL_STATES.has(trail.editorialState)) errors.push(`Unknown editorial state: ${trail.id}`);
    if (trail.language !== "en") errors.push(`Unsupported authored language: ${trail.id}`);
    if (trail.stops.length < 2) errors.push(`A trail needs at least two stops: ${trail.id}`);
    const stopIds = new Set<string>();
    for (const stop of trail.stops) {
      if (stopIds.has(stop.pageId)) errors.push(`Repeated trail stop: ${trail.id} → ${stop.pageId}`);
      stopIds.add(stop.pageId);
      const room = pageOwners.get(stop.pageId);
      if (!room) errors.push(`Unknown trail stop: ${trail.id} → ${stop.pageId}`);
      else if (trail.editorialState === "published" && room.editorialState !== "published") {
        errors.push(`Published trail points into an unpublished room: ${trail.id} → ${stop.pageId}`);
      }
      text(stop.why, `${trail.id}.${stop.pageId}.why`);
    }
  }

  return errors;
}

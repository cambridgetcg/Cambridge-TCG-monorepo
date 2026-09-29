import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ROOMS } from "@/content/rooms";
import { TRAILS } from "@/content/trails";
import { getPublicRoomDirectory, projectPublicRoomDirectory } from "./directory";
import type { RoomPage, RoomRecord, TrailRecord } from "./types";
import { validateRoomDirectory } from "./validate";

vi.mock("server-only", () => ({}));

const directory = getPublicRoomDirectory();
const appRoot = fileURLToPath(new URL("../../app/", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

function replaceRoom(id: RoomRecord["id"], change: Partial<RoomRecord>): RoomRecord[] {
  return ROOMS.map((room) => room.id === id ? { ...room, ...change } : room);
}

function replacePage(change: Partial<RoomPage>): RoomRecord[] {
  return replaceRoom("cards", { pages: ROOMS[0].pages.map((page, i) => i === 0 ? { ...page, ...change } : page) });
}

describe("curated room directory", () => {
  it("connects eight purpose-led rooms and three reasoned trails", () => {
    expect(validateRoomDirectory(ROOMS, TRAILS)).toEqual([]);
    expect(directory.rooms.map((room) => room.id)).toEqual(["cards", "collection", "play", "learn", "stories", "community", "sources", "agents"]);
    expect(directory.trails).toHaveLength(3);
    for (const trail of directory.trails) {
      for (const stop of trail.stops) {
        const room = directory.rooms.find((candidate) => candidate.id === stop.roomId)!;
        expect(room.links.find((page) => page.id === stop.pageId)).toMatchObject({
          label: stop.label, href: stop.href, access: stop.access, accessDescription: stop.accessDescription,
        });
        expect(stop.why.trim()).not.toBe("");
      }
    }
  });

  it("points every curated link at a source page without calling services", () => {
    const missing = directory.rooms.flatMap((room) => room.links)
      .filter((page) => !existsSync(path.join(appRoot, page.href.slice(1), "page.tsx")))
      .map((page) => page.href);
    expect(missing).toEqual([]);
  });

  it("keeps contributor module references grounded in existing source", () => {
    const missing = ROOMS.flatMap((room) => room.modulePaths).filter((modulePath) => !existsSync(path.join(repoRoot, modulePath)));
    expect(missing).toEqual([]);
  });

  it("uses available entrances while proposed URLs stay out of the projection", () => {
    expect(directory.rooms.find((room) => room.id === "cards")?.href).toBe("/prices");
    expect(directory.rooms.find((room) => room.id === "collection")?.href).toBe("/account/portfolio");
    expect(directory.rooms.find((room) => room.id === "learn")?.href).toBe("/guides");
    expect(directory.rooms.find((room) => room.id === "sources")?.href).toBe("/data");
    const links = directory.rooms.flatMap((room) => room.links.map((page) => page.href));
    for (const proposed of ["/cards", "/collection", "/learn", "/sources"]) expect(links).not.toContain(proposed);
  });

  it("carries sign-in requirements into collection entrances and trail stops", () => {
    expect(directory.rooms.find((room) => room.id === "collection")?.access).toBe("sign-in");
    for (const stop of directory.trails.flatMap((trail) => trail.stops).filter((stop) => stop.roomId === "collection")) {
      expect(stop.access).toBe("sign-in");
      expect(stop.accessDescription).toContain("existing account");
    }
  });

  it("selects public fields explicitly at room, page, trail and stop levels", () => {
    const contributorMarker = "INTERNAL_TEST_CONTEXT_DO_NOT_PUBLISH";
    const rooms = ROOMS.map((room) => ({
      ...room,
      internalNotes: contributorMarker,
      modulePaths: [contributorMarker],
      proposedCanonicalPath: "/unpublished-path" as const,
      pages: room.pages.map((page) => ({ ...page, internalNotes: contributorMarker })),
    }));
    const trails = TRAILS.map((trail) => ({
      ...trail,
      internalNotes: contributorMarker,
      stops: trail.stops.map((stop) => ({ ...stop, internalNotes: contributorMarker })),
    }));
    const projected = JSON.parse(JSON.stringify(projectPublicRoomDirectory(rooms, trails)));
    expect(JSON.stringify(projected)).not.toContain(contributorMarker);
    expect(JSON.stringify(projected)).not.toContain("unpublished-path");
    expect(projected.rooms[0]).not.toHaveProperty("editorialState");
    expect(projected.rooms[0]).not.toHaveProperty("reviewedAt");
    expect(Object.keys(projected.rooms[0].links[0]).sort()).toEqual(["access", "accessDescription", "description", "href", "id", "label"]);
  });

  it("omits unpublished rooms, trails and related-room references", () => {
    const rooms = replaceRoom("stories", { editorialState: "draft" });
    const trails: TrailRecord[] = TRAILS.map((trail, i) => i === 0 ? { ...trail, editorialState: "archived" } : trail);
    const projected = projectPublicRoomDirectory(rooms, trails);
    expect(projected.rooms.map((room) => room.id)).not.toContain("stories");
    expect(projected.rooms.flatMap((room) => room.relatedRoomIds)).not.toContain("stories");
    expect(projected.trails.map((trail) => trail.id)).not.toContain("identify-a-card");
  });

  it("resolves a trail's destination from the page record after a URL change", () => {
    const rooms = replaceRoom("learn", { pages: ROOMS[3].pages.map((page) => page.id === "learn.read-card" ? { ...page, href: "/guides/reading-a-card" } : page) });
    const projected = projectPublicRoomDirectory(rooms, TRAILS);
    expect(projected.trails[0].stops[0].href).toBe("/guides/reading-a-card");
  });
});

describe("room directory validation", () => {
  it.each([
    "https://example.com", "//example.com", "/prices?token=example", "/prices#private", "/../admin", "/api/v1/manifest", "/admin", "/account/agents", "/account/portfolio/item-123",
  ])("rejects an unreviewed or unsafe page entrance: %s", (href) => {
    expect(validateRoomDirectory(replacePage({ href: href as `/${string}` }), TRAILS).length).toBeGreaterThan(0);
  });

  it("rejects account entrances that hide their sign-in requirement", () => {
    const rooms = replaceRoom("collection", { pages: ROOMS[1].pages.map((page) => ({ ...page, access: "public" })) });
    expect(validateRoomDirectory(rooms, TRAILS)).toContain("Personal entrance must say sign-in: collection.portfolio");
  });

  it("rejects duplicate IDs and page destinations", () => {
    const errors = validateRoomDirectory([...ROOMS, ROOMS[0]], [...TRAILS, TRAILS[0]]);
    expect(errors).toContain("Duplicate room ID: cards");
    expect(errors).toContain("Duplicate page ID: cards.browse");
    expect(errors).toContain("Duplicate page destination: /prices");
    expect(errors).toContain("Duplicate trail ID: identify-a-card");
  });

  it("rejects missing entrances and relationships", () => {
    expect(validateRoomDirectory(replaceRoom("cards", { entryPageId: "sources.directory", relatedRoomIds: ["cards"] }), TRAILS))
      .toEqual(expect.arrayContaining(["Entrance must belong to its room: cards", "Invalid related room: cards → cards"]));
  });

  it("rejects a trail with no explanation or an unknown destination", () => {
    const trails: TrailRecord[] = [{ ...TRAILS[0], stops: [{ pageId: "missing.page", why: " " }] }];
    expect(validateRoomDirectory(ROOMS, trails)).toEqual(expect.arrayContaining([
      "A trail needs at least two stops: identify-a-card",
      "Unknown trail stop: identify-a-card → missing.page",
      "identify-a-card.missing.page.why must contain text",
    ]));
  });

  it("fails closed when a published trail would expose an unpublished room", () => {
    const rooms = replaceRoom("learn", { editorialState: "draft" });
    expect(() => projectPublicRoomDirectory(rooms, TRAILS)).toThrow("Published trail points into an unpublished room");
  });

  it("rejects repeated trail stops and blank introductory copy", () => {
    const trails: TrailRecord[] = [{ ...TRAILS[0], stops: [TRAILS[0].stops[0], TRAILS[0].stops[0]] }];
    const errors = validateRoomDirectory(replaceRoom("cards", { introduction: " " }), trails);
    expect(errors).toContain("cards.introduction must contain text");
    expect(errors).toContain("Repeated trail stop: identify-a-card → learn.read-card");
  });
});

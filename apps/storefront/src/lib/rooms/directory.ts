import "server-only";
import { ROOMS } from "@/content/rooms";
import { TRAILS } from "@/content/trails";
import type { PublicRoomDirectory, RoomPage, RoomRecord, TrailRecord } from "./types";
import { validateRoomDirectory } from "./validate";

function publicPage(page: RoomPage): RoomPage {
  // Select every field explicitly: later contributor metadata must not leak.
  return {
    id: page.id,
    label: page.label,
    href: page.href,
    description: page.description,
    access: page.access,
    accessDescription: page.accessDescription,
  };
}

/** Pure projection of trusted authored content. No filesystem, network or DB reads. */
export function projectPublicRoomDirectory(
  rooms: readonly RoomRecord[],
  trails: readonly TrailRecord[],
): PublicRoomDirectory {
  const errors = validateRoomDirectory(rooms, trails);
  if (errors.length) throw new Error(`Invalid room directory:\n${errors.join("\n")}`);

  const publishedRooms = rooms.filter((room) => room.editorialState === "published");
  const publishedIds = new Set(publishedRooms.map((room) => room.id));
  const pages = new Map(publishedRooms.flatMap((room) => room.pages.map((page) => [page.id, { page, roomId: room.id }] as const)));

  return {
    schema: "cambridgetcg.rooms/1",
    language: "en",
    rooms: publishedRooms.map((room) => {
      // Validated above: the entrance exists and belongs to this room.
      const entrance = pages.get(room.entryPageId)!.page;
      return {
        id: room.id,
        title: room.title,
        taskLabel: room.taskLabel,
        purpose: room.purpose,
        introduction: room.introduction,
        topics: [...room.topics],
        register: room.register,
        language: room.language,
        href: entrance.href,
        access: entrance.access,
        accessDescription: entrance.accessDescription,
        relatedRoomIds: room.relatedRoomIds.filter((id) => publishedIds.has(id)),
        links: room.pages.map(publicPage),
      };
    }),
    trails: trails.filter((trail) => trail.editorialState === "published").map((trail) => ({
      id: trail.id,
      title: trail.title,
      description: trail.description,
      language: trail.language,
      stops: trail.stops.map((stop) => {
        const { page, roomId } = pages.get(stop.pageId)!;
        return {
          roomId,
          pageId: page.id,
          label: page.label,
          href: page.href,
          why: stop.why,
          access: page.access,
          accessDescription: page.accessDescription,
        };
      }),
    })),
  };
}

export function getPublicRoomDirectory(): PublicRoomDirectory {
  return projectPublicRoomDirectory(ROOMS, TRAILS);
}

export type { PublicRoom, PublicRoomDirectory, PublicTrail, PublicTrailStop } from "./types";

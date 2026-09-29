import { getPublicRoomDirectory } from "@/lib/rooms/directory";
import { jsonResponse } from "@/lib/data-pantry";

/** Curated navigation only. No account, provider or catalogue requests. */
export function GET() {
  return jsonResponse({
    data: getPublicRoomDirectory(),
    endpoint: "/api/v1/rooms",
    sources: ["authored_room_directory"],
    freshness: "methodology",
    as_of: "2026-09-29T00:00:00.000Z",
    license: "NOASSERTION",
  });
}

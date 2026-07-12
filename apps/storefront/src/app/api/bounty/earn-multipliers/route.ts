import { NextResponse } from "next/server";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";

// This used to preview PVE earnings. PVE rewards are paused, so this route
// now reports that boundary before auth or database reads.
export async function GET() {
  return NextResponse.json(
    { error: PVE_AVAILABILITY.reason, ...PVE_AVAILABILITY, eligible: false },
    {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

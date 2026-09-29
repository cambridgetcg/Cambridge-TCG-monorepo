import { NextResponse } from "next/server";
import { standardsManifest } from "@/lib/contracts/standards";

/** Static specification registry; no catalog or provider availability lookup. */
export function GET(): NextResponse {
  return NextResponse.json(standardsManifest(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    },
  });
}

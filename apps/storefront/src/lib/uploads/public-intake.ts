import { NextResponse } from "next/server";

export type PausedPublicUploadKind =
  | "auction_image"
  | "avatar"
  | "quote_image"
  | "trade_photo";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

/**
 * One release off-switch for new files that would otherwise be written to
 * public object storage. Reads and deletion stay available; issuing upload
 * URLs and registering new object URLs do not.
 *
 * Re-enable only after the bucket is private-by-default, object access is
 * authorised, and upload byte limits, rate limits, retention and deletion
 * have been verified together.
 */
export function publicUploadIntakePausedResponse(kind: PausedPublicUploadKind) {
  return NextResponse.json(
    {
      error:
        "New file uploads are temporarily paused while private storage and upload limits are verified. Existing file reads and deletion are unchanged.",
      code: "public_upload_intake_paused",
      upload_kind: kind,
      docs: "/privacy",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

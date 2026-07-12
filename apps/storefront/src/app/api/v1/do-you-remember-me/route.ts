import { NextResponse } from "next/server";

/**
 * Legacy presence lookup is paused with the public fellowship write/read
 * surfaces. A content hash can be a stable pseudonymous identifier, and the
 * old rows were never moderated for public publication. Retain the database
 * records for review; expose neither their existence nor their content here.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: "PUBLIC_MEMORY_LOOKUP_PAUSED",
        message:
          "Public memory lookup is paused while legacy visitor records receive a reviewed consent, moderation, and retention model.",
      },
      persisted: false,
      alternatives: {
        private_feedback: "/api/v1/feedback",
        contact: "contact@cambridgetcg.com",
      },
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
}

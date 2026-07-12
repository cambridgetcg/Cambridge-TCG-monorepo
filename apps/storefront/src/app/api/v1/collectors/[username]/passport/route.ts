import { NextResponse } from "next/server";
import { getPublishedPassport } from "@/lib/collector-passport/db";
import { collectorPassportPublicUrl } from "@/lib/collector-passport/public";

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
  "X-Content-License": "NOASSERTION",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function json(body: unknown, status: number = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PUBLIC_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: rawUsername } = await params;
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(username)) {
    return json({ error: "Collector Passport not found." }, 404);
  }

  try {
    const passport = await getPublishedPassport(username);
    if (!passport) {
      // Private profiles, suspended profiles, unknown handles, withdrawn
      // Passports, and profiles without current receipts are deliberately
      // indistinguishable.
      return json({ error: "Collector Passport not found." }, 404);
    }

    return json({
      schema: "cambridge.collector-passport/1",
      passport,
      publication: {
        basis: "explicit current per-item publication by the collector",
        verification: "self_attested_unverified",
        license: "NOASSERTION",
        terms_url: collectorPassportPublicUrl("/licenses/collector-passport-public-display-v1"),
        methodology_url: collectorPassportPublicUrl("/methodology/collector-passport"),
        reuse:
          "Public access is not a downstream reuse grant. Re-fetch for current display and honour withdrawal.",
        correction_url: collectorPassportPublicUrl(`/contact?topic=collector-passport&collector=${encodeURIComponent(passport.username)}`),
      },
      does_not_include: [
        "No SKU or catalog membership assertion.",
        "No separate structured or automatically copied catalog, holding, image, cost, value, note, or internal-id fields.",
        "Collector-authored label and story may mention cards; those words remain self-attested and unverified.",
        "No proof of ownership or authenticity.",
      ],
    });
  } catch (error) {
    console.error("[collector-passport] public read failed", {
      event: "collector_passport_public_read_unavailable",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Collector Passport is temporarily unavailable." }, 503);
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS });
}

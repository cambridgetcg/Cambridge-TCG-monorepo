import { NextResponse } from "next/server";

function paused(): Response {
  return NextResponse.json(
    {
      error: { code: "PUBLIC_LOTS_PAUSED", message: "Public lot listing and intake are paused while seller privacy, publication consent, and bounded content rules are rebuilt." },
      queried: false,
      accepted: false,
      does_not_include: ["seller identifiers, names, profiles, or trust scores", "private or suspended profiles", "lot titles, descriptions, images, items, prices, or status probes"],
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
  );
}

export async function GET(): Promise<Response> { return paused(); }
export async function POST(): Promise<Response> { return paused(); }

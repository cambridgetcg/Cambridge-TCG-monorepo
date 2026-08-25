import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { waitForMagicLinkResponseFloor } from "@/lib/auth/admission";

// The OAuth callback (GET /api/auth/callback/google) exchanges the code with
// Google AND, for a first-time user, runs createUser + linkAccount +
// createSession — several DB writes plus an outbound call, often on a cold
// function. Headroom keeps a cold callback from timing out into an empty
// response after it has already half-committed the sign-in.
export const maxDuration = 30;

export const GET = handlers.GET;

export async function POST(request: NextRequest): Promise<Response> {
  const isMagicLinkRequest =
    request.nextUrl.pathname === "/api/auth/signin/email";
  const startedAt = isMagicLinkRequest ? performance.now() : 0;

  try {
    // Admission and capacity decisions live inside Auth.js's email signIn
    // callback so every denial can use Auth.js's ordinary success response.
    return await handlers.POST(request);
  } finally {
    if (isMagicLinkRequest) {
      await waitForMagicLinkResponseFloor(startedAt);
    }
  }
}

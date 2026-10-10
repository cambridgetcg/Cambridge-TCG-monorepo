import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { waitForMagicLinkResponseFloor } from "@/lib/auth/admission";
import {
  addGitHubVerificationHeaders,
  addSupportIdToGitHubFailureRedirect,
  recordAuthJsErrorType,
  recordGitHubVerificationEvent,
  withGitHubVerificationAttempt,
} from "@/lib/auth/verification-observer";

// OAuth callbacks (GET /api/auth/callback/google or /github) exchange the code
// with the provider AND, for an admitted first-time user, run createUser + linkAccount +
// createSession — several DB writes plus an outbound call, often on a cold
// function. Headroom keeps a cold callback from timing out into an empty
// response after it has already half-committed the sign-in.
export const maxDuration = 30;

function isGitHubSignIn(request: NextRequest): boolean {
  return request.nextUrl.pathname === "/api/auth/signin/github";
}

function isGitHubCallback(request: NextRequest): boolean {
  return request.nextUrl.pathname === "/api/auth/callback/github";
}

function isProviderDiscovery(request: NextRequest): boolean {
  return request.nextUrl.pathname === "/api/auth/providers";
}

function observeGitHubCallbackResponse(request: NextRequest, response: Response): Response {
  try {
    const location = response.headers.get("location");
    if (location) {
      const redirect = new URL(location, request.url);
      const errorType = (redirect.pathname === "/login" || redirect.pathname === "/login/error")
        ? redirect.searchParams.get("error")
        : null;
      if (errorType) recordAuthJsErrorType(errorType);
      else recordGitHubVerificationEvent("response_observed");
    } else {
      recordAuthJsErrorType(undefined);
    }
  } catch {
    recordAuthJsErrorType(undefined);
  }

  const decorated = addGitHubVerificationHeaders(response, { includeSupportId: true });
  return addSupportIdToGitHubFailureRedirect(request, decorated);
}

export async function GET(request: NextRequest): Promise<Response> {
  // A credential-free preflight begins with Auth.js provider discovery. It gets
  // only safe build/check headers: no attempt, observer scope or support ID.
  if (isProviderDiscovery(request)) return addGitHubVerificationHeaders(await handlers.GET(request));
  if (!isGitHubCallback(request)) return handlers.GET(request);

  return withGitHubVerificationAttempt("callback", async () => {
    try {
      return observeGitHubCallbackResponse(request, await handlers.GET(request));
    } catch (error) {
      recordAuthJsErrorType(undefined);
      throw error;
    }
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const isMagicLinkRequest =
    request.nextUrl.pathname === "/api/auth/signin/email";
  const startedAt = isMagicLinkRequest ? performance.now() : 0;

  try {
    // Admission and capacity decisions live inside Auth.js's email signIn
    // callback so every denial can use Auth.js's ordinary success response.
    if (!isGitHubSignIn(request)) return await handlers.POST(request);
    return withGitHubVerificationAttempt("signin", async () => (
      addGitHubVerificationHeaders(await handlers.POST(request))
    ));
  } finally {
    if (isMagicLinkRequest) {
      await waitForMagicLinkResponseFloor(startedAt);
    }
  }
}

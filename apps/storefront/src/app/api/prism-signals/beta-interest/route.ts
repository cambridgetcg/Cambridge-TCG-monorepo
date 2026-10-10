import { auth } from "@/lib/auth";
import {
  deletePrismSignalsBetaInterest,
  getPrismSignalsBetaInterest,
  upsertPrismSignalsBetaInterest,
} from "@/lib/prism-signals/beta-interest.server";
import { prismSignalsBetaIntakeEnabled } from "@/lib/prism-signals/beta-interest-config.server";
import {
  parsePrismSignalsBetaInterestInput,
  type PrismSignalsBetaDeleteResponse,
  type PrismSignalsBetaInterestResponse,
} from "@/lib/prism-signals/beta-interest";
import {
  betaError,
  betaJson,
  betaRequestErrorResponse,
  readExactJson,
  requireEmptyBody,
  requireSameOrigin,
} from "./http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailable() {
  return betaError(
    "beta_unavailable",
    "The PRISM Signals closed-beta request store is not available here.",
    503,
  );
}

function unauthenticated() {
  return betaError(
    "authentication_required",
    "Sign in to inspect or change your own PRISM Signals beta request.",
    401,
  );
}

export async function GET() {
  try {
    // Authorization is repeated in every handler, immediately before its DAL
    // operation. Proxy cookie presence is not treated as authority.
    const session = await auth();
    if (!session?.user?.id) return unauthenticated();
    const interest = await getPrismSignalsBetaInterest(session.user.id);
    return betaJson<PrismSignalsBetaInterestResponse>({ interest });
  } catch (error) {
    console.error(
      "[prism-signals/beta-interest GET] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!prismSignalsBetaIntakeEnabled()) {
    return betaError(
      "beta_unavailable",
      "New PRISM Signals closed-beta interest intake is paused.",
      503,
    );
  }

  try {
    requireSameOrigin(request);
    const input = parsePrismSignalsBetaInterestInput(
      await readExactJson(request),
    );
    const session = await auth();
    if (!session?.user?.id) return unauthenticated();
    const interest = await upsertPrismSignalsBetaInterest(
      session.user.id,
      input,
    );
    return betaJson<PrismSignalsBetaInterestResponse>({ interest });
  } catch (error) {
    const requestError = betaRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error(
      "[prism-signals/beta-interest POST] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return unavailable();
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireEmptyBody(request);
    const session = await auth();
    if (!session?.user?.id) return unauthenticated();
    const deleted = await deletePrismSignalsBetaInterest(session.user.id);
    return betaJson<PrismSignalsBetaDeleteResponse>({ deleted });
  } catch (error) {
    const requestError = betaRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error(
      "[prism-signals/beta-interest DELETE] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return unavailable();
  }
}

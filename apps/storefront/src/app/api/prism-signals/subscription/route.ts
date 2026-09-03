import { auth } from "@/lib/auth";
import {
  prismStripeSandboxPublicPosture,
  readPrismStripeOwnerStatus,
} from "@/lib/prism-signals/stripe";
import {
  prismStripeError,
  prismStripeJson,
} from "../stripe/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return prismStripeError(
        "authentication_required",
        "Sign in to inspect your own PRISM Signals subscription.",
        401,
      );
    }

    const posture = prismStripeSandboxPublicPosture();
    const status = await readPrismStripeOwnerStatus({
      userId: session.user.id,
      evaluatedAt: new Date().toISOString(),
      posture,
    });
    return prismStripeJson(status);
  } catch (error) {
    console.error(
      "[prism-signals/subscription GET] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return prismStripeError(
      "subscription_unavailable",
      "Your PRISM Signals subscription status is not available right now.",
      503,
    );
  }
}
